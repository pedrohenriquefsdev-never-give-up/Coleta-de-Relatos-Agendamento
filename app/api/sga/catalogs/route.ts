import { NextRequest } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { listSgaEventSituations, listSgaPhotoTypes } from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeCheck(fn: () => Promise<any>) {
  try { return { ok: true, data: await fn(), error: null }; }
  catch (e: any) { return { ok: false, data: [], error: String(e?.message || e) }; }
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const [photoTypes, eventSituations] = await Promise.all([
      safeCheck(listSgaPhotoTypes),
      safeCheck(listSgaEventSituations),
    ]);

    return Response.json({
      ok: photoTypes.ok || eventSituations.ok,
      photoTypes: photoTypes.data,
      eventSituations: eventSituations.data,
      checks: {
        photoTypes: { ok: photoTypes.ok, error: photoTypes.error },
        eventSituations: { ok: eventSituations.ok, error: eventSituations.error },
      },
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 502;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível carregar os catálogos do SGA.", technical: technical.message }, { status });
  }
}
