import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isPortalDeveloperUid } from "@/lib/access-control";
import { isDeveloper, requireAdmin } from "@/lib/server-auth";
import { safeServerError as technicalError } from "@/lib/server-error";

export const runtime = "nodejs";

const ROLES = new Set(["admin", "atendente", "consulta"]);

function safeServerError(e: any) {
  const message = String(e?.message || "");
  const code = String(e?.code || "");

  if (message.includes("Firebase Admin não configurado")) return "Firebase Admin não está configurado corretamente na Vercel.";
  if (code.includes("auth/email-already-exists")) return "Este e-mail já está sendo utilizado por outro usuário.";
  if (code.includes("auth/invalid-email")) return "O e-mail informado é inválido.";
  if (code.includes("auth/invalid-password")) return "A nova senha precisa atender aos requisitos do Firebase.";
  if (code.includes("auth/invalid-credential") || code.includes("app/invalid-credential")) return "As credenciais do Firebase Admin estão inválidas.";
  if (message.includes("DECODER routines") || message.includes("private key")) return "A chave privada do Firebase Admin está inválida ou com quebra de linha incorreta.";
  return "Não foi possível atualizar o usuário.";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const actor = await requireAdmin(req);
    const { uid } = await params;
    const body = await req.json();
    const actorIsDeveloper = isDeveloper(actor);
    const targetIsDeveloper = isPortalDeveloperUid(uid);

    // A conta do Desenvolvedor é protegida: nenhum Administrador pode alterá-la.
    if (targetIsDeveloper && actor.uid !== uid) {
      return Response.json({ error: "O acesso do Desenvolvedor é protegido e não pode ser alterado por outro usuário." }, { status: 403 });
    }

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    const details: Record<string, any> = {};
    const authUpdates: Record<string, any> = {};

    if (typeof body.active === "boolean") {
      if (uid === actor.uid && body.active === false) return Response.json({ error: "Você não pode bloquear seu próprio acesso." }, { status: 400 });
      if (targetIsDeveloper) return Response.json({ error: "O acesso do Desenvolvedor não pode ser bloqueado." }, { status: 400 });
      authUpdates.disabled = !body.active;
      updates.active = body.active;
      details.active = body.active;
    }

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 2) return Response.json({ error: "Nome inválido." }, { status: 400 });
      authUpdates.displayName = name;
      updates.name = name;
      details.name = name;
    }

    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "E-mail inválido." }, { status: 400 });
      authUpdates.email = email;
      updates.email = email;
      details.email = email;
    }

    if (typeof body.role === "string") {
      const role = body.role.trim();
      if (role === "desenvolvedor") return Response.json({ error: "O nível Desenvolvedor é exclusivo e não pode ser atribuído pela interface." }, { status: 400 });
      if (!ROLES.has(role)) return Response.json({ error: "Perfil de acesso inválido." }, { status: 400 });
      if (targetIsDeveloper) return Response.json({ error: "O nível Desenvolvedor é fixo e não pode ser alterado." }, { status: 400 });
      if (uid === actor.uid && role !== "admin" && !actorIsDeveloper) return Response.json({ error: "Você não pode remover seu próprio perfil de administrador." }, { status: 400 });
      updates.role = role;
      details.role = role;
    }

    if (typeof body.department === "string") {
      const department = body.department.trim();
      if (!department) return Response.json({ error: "Departamento inválido." }, { status: 400 });
      updates.department = department;
      details.department = department;
    }

    if (typeof body.cpf === "string" && body.cpf.trim()) {
      const cpf = body.cpf.replace(/\D/g, "");
      if (cpf.length !== 11) return Response.json({ error: "O novo CPF precisa ter 11 dígitos." }, { status: 400 });
      authUpdates.password = cpf;
      updates.cpfLast4 = cpf.slice(-4);
      details.passwordReset = true;
    }

    if (Object.keys(details).length === 0) return Response.json({ error: "Nenhuma alteração válida." }, { status: 400 });

    if (Object.keys(authUpdates).length > 0) await adminAuth().updateUser(uid, authUpdates);
    await adminDb().collection("users").doc(uid).set(updates, { merge: true });

    adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || (actorIsDeveloper ? "Desenvolvedor" : "Administrador"),
      userEmail: actor.email || "",
      action: "USER_UPDATED",
      targetId: uid,
      details,
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => undefined);

    return Response.json({ ok: true });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = technicalError(e);
    return Response.json({
      error: status === 500 ? safeServerError(e) : "Você não tem permissão para realizar esta alteração.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
