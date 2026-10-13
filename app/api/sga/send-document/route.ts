import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, isDeveloper } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";
import { listSgaPhotoTypes, normalizeSgaPlate, resolveSgaEventsByPlate, uploadSgaEventDocument } from "@/lib/sga-client";
import { loadCallHistoryData } from "@/lib/call-history-data";
import { buildCallHistoryPdf } from "@/lib/call-history-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canOperate(user: any) {
  return isDeveloper(user) || user?.role === "admin" || user?.role === "atendente";
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function eventArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.eventos)) return value.eventos;
  return [];
}

function codeOfPhotoType(item: any) {
  return String(item?.codigo_tipofoto ?? item?.codigo ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    if (!canOperate(actor)) return Response.json({ error: "Seu perfil possui acesso somente para consulta." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const appointmentId = String(body.appointmentId || "").trim();
    const eventCode = String(body.eventCode || "").trim();
    const vehicleCode = String(body.vehicleCode || "").trim();
    const photoTypeCode = String(body.photoTypeCode || "").trim();
    const observation = String(body.observation || "").trim().slice(0, 4000);

    if (!appointmentId || !eventCode || !vehicleCode || !photoTypeCode) {
      return Response.json({ error: "Selecione o evento e a classificação do documento antes de enviar." }, { status: 400 });
    }

    const report = await loadCallHistoryData(appointmentId);
    if (!report) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
    const assignedOperator = String(report.appointment.assignedTo || report.appointment.createdBy || "");
    if (!isDeveloper(actor) && actor.role !== "admin" && assignedOperator !== actor.uid) {
      return Response.json({ error: `Esta coleta está atribuída a ${report.appointment.assignedToName || report.appointment.createdByName || "outro operador"}.` }, { status: 403 });
    }
    if (report.attempts.length === 0) return Response.json({ error: "Não há tentativas de ligação para gerar o histórico em PDF." }, { status: 409 });

    const plate = String(report.appointment.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!plate) return Response.json({ error: "O agendamento não possui uma placa válida." }, { status: 400 });

    const resolvedEvents = await resolveSgaEventsByPlate(plate);
    const events = eventArray(resolvedEvents.data);
    const selectedEvent = events.find((item) => String(item?.codigo_evento ?? "") === eventCode && String(item?.codigo_veiculo ?? "") === vehicleCode);
    const selectedEventPlate = normalizeSgaPlate(selectedEvent?.placa);
    const resolvedVehicleCode = String(resolvedEvents.vehicleCode || "").trim();
    const eventStillMatchesPlate = Boolean(
      selectedEvent &&
      (!selectedEventPlate || selectedEventPlate === plate) &&
      (!resolvedVehicleCode || resolvedVehicleCode === vehicleCode)
    );
    if (!eventStillMatchesPlate) {
      return Response.json({ error: "O evento selecionado não corresponde mais à placa deste agendamento. Consulte o SGA novamente." }, { status: 409 });
    }

    let photoTypes: any[] = [];
    try { photoTypes = asArray(await listSgaPhotoTypes()); }
    catch (e: any) {
      return Response.json({
        error: "Não foi possível validar a classificação do documento no SGA. Verifique a permissão Vistoria → listar tipo foto no token.",
        technical: String(e?.message || e),
      }, { status: 502 });
    }

    const selectedPhotoType = photoTypes.find((item) => codeOfPhotoType(item) === photoTypeCode);
    if (!selectedPhotoType) return Response.json({ error: "A classificação de documento selecionada não está disponível no SGA." }, { status: 409 });

    const lastUpload = report.appointment.sga?.lastUpload;
    const latestAttemptId = String(report.attempts.at(-1)?.id || "");
    if (
      lastUpload &&
      String(lastUpload.eventCode || "") === eventCode &&
      String(lastUpload.vehicleCode || "") === vehicleCode &&
      String(lastUpload.photoTypeCode || "") === photoTypeCode &&
      String(lastUpload.latestAttemptId || "") === latestAttemptId &&
      String(lastUpload.observation || "") === observation
    ) {
      return Response.json({ error: "Este mesmo histórico já foi enviado para este evento no SGA." }, { status: 409 });
    }

    const { bytes, filename } = await buildCallHistoryPdf({
      appointment: report.appointment,
      attempts: report.attempts,
      actorName: actor.name || actor.email || "usuário",
      sgaObservation: observation,
    });

    const providerResponse = await uploadSgaEventDocument({
      vehicleCode: Number(vehicleCode),
      eventCode: Number(eventCode),
      photoTypeCode: Number(photoTypeCode),
      filename,
      base64: Buffer.from(bytes).toString("base64"),
      observation,
    });

    const sentAt = FieldValue.serverTimestamp();
    const uploadMeta = {
      eventCode,
      protocol: String(selectedEvent?.protocolo || ""),
      vehicleCode,
      photoTypeCode,
      photoTypeName: String(selectedPhotoType?.descricao || selectedPhotoType?.nome || ""),
      filename,
      observation,
      attemptCount: report.attempts.length,
      latestAttemptId,
      sentBy: actor.uid,
      sentByName: actor.name || actor.email || "Usuário",
      sentAt,
    };

    await adminDb().collection("appointments").doc(appointmentId).set({
      sgaObservation: observation,
      sga: { lastUpload: uploadMeta },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || "Usuário",
      userEmail: actor.email || "",
      action: "SGA_DOCUMENT_SENT",
      targetId: appointmentId,
      details: {
        plate,
        fullName: report.appointment.fullName || "",
        protocol: uploadMeta.protocol,
        eventCode,
        vehicleCode,
        photoTypeCode,
        photoTypeName: uploadMeta.photoTypeName,
        filename,
        attemptCount: report.attempts.length,
        eventLookupResolvedBy: resolvedEvents.resolvedBy,
        resolvedVehicleCode: resolvedEvents.vehicleCode || "",
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      ok: true,
      message: "PDF enviado ao evento no SGA com sucesso.",
      upload: {
        ...uploadMeta,
        sentAt: new Date().toISOString(),
      },
      providerResponse,
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 502;
    const technical = safeServerError(e);
    return Response.json({
      error: "Não foi possível enviar o histórico ao SGA.",
      technical: status === 502 ? technical.message : undefined,
    }, { status });
  }
}
