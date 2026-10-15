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

    const result = await resolveSgaEventsByPlate(plate);
    return Response.json({
      ok: true,
      data: result.data,
      resolution: {
        input: rawPlate,
        normalizedPlate: result.normalizedPlate,
        vehicleCode: result.vehicleCode || null,
        resolvedBy: result.resolvedBy,
        directPlateLookup: (result as any).directPlateLookup || null,
        trace: result.trace,
      },
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    const vehicleNotFound = e?.code === "SGA_EXACT_VEHICLE_NOT_FOUND";
    const inconsistent = e?.code === "SGA_EVENT_INCONSISTENT";
    const unavailable = e?.code === "SGA_EVENT_NOT_AVAILABLE";

    const status = e?.message === "UNAUTHORIZED"
      ? 401
      : e?.message === "FORBIDDEN"
        ? 403
        : vehicleNotFound
          ? 404
          : inconsistent || unavailable
            ? 409
            : 502;

    return Response.json({
      error: vehicleNotFound
        ? `O SGA não retornou o veículo exato da placa ${e?.normalizedPlate || "informada"}.`
        : inconsistent
          ? `O SGA retornou evento(s) de outra placa para o veículo ${e?.vehicleCode || "localizado"}. O envio foi bloqueado por segurança.`
          : unavailable
            ? `O veículo ${e?.normalizedPlate || "informado"} foi localizado, mas o SGA não disponibilizou um evento correspondente neste momento.`
            : "Não foi possível consultar o evento no SGA.",
      technical: technical.message,
      resolution: {
        normalizedPlate: e?.normalizedPlate || null,
        vehicleCode: e?.vehicleCode || null,
        trace: Array.isArray(e?.trace) ? e.trace : [],
        failure: developerMode ? {
          code: e?.code || null,
          stage: Array.isArray(e?.trace) && e.trace.length ? e.trace.at(-1)?.step || null : null,
          endpoint: Array.isArray(e?.trace) && e.trace.length ? e.trace.at(-1)?.lookup || null : null,
          status: Array.isArray(e?.trace) && e.trace.length ? e.trace.at(-1)?.status || e?.status || null : e?.status || null,
          message: technical.message,
        } : null,
      },
    }, { status });
  }
}
