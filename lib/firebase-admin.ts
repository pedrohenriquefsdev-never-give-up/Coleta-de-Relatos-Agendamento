import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function clean(value?: string) {
  if (!value) return "";
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function normalizePrivateKey(value?: string) {
  let v = clean(value);
  if (!v) return "";

  // Supports values pasted with literal \n in Vercel.
  v = v.replace(/\\n/g, "\n");

  // Also supports a base64-encoded PEM.
  if (!v.includes("BEGIN PRIVATE KEY")) {
    try {
      const decoded = Buffer.from(v, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) v = decoded;
    } catch {}
  }

  return v;
}

function credentials() {
  // Preferred explicit variables used by this project.
  let projectId =
    clean(process.env.FIREBASE_ADMIN_PROJECT_ID) ||
    clean(process.env.FIREBASE_PROJECT_ID) ||
    clean(process.env.GCLOUD_PROJECT);

  let clientEmail =
    clean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL) ||
    clean(process.env.FIREBASE_CLIENT_EMAIL);

  let privateKey =
    normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY) ||
    normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  // Optional fallback: entire service account JSON in one environment variable.
  const serviceAccountRaw =
    clean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) ||
    clean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  if (serviceAccountRaw && (!projectId || !clientEmail || !privateKey)) {
    try {
      let raw = serviceAccountRaw;
      if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
      const parsed = JSON.parse(raw);
      projectId ||= clean(parsed.project_id);
      clientEmail ||= clean(parsed.client_email);
      privateKey ||= normalizePrivateKey(parsed.private_key);
    } catch {}
  }

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && "projectId",
      !clientEmail && "clientEmail",
      !privateKey && "privateKey",
    ].filter(Boolean).join(", ");
    throw new Error(`Firebase Admin não configurado. Campos ausentes: ${missing}`);
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Firebase Admin: FIREBASE_ADMIN_PRIVATE_KEY não parece ser uma chave PEM válida.");
  }

  return { projectId, clientEmail, privateKey };
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(credentials()) });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());

export function firebaseAdminDiagnostic() {
  try {
    const c = credentials();
    return {
      ok: true,
      projectId: c.projectId,
      clientEmailPresent: Boolean(c.clientEmail),
      privateKeyPresent: Boolean(c.privateKey),
      privateKeyLooksValid: c.privateKey.includes("BEGIN PRIVATE KEY"),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro desconhecido." };
  }
}
