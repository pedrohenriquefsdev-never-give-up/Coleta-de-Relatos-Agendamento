import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin(req);
    const body = await req.json();
    const cpf = String(body.cpf || "").replace(/\D/g, "");

    // O nível Desenvolvedor é exclusivo e nunca pode ser criado pela interface.
    if (!body.name || !body.email || !body.department || cpf.length !== 11 || !["admin", "atendente", "consulta"].includes(body.role)) {
      return Response.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const created = await adminAuth().createUser({
      email: String(body.email).trim().toLowerCase(),
      password: cpf,
      displayName: String(body.name),
      disabled: false,
    });

    await adminDb().collection("users").doc(created.uid).set({
      uid: created.uid,
      name: String(body.name),
      email: String(body.email).trim().toLowerCase(),
      role: body.role,
      department: String(body.department).trim(),
      active: true,
      cpfLast4: cpf.slice(-4),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
    });

    await adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name,
      userEmail: actor.email,
      action: "USER_CREATED",
      targetId: created.uid,
      details: { createdUserName: body.name, role: body.role, department: String(body.department).trim() },
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ uid: created.uid });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    return Response.json({
      error: e?.code === "auth/email-already-exists" ? "Este e-mail já possui usuário." : "Não foi possível criar o usuário.",
    }, { status });
  }
}
