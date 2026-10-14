import { NextRequest } from "next/server";
import { isDeveloper, requireUser } from "@/lib/server-auth";
import { normalizeSgaPlate, resolveSgaEventsByPlate } from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let developerMode = false;
  try {
    const user = await requireUser(req);
    developerMode = isDeveloper(user);
    const rawPlate = String(req.nextUrl.searchParams.get("plate") || "");
    const plate = normalizeSgaPlate(rawPlate);
    if (!plate) return Response.json({ error: "Informe uma placa válida." }, { status: 400 });

    const referenceDate = String(req.nextUrl.searchParams.get("referenceDate") || "").trim();
    const cursorEnd = String(req.nextUrl.searchParams.get("cursorEnd") || "").trim();
    const result = await resolveSgaEventsByPlate(plate, { referenceDate, cursorEnd, skipDirect: Boolean(cursorEnd) });
    return Response.json({
      ok: true,
      pending: Boolean((result as any).pending),
      data: result.data,
      resolution: {
        input: rawPlate,
        normalizedPlate: result.normalizedPlate,
        vehicleCode: result.vehicleCode || null,
        resolvedBy: result.resolvedBy,
        directPlateLookup: (result as any).directPlateLookup || null,
        trace: result.trace,
        referenceDate: result.referenceDate || referenceDate || null,
        vehicleContractDate: result.vehicleContractDate || null,
        windowsSearched: result.windowsSearched || 0,
        nextCursorDate: (result as any).nextCursorDate || null,
        developerDebug: developerMode ? result.generalDebug || null : null,
      },
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    const vehicleNotFound = e?.code === "SGA_EXACT_VEHICLE_NOT_FOUND";
    const eventNotFound = e?.code === "SGA_EXACT_EVENT_NOT_FOUND";
    const exactNotFound = vehicleNotFound || eventNotFound;
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : exactNotFound ? 404 : 502;
    return Response.json({
      error: vehicleNotFound
        ? `O SGA não retornou o veículo exato da placa ${e?.normalizedPlate || "informada"} para o usuário da API.`
        : eventNotFound
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
        nextCursorDate: e?.nextCursorDate || null,
        failure: developerMode ? {
          code: e?.code || null,
          stage: Array.isArray(e?.trace) && e.trace.length ? e.trace.at(-1)?.step || null : null,
          endpoint: Array.isArray(e?.trace) && e.trace.length ? e.trace.at(-1)?.lookup || null : null,
          status: Array.isArray(e?.trace) && e.trace.length ? e.trace.at(-1)?.status || e?.status || null : e?.status || null,
          message: technical.message,
        } : null,
        developerDebug: developerMode ? e?.generalDebug || null : null,
      },
    }, { status });
  }
}
