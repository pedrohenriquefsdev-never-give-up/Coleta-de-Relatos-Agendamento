import { runtimeEnv } from "@/lib/runtime-env";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isDeveloper, requireUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireUser(req);

    const cloudName = runtimeEnv("CLOUDINARY_CLOUD_NAME").trim();
    const apiKey = runtimeEnv("CLOUDINARY_API_KEY").trim();
    const apiSecret = runtimeEnv("CLOUDINARY_API_SECRET").trim();
    if (!cloudName || !apiKey || !apiSecret) return Response.json({ error: "Cloudinary não configurado" }, { status: 500 });
    if (cloudName.toLowerCase() === "root" || /[\/\s]/.test(cloudName) || cloudName.includes("cloudinary.com")) {
      return Response.json({
        error: `CLOUDINARY_CLOUD_NAME está incorreto (${cloudName}). Use o Cloud name da sua conta Cloudinary, não o nome de uma pasta como Root.`,
      }, { status: 503 });
    }

    const data = await req.formData();
    const file = data.get("file");
    const requestedTargetUid = String(data.get("targetUid") || "").trim();
    const targetUid = requestedTargetUid || actor.uid;

    // Todos podem trocar a própria foto. Somente o Desenvolvedor pode trocar a foto de outra conta.
    if (targetUid !== actor.uid && !isDeveloper(actor)) {
      return Response.json({ error: "Somente o Desenvolvedor pode alterar a foto de outro usuário." }, { status: 403 });
    }

    const targetSnap = await adminDb().collection("users").doc(targetUid).get();
    if (!targetSnap.exists) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

    if (!(file instanceof File)) return Response.json({ error: "Arquivo inválido" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "Envie um arquivo de imagem." }, { status: 400 });

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "portal-coleta-relatos/perfis";
    const publicId = `perfil_${targetUid}`;
    const signatureBase = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash("sha1").update(signatureBase).digest("hex");

    const upload = new FormData();
    upload.append("file", file);
    upload.append("api_key", apiKey);
    upload.append("timestamp", String(timestamp));
    upload.append("folder", folder);
    upload.append("public_id", publicId);
    upload.append("overwrite", "true");
    upload.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: upload });
    const payload = await response.json();
    if (!response.ok || !payload.secure_url) return Response.json({ error: payload.error?.message || "Falha no upload" }, { status: 500 });

    await adminDb().collection("users").doc(targetUid).set({
      photoUrl: payload.secure_url,
      updatedAt: new Date(),
    }, { merge: true });

    const target = targetSnap.data() || {};
    adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || "Usuário",
      userEmail: actor.email || "",
      action: targetUid === actor.uid ? "PROFILE_PHOTO_UPDATED" : "USER_PHOTO_UPDATED_BY_DEVELOPER",
      targetId: targetUid,
      details: targetUid === actor.uid ? {} : { targetUserName: target.name || target.email || targetUid },
      createdAt: new Date(),
    }).catch(() => undefined);

    return Response.json({ ok: true, url: payload.secure_url, targetUid });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const message = String(e?.message || "");
    const error =
      status === 401 ? "Não autorizado" :
      status === 403 ? "Acesso bloqueado" :
      message.includes("Firebase Admin não configurado") ? message :
      message.includes("PRIVATE_KEY") || message.includes("private key") || message.includes("DECODER routines")
        ? "A chave privada do Firebase Admin está inválida ou foi colada com formatação incorreta na Vercel."
        : "Não foi possível enviar a imagem.";
    return Response.json({
      error,
      code: e?.code || undefined,
      technical: status === 500 ? String(e?.message || "").slice(0, 400) : undefined,
    }, { status });
  }
}
