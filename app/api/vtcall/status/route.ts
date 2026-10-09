import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";
import { vtEnv } from "@/lib/vtcall-env";
import { readShowpeer } from "@/lib/vtcall-showpeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const cred = await adminDb().collection("vtcallCredentials").doc(user.uid).get();
    const extension = String(cred.data()?.extension || "").trim();

    if (!cred.exists || !extension) {
      return Response.json({
        configured: false,
        extension: "",
        active: false,
        available: false,
        count: 0,
      });
    }

    const token = vtEnv("VTCALL_ACCESS_TOKEN");
    if (!token) {
      return Response.json({ error: "VTCall não configurado no servidor." }, { status: 503 });
    }

    const showpeer = await readShowpeer(extension, token);
    return Response.json({
      configured: true,
      extension,
      ok: showpeer.ok,
      providerStatus: showpeer.status,
      active: showpeer.active,
      available: showpeer.ok && !showpeer.active,
      count: showpeer.count,
      providerMessage: showpeer.providerMessage,
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: "Não foi possível consultar o status do ramal.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
