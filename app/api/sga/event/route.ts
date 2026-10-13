import { NextRequest } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { normalizeSgaPlate, resolveSgaEventsByPlate } from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const rawPlate = String(req.nextUrl.searchParams.get("plate") || "");
    const plate = normalizeSgaPlate(rawPlate);
    if (!plate) return Response.json({ error: "Informe uma placa válida." }, { status: 400 });

    const result = await resolveSgaEventsByPlate(plate);
    return Response.json({
      ok: true,
      data: result.data,
      resolution: {
        input: rawPlate,
        normalizedPlate: result.normalizedPlate,
        vehicleCode: result.vehicleCode || null,
        resolvedBy: result.resolvedBy,
        trace: result.trace,
      },
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 502;
    return Response.json({
      error: "Não foi possível consultar o evento no SGA.",
      technical: technical.message,
      resolution: {
        normalizedPlate: e?.normalizedPlate || null,
        vehicleCode: e?.vehicleCode || null,
        trace: Array.isArray(e?.trace) ? e.trace : [],
      },
    }, { status });
  }
}
