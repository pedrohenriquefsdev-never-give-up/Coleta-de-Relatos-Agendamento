import { NextRequest } from "next/server";
import { decryptSecret } from "@/lib/vtcall-crypto";
import { requireUser } from "@/lib/server-auth";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const snap = await adminDb().collection("vtcallCredentials").doc(user.uid).get();
    if (!snap.exists) return Response.json({ configured: false });
    const data = snap.data() || {};
    return Response.json({
      configured: true,
      host: data.host || "",
      extension: data.extension || "",
      password: data.passwordEncrypted ? decryptSecret(data.passwordEncrypted) : "",
      port: data.port || 5068,
      transport: data.transport || "UDP",
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    return Response.json({ error: "Não foi possível carregar a configuração do VTCall." }, { status });
  }
}
