import { NextRequest } from "next/server";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ version: "v1.33-known-route", ok: false, error: "Authorization header ausente." }, { status: 401 });
  }

  const envKeys = Object.keys(process.env);
  const result: any = {
    version: "v1.33-known-route",
    ok: true,
    processEnvCount: envKeys.length,
    vercelEnv: runtimeEnv("VERCEL_ENV") || null,
    nodeEnv: runtimeEnv("NODE_ENV") || null,
    serverEnvTest: runtimeEnv("SERVER_ENV_TEST") || null,
    env: {
      firebaseProject: Boolean(runtimeEnv("FIREBASE_ADMIN_PROJECT_ID")),
      firebaseEmail: Boolean(runtimeEnv("FIREBASE_ADMIN_CLIENT_EMAIL")),
      firebaseKey: Boolean(runtimeEnv("FIREBASE_ADMIN_PRIVATE_KEY")),
      cloudinary: Boolean(runtimeEnv("CLOUDINARY_CLOUD_NAME") && runtimeEnv("CLOUDINARY_API_KEY") && runtimeEnv("CLOUDINARY_API_SECRET")),
      vtcall: Boolean(runtimeEnv("VTCALL_ACCESS_TOKEN") && runtimeEnv("VTCALL_CREDENTIALS_ENCRYPTION_KEY")),
    },
    firebaseAdminInit: false,
    tokenVerified: false,
    firestoreRead: false,
    firestoreWrite: false,
    userDocumentExists: false,
  };

  try {
    // Dynamic import happens only after the raw runtime env check above.
    const [{ adminAuth, adminDb }, { FieldValue }] = await Promise.all([
      import("@/lib/firebase-admin"),
      import("firebase-admin/firestore"),
    ]);

    const auth = adminAuth();
    const db = adminDb();
    result.firebaseAdminInit = true;

    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    result.tokenVerified = true;
    result.uid = decoded.uid;

    const userSnap = await db.collection("users").doc(decoded.uid).get();
    result.firestoreRead = true;
    result.userDocumentExists = userSnap.exists;
    result.role = userSnap.exists ? userSnap.data()?.role || null : null;

    const probe = db.collection("_diagnostics").doc(`runtime_${decoded.uid}`);
    await probe.set({ uid: decoded.uid, version: "v1.33-known-route", createdAt: FieldValue.serverTimestamp() }, { merge: true });
    result.firestoreWrite = true;
    try { await probe.delete(); } catch {}

    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    result.ok = false;
    result.error = {
      code: e?.code || null,
      message: String(e?.message || e || "Erro desconhecido").slice(0, 700),
    };
    return Response.json(result, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
