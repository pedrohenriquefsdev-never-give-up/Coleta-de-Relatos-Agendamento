import { runtimeEnv, hasRuntimeEnv } from "@/lib/runtime-env";
import { NextRequest } from "next/server";
import { firebaseAdminDiagnostic, adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const diagnostic: any = {
    ...firebaseAdminDiagnostic(),
    serverEnvTestPresent: hasRuntimeEnv("SERVER_ENV_TEST"),
    serverEnvTestValue: runtimeEnv("SERVER_ENV_TEST") || null,
    cloudinaryCloudNamePresent: hasRuntimeEnv("CLOUDINARY_CLOUD_NAME"),
    cloudinaryApiKeyPresent: hasRuntimeEnv("CLOUDINARY_API_KEY"),
    cloudinaryApiSecretPresent: hasRuntimeEnv("CLOUDINARY_API_SECRET"),
    vtcallEncryptionKeyPresent: hasRuntimeEnv("VTCALL_CREDENTIALS_ENCRYPTION_KEY"),
    vtcallAccessTokenPresent: hasRuntimeEnv("VTCALL_ACCESS_TOKEN"),
    vercelEnv: runtimeEnv("VERCEL_ENV") || null,
    vercelTargetEnv: runtimeEnv("VERCEL_TARGET_ENV") || null,
    nodeEnv: runtimeEnv("NODE_ENV") || null,
    runtimeEnvKeyCount: Object.keys(process.env).length,
  };

  if (!diagnostic.ok) {
    return Response.json({
      ...diagnostic,
      tokenVerified: false,
      userDocumentExists: false,
      sdkInitialized: false,
    }, { status: 500 });
  }

  try {
    const auth = adminAuth();
    const db = adminDb();

    const decoded = await auth.verifyIdToken(h.slice(7));
    const snap = await db.collection("users").doc(decoded.uid).get();

    return Response.json({
      ...diagnostic,
      sdkInitialized: true,
      tokenVerified: true,
      userDocumentExists: snap.exists,
      role: snap.exists ? snap.data()?.role || null : null,
      active: snap.exists ? snap.data()?.active !== false : null,
    }, { status: 200 });
  } catch (e: any) {
    return Response.json({
      ...diagnostic,
      sdkInitialized: false,
      tokenVerified: false,
      userDocumentExists: false,
      error: String(e?.message || "Falha ao validar Firebase Admin."),
      code: e?.code || null,
    }, { status: 500 });
  }
}
