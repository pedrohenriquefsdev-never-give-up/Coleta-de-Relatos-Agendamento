import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function requireUser(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const decoded = await adminAuth().verifyIdToken(h.slice(7));
  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  if (!snap.exists || snap.data()?.active === false) throw new Error("FORBIDDEN");
  return { uid: decoded.uid, ...snap.data() } as any;
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}
