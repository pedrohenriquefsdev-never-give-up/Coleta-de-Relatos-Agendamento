import { NextRequest } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { listSgaEventsByVehicle } from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const plate = String(req.nextUrl.searchParams.get("plate") || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!plate) return Response.json({ error: "Informe uma placa ou código do veículo." }, { status: 400 });
    const data = await listSgaEventsByVehicle(plate);
    return Response.json({ ok: true, data });
  } catch (e: any) {
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível consultar o evento no SGA.", technical: technical.message }, { status: e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 502 });
  }
}
