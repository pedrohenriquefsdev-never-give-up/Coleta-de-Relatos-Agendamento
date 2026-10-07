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

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return Response.json({ error: "Cloudinary não configurado" }, { status: 500 });

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

    return Response.json({ url: payload.secure_url });
  } catch {
    return Response.json({ error: "Não foi possível enviar a imagem." }, { status: 500 });
  }
}
