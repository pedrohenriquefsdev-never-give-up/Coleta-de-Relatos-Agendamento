import { runtimeEnv } from "@/lib/runtime-env";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const header = req.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return Response.json({ error: "Não autorizado" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(header.slice(7));
    const user = await adminDb().collection("users").doc(decoded.uid).get();
    if (!user.exists || user.data()?.active === false) return Response.json({ error: "Acesso bloqueado" }, { status: 403 });

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
    if (!(file instanceof File)) return Response.json({ error: "Arquivo inválido" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "Envie um arquivo de imagem." }, { status: 400 });

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "portal-coleta-relatos/perfis";
    const publicId = `perfil_${decoded.uid}`;
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

    await adminDb().collection("users").doc(decoded.uid).set({
      photoUrl: payload.secure_url,
      updatedAt: new Date(),
    }, { merge: true });

    adminDb().collection("auditLogs").add({
      userId: decoded.uid,
      userName: user.data()?.name || user.data()?.email || "Usuário",
      userEmail: user.data()?.email || "",
      action: "PROFILE_PHOTO_UPDATED",
      createdAt: new Date(),
    }).catch(() => undefined);

    return Response.json({ ok: true, url: payload.secure_url });
  } catch (e: any) {
    const message = String(e?.message || "");
    const error =
      message.includes("Firebase Admin não configurado")
        ? message
        : message.includes("PRIVATE_KEY") || message.includes("private key") || message.includes("DECODER routines")
          ? "A chave privada do Firebase Admin está inválida ou foi colada com formatação incorreta na Vercel."
          : "Não foi possível enviar a imagem.";
    return Response.json({
      error,
      code: e?.code || undefined,
      technical: String(e?.message || "").slice(0, 400),
    }, { status: 500 });
  }
}
