import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/server-auth";

function safeServerError(e: any) {
  const message = String(e?.message || "");
  const code = String(e?.code || "");

  if (message.includes("Firebase Admin não configurado")) {
    return "Firebase Admin não está configurado corretamente na Vercel.";
  }
  if (code.includes("auth/invalid-credential") || code.includes("app/invalid-credential")) {
    return "As credenciais do Firebase Admin estão inválidas.";
  }
  if (message.includes("DECODER routines") || message.includes("private key")) {
    return "A chave privada do Firebase Admin está inválida ou com quebra de linha incorreta.";
  }
  return "Não foi possível atualizar o usuário.";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const actor = await requireAdmin(req);
    const { uid } = await params;
    const body = await req.json();

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    const details: Record<string, any> = {};

    if (typeof body.active === "boolean") {
      if (uid === actor.uid && body.active === false) {
        return Response.json({ error: "Você não pode bloquear seu próprio acesso." }, { status: 400 });
      }
      await adminAuth().updateUser(uid, { disabled: !body.active });
      updates.active = body.active;
      details.active = body.active;
    }

    if (typeof body.department === "string") {
      const department = body.department.trim();
      if (!department) {
        return Response.json({ error: "Departamento inválido." }, { status: 400 });
      }
      updates.department = department;
      details.department = department;
    }

    if (Object.keys(details).length === 0) {
      return Response.json({ error: "Nenhuma alteração válida." }, { status: 400 });
    }

    // Merge is intentionally used here instead of update().
    // It avoids a hard failure if the target profile document needs to be recreated.
    await adminDb().collection("users").doc(uid).set(updates, { merge: true });

    // Audit must never prevent the actual user update from succeeding.
    adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || "Administrador",
      userEmail: actor.email || "",
      action: "USER_UPDATED",
      targetId: uid,
      details,
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => undefined);

    return Response.json({ ok: true });
  } catch (e: any) {
    const status =
      e?.message === "UNAUTHORIZED" ? 401 :
      e?.message === "FORBIDDEN" ? 403 :
      500;

    return Response.json({
      error: status === 500 ? safeServerError(e) : "Você não tem permissão para realizar esta alteração.",
      code: e?.code || undefined,
    }, { status });
  }
}
