import crypto from "node:crypto";

function key() {
  const raw = process.env.VTCALL_CREDENTIALS_ENCRYPTION_KEY || "";
  if (!raw) throw new Error("VTCALL_CREDENTIALS_ENCRYPTION_KEY não configurada.");
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {}
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [version, ivB64, tagB64, dataB64] = String(payload || "").split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Credencial inválida.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
