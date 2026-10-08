import { NextRequest } from "next/server";
import { firebaseAdminDiagnostic, adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const diagnostic: any = firebaseAdminDiagnostic();

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
