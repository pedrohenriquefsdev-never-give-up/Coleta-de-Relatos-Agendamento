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

    const referenceDate = String(req.nextUrl.searchParams.get("referenceDate") || "").trim();
    const result = await resolveSgaEventsByPlate(plate, { referenceDate });
    return Response.json({
      ok: true,
      data: result.data,
      resolution: {
        input: rawPlate,
        normalizedPlate: result.normalizedPlate,
        vehicleCode: result.vehicleCode || null,
        resolvedBy: result.resolvedBy,
        trace: result.trace,
        referenceDate: result.referenceDate || referenceDate || null,
        vehicleContractDate: result.vehicleContractDate || null,
        windowsSearched: result.windowsSearched || 0,
      },
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    const exactNotFound = e?.code === "SGA_EXACT_EVENT_NOT_FOUND" || e?.code === "SGA_EXACT_VEHICLE_NOT_FOUND";
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : exactNotFound ? 404 : 502;
    return Response.json({
      error: exactNotFound
        ? `Nenhum evento com correspondência exata para a placa ${e?.normalizedPlate || "informada"} foi localizado no SGA.`
        : "Não foi possível consultar o evento no SGA.",
      technical: technical.message,
      resolution: {
        normalizedPlate: e?.normalizedPlate || null,
        vehicleCode: e?.vehicleCode || null,
        trace: Array.isArray(e?.trace) ? e.trace : [],
        referenceDate: e?.referenceDate || null,
        vehicleContractDate: e?.vehicleContractDate || null,
        windowsSearched: Number(e?.windowsSearched || 0),
      },
    }, { status });
  }
}
