import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isPortalDeveloperUid } from "@/lib/access-control";

export async function requireUser(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const decoded = await adminAuth().verifyIdToken(h.slice(7));
  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  if (!snap.exists || snap.data()?.active === false) throw new Error("FORBIDDEN");
  return { uid: decoded.uid, ...snap.data() } as any;
}

export function isDeveloper(user: { uid?: string; role?: string } | null | undefined) {
  return Boolean(user && isPortalDeveloperUid(user.uid));
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);
  if (!isDeveloper(user) && user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}

export async function requireDeveloper(req: NextRequest) {
  const user = await requireUser(req);
  if (!isPortalDeveloperUid(user.uid)) throw new Error("FORBIDDEN");
  return user;
}
