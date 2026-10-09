import { runtimeEnv } from "@/lib/runtime-env";
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
    clean(runtimeEnv("FIREBASE_ADMIN_PROJECT_ID")) ||
    clean(runtimeEnv("FIREBASE_PROJECT_ID")) ||
    clean(runtimeEnv("GCLOUD_PROJECT"));

  let clientEmail =
    clean(runtimeEnv("FIREBASE_ADMIN_CLIENT_EMAIL")) ||
    clean(runtimeEnv("FIREBASE_CLIENT_EMAIL"));

  let privateKey =
    normalizePrivateKey(runtimeEnv("FIREBASE_ADMIN_PRIVATE_KEY")) ||
    normalizePrivateKey(runtimeEnv("FIREBASE_PRIVATE_KEY"));

  // Optional fallback: entire service account JSON in one environment variable.
  const serviceAccountRaw =
    clean(runtimeEnv("FIREBASE_SERVICE_ACCOUNT_KEY")) ||
    clean(runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON"));

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
  const rawProjectId =
    runtimeEnv("FIREBASE_ADMIN_PROJECT_ID") ||
    runtimeEnv("FIREBASE_PROJECT_ID") ||
    runtimeEnv("GCLOUD_PROJECT") ||
    "";

  const rawClientEmail =
    runtimeEnv("FIREBASE_ADMIN_CLIENT_EMAIL") ||
    runtimeEnv("FIREBASE_CLIENT_EMAIL") ||
    "";

  const rawPrivateKey =
    runtimeEnv("FIREBASE_ADMIN_PRIVATE_KEY") ||
    runtimeEnv("FIREBASE_PRIVATE_KEY") ||
    "";

  const rawServiceAccount =
    runtimeEnv("FIREBASE_SERVICE_ACCOUNT_KEY") ||
    runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON") ||
    "";

  const result: any = {
    projectIdPresent: Boolean(rawProjectId),
    projectId: rawProjectId ? clean(rawProjectId) : null,
    clientEmailPresent: Boolean(rawClientEmail),
    clientEmailLength: rawClientEmail?.length || 0,
    privateKeyPresent: Boolean(rawPrivateKey),
    privateKeyLength: rawPrivateKey?.length || 0,
    privateKeyHasBegin: String(rawPrivateKey).includes("BEGIN PRIVATE KEY"),
    privateKeyHasEnd: String(rawPrivateKey).includes("END PRIVATE KEY"),
    serviceAccountPresent: Boolean(rawServiceAccount),
    serviceAccountLength: rawServiceAccount?.length || 0,
    source: rawServiceAccount ? "FIREBASE_SERVICE_ACCOUNT_*" : "FIREBASE_ADMIN_*",
  };

  try {
    const c = credentials();
    return {
      ...result,
      ok: true,
      normalizedProjectId: c.projectId,
      normalizedPrivateKeyLooksValid: c.privateKey.includes("BEGIN PRIVATE KEY") && c.privateKey.includes("END PRIVATE KEY"),
    };
  } catch (e) {
    return {
      ...result,
      ok: false,
      error: e instanceof Error ? e.message : "Erro desconhecido.",
    };
  }
}
