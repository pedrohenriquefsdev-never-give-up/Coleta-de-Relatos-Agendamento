import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { sgaConfigStatus } from "@/lib/sga-env";
import {
  authenticateSga,
  listSgaDepartments,
  listSgaStatuses,
  listSgaTypes,
  listSgaEventSituations,
  listSgaPhotoTypes,
  listSgaEventsByDateRange,
} from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function check(fn: () => Promise<any>) {
  try { return { ok: true, data: await fn(), error: null }; }
  catch (e: any) { return { ok: false, data: [], error: String(e?.message || e) }; }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const config = sgaConfigStatus();
    if (!config.configured) return Response.json({ ok: false, config, error: "Integração SGA ainda não configurada na Vercel." }, { status: 503 });

    await authenticateSga(true);
    const referenceDate = String(req.nextUrl.searchParams.get("referenceDate") || "").trim();
    const today = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
      ? new Date(`${referenceDate}T12:00:00.000Z`)
      : new Date();
    const [departmentsCheck, statusesCheck, typesCheck, eventSituationsCheck, photoTypesCheck, generalEventsCheck, generalEvents100Check] = await Promise.all([
      check(listSgaDepartments),
      check(listSgaStatuses),
      check(listSgaTypes),
      check(listSgaEventSituations),
      check(listSgaPhotoTypes),
      check(() => listSgaEventsByDateRange(today, today, 0, 1)),
      check(() => listSgaEventsByDateRange(today, today, 0, 100)),
    ]);

    return Response.json({
      ok: true,
      authenticated: true,
      config,
      departments: departmentsCheck.data,
      statuses: statusesCheck.data,
      types: typesCheck.data,
      eventSituations: eventSituationsCheck.data,
      photoTypes: photoTypesCheck.data,
      checks: {
        departments: { ok: departmentsCheck.ok, error: departmentsCheck.error },
        statuses: { ok: statusesCheck.ok, error: statusesCheck.error },
        types: { ok: typesCheck.ok, error: typesCheck.error },
        eventSituations: { ok: eventSituationsCheck.ok, error: eventSituationsCheck.error },
        photoTypes: { ok: photoTypesCheck.ok, error: photoTypesCheck.error },
        generalEvents: { ok: generalEventsCheck.ok, error: generalEventsCheck.error },
        generalEvents100: { ok: generalEvents100Check.ok, error: generalEvents100Check.error },
      },
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    return Response.json({
      ok: false,
      config: sgaConfigStatus(),
      error: "Não foi possível autenticar no SGA.",
      technical: technical.message,
    }, { status: e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 502 });
  }
}
