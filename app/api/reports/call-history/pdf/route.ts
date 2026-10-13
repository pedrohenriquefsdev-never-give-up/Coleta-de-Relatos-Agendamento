import { NextRequest } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";
import { loadCallHistoryData } from "@/lib/call-history-data";
import { buildCallHistoryPdf } from "@/lib/call-history-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function makePdf(req: NextRequest, appointmentId: string, observationOverride = "") {
  const actor = await requireUser(req);
  if (!appointmentId) return Response.json({ error: "Agendamento inválido." }, { status: 400 });

  const report = await loadCallHistoryData(appointmentId);
  if (!report) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });

  const observation = String(observationOverride || report.appointment.sgaObservation || "").trim();
  const { bytes, filename } = await buildCallHistoryPdf({
    appointment: report.appointment,
    attempts: report.attempts,
    actorName: actor.name || actor.email || "usuário",
    sgaObservation: observation,
  });

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const appointmentId = String(req.nextUrl.searchParams.get("appointmentId") || "").trim();
    return await makePdf(req, appointmentId);
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível gerar o PDF do histórico.", technical: status === 500 ? technical.message : undefined }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const appointmentId = String(body.appointmentId || "").trim();
    const observation = String(body.observation || "").trim();
    return await makePdf(req, appointmentId, observation);
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível gerar o PDF do histórico.", technical: status === 500 ? technical.message : undefined }, { status });
  }
}
