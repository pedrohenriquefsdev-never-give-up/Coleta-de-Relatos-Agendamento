import { NextRequest } from "next/server";
import { firebaseAdminDiagnostic, adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return Response.json({ error: "Não autorizado." }, { status: 401 });

  const diagnostic = firebaseAdminDiagnostic();
  if (!diagnostic.ok) return Response.json(diagnostic, { status: 500 });

  try {
    const decoded = await adminAuth().verifyIdToken(h.slice(7));
    const snap = await adminDb().collection("users").doc(decoded.uid).get();

    return Response.json({
      ...diagnostic,
      tokenVerified: true,
      userDocumentExists: snap.exists,
      role: snap.exists ? snap.data()?.role || null : null,
      active: snap.exists ? snap.data()?.active !== false : null,
    });
  } catch (e: any) {
    return Response.json({
      ...diagnostic,
      tokenVerified: false,
      error: String(e?.message || "Falha ao validar Firebase Admin."),
      code: e?.code || null,
    }, { status: 500 });
  }
}
