import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { safeServerError } from "@/lib/server-error";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const result: any = {
    version: "v1.32-services",
    runtime: {
      vercelEnv: runtimeEnv("VERCEL_ENV") || null,
      nodeEnv: runtimeEnv("NODE_ENV") || null,
    },
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
    const auth = adminAuth();
    const db = adminDb();
    result.firebaseAdminInit = true;

    const decoded = await auth.verifyIdToken(h.slice(7));
    result.tokenVerified = true;
    result.uid = decoded.uid;

    const userSnap = await db.collection("users").doc(decoded.uid).get();
    result.firestoreRead = true;
    result.userDocumentExists = userSnap.exists;
    result.role = userSnap.exists ? userSnap.data()?.role || null : null;

    const probe = db.collection("_diagnostics").doc(`runtime_${decoded.uid}`);
    await probe.set({
      uid: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      version: "v1.32-services",
    }, { merge: true });
    result.firestoreWrite = true;

    try { await probe.delete(); } catch {}

    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return Response.json({
      ...result,
      error: safeServerError(e),
    }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
