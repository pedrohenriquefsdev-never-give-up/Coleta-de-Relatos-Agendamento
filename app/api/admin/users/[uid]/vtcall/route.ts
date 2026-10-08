import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { encryptSecret, decryptSecret } from "@/lib/vtcall-crypto";
import { requireAdmin } from "@/lib/server-auth";

function clean(body: any) {
  const host = String(body.host || "").trim();
  const extension = String(body.extension || "").trim();
  const password = String(body.password || "");
  const port = Number(body.port || 5068);
  const transport = String(body.transport || "UDP").toUpperCase();
  if (!host || !extension || !Number.isFinite(port) || port < 1 || port > 65535 || !["UDP", "TCP", "TLS"].includes(transport)) {
    throw new Error("INVALID");
  }
  return { host, extension, password, port, transport };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
    const { uid } = await params;
    const snap = await adminDb().collection("vtcallCredentials").doc(uid).get();
    if (!snap.exists) return Response.json({ configured: false, host: "", extension: "", password: "", port: 5068, transport: "UDP" });
    const data = snap.data() || {};
    return Response.json({
      configured: true,
      host: data.host || "",
      extension: data.extension || "",
      password: data.passwordEncrypted ? decryptSecret(data.passwordEncrypted) : "",
      port: data.port || 5068,
      transport: data.transport || "UDP",
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    return Response.json({ error: "Não foi possível carregar a configuração." }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const actor = await requireAdmin(req);
    const { uid } = await params;
    const body = await req.json();
    const value = clean(body);
    if (!value.password) return Response.json({ error: "Informe a senha do ramal." }, { status: 400 });

    await adminDb().collection("vtcallCredentials").doc(uid).set({
      host: value.host,
      extension: value.extension,
      passwordEncrypted: encryptSecret(value.password),
      port: value.port,
      transport: value.transport,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    }, { merge: true });

    await adminDb().collection("users").doc(uid).update({
      vtcallConfigured: true,
      vtcallExtension: value.extension,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name,
      userEmail: actor.email,
      action: "VTCALL_CREDENTIALS_UPDATED",
      targetId: uid,
      details: { extension: value.extension, host: value.host },
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ ok: true });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : e?.message === "INVALID" ? 400 : 500;
    const message =
      status === 400
        ? "Configuração VTCall inválida."
        : String(e?.message || "").includes("VTCALL_CREDENTIALS_ENCRYPTION_KEY")
          ? "A chave de criptografia do VTCall ainda não foi configurada na Vercel."
          : "Não foi possível salvar a configuração.";
    return Response.json({ error: message }, { status });
  }
}
