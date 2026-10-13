import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { fitsAvailability, timeToMinutes } from "@/lib/agenda-availability";
import { isDeveloper, requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";
import type { AppointmentStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set<AppointmentStatus>([
  "agendado", "confirmado", "em_contato", "nao_atendeu", "reagendar",
  "concluido", "atendido", "cancelado", "nao_compareceu",
]);

function canEdit(user: any) {
  return isDeveloper(user) || user?.role === "admin" || user?.role === "atendente";
}
function canDelete(user: any) {
  return isDeveloper(user) || user?.role === "admin";
}
function cleanPlate(v: unknown) {
  return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}
function cleanPhone(v: unknown) {
  return String(v || "").replace(/\D/g, "").slice(0, 11);
}

async function validateSchedule(payload: any, ignoreId?: string) {
  const availabilitySnap = await adminDb().collection("agendaAvailability").doc(payload.date).get();
  const availability = availabilitySnap.exists ? ({ date: availabilitySnap.id, ...availabilitySnap.data() } as any) : null;
  if (!fitsAvailability(availability, payload.assignedTo, payload.time, Number(payload.durationMinutes || 30))) {
    throw new Error("SCHEDULE_NOT_AVAILABLE");
  }

  const snapshot = await adminDb().collection("appointments").where("date", "==", payload.date).get();
  const start = timeToMinutes(payload.time);
  const end = start + Number(payload.durationMinutes || 30);
  for (const doc of snapshot.docs) {
    if (doc.id === ignoreId) continue;
    const item = doc.data() as any;
    if (item.status === "cancelado") continue;
    if (String(item.assignedTo || item.createdBy || "") !== String(payload.assignedTo)) continue;
    const itemStart = timeToMinutes(String(item.time || ""));
    const itemEnd = itemStart + Number(item.durationMinutes || 30);
    if (start < itemEnd && end > itemStart) throw new Error("SCHEDULE_CONFLICT");
  }
}

async function resolveResponsible(payload: any) {
  const snap = await adminDb().collection("users").doc(payload.assignedTo).get();
  if (!snap.exists || snap.data()?.active === false) throw new Error("INVALID_RESPONSIBLE");
  const data = snap.data() as any;
  if (!isDeveloper({ uid: payload.assignedTo, role: data.role }) && data.role !== "admin" && data.role !== "atendente") throw new Error("INVALID_RESPONSIBLE");
  return {
    ...payload,
    assignedToName: String(data.name || data.email || payload.assignedToName || ""),
    assignedDepartment: String(data.department || ""),
  };
}

function validatePayload(body: any) {
  const payload = {
    plate: cleanPlate(body.plate),
    fullName: String(body.fullName || "").trim(),
    phone: cleanPhone(body.phone),
    phoneDigits: cleanPhone(body.phoneDigits || body.phone),
    email: String(body.email || "").trim(),
    date: String(body.date || "").trim(),
    time: String(body.time || "").trim(),
    durationMinutes: Number(body.durationMinutes || 30),
    status: String(body.status || "agendado") as AppointmentStatus,
    notes: String(body.notes || ""),
    assignedTo: String(body.assignedTo || "").trim(),
    assignedToName: String(body.assignedToName || "").trim(),
    assignedDepartment: String(body.assignedDepartment || "").trim(),
  };
  if (!payload.plate || !payload.fullName || !payload.phone || !payload.email || !payload.assignedTo) throw new Error("INVALID_FIELDS");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !/^\d{2}:\d{2}$/.test(payload.time)) throw new Error("INVALID_FIELDS");
  if (!Number.isFinite(payload.durationMinutes) || payload.durationMinutes < 15 || payload.durationMinutes > 240) throw new Error("INVALID_FIELDS");
  if (!allowedStatuses.has(payload.status)) throw new Error("INVALID_FIELDS");
  return payload;
}

async function audit(actor: any, action: string, targetId: string, payload: any) {
  await adminDb().collection("auditLogs").add({
    userId: actor.uid,
    userName: actor.name || actor.email || "Usuário",
    userEmail: actor.email || "",
    action,
    targetId,
    details: {
      plate: payload.plate,
      fullName: payload.fullName,
      phone: payload.phone,
      status: payload.status,
      assignedToName: payload.assignedToName,
      date: payload.date,
      time: payload.time,
    },
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    if (!canEdit(actor)) return Response.json({ error: "Seu perfil não pode criar agendamentos." }, { status: 403 });
    let payload = validatePayload(await req.json());
    payload = await resolveResponsible(payload);
    if (!isDeveloper(actor)) await validateSchedule(payload);
    const ref = await adminDb().collection("appointments").add({
      ...payload,
      createdBy: actor.uid,
      createdByName: actor.name || actor.email || "Usuário",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await audit(actor, "APPOINTMENT_CREATED", ref.id, payload);
    return Response.json({ ok: true, id: ref.id });
  } catch (e: any) {
    const code = e?.message;
    if (code === "SCHEDULE_NOT_AVAILABLE") return Response.json({ error: "Este responsável não está disponível nesse dia e horário." }, { status: 409 });
    if (code === "SCHEDULE_CONFLICT") return Response.json({ error: "O responsável já possui outra coleta nesse período." }, { status: 409 });
    if (code === "INVALID_FIELDS") return Response.json({ error: "Preencha corretamente os campos obrigatórios." }, { status: 400 });
    if (code === "INVALID_RESPONSIBLE") return Response.json({ error: "O responsável selecionado não está disponível para receber coletas." }, { status: 400 });
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível criar o agendamento.", technical: status === 500 ? technical.message : undefined }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    if (!canEdit(actor)) return Response.json({ error: "Seu perfil não pode editar agendamentos." }, { status: 403 });
    const body = await req.json();
    const id = String(body.id || "").trim();
    if (!id) return Response.json({ error: "Agendamento inválido." }, { status: 400 });
    const ref = adminDb().collection("appointments").doc(id);
    const currentSnap = await ref.get();
    if (!currentSnap.exists) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
    const current = currentSnap.data() as any;
    let payload = validatePayload(body);
    payload = await resolveResponsible(payload);
    const scheduleChanged = payload.date !== current.date || payload.time !== current.time || payload.assignedTo !== current.assignedTo || payload.durationMinutes !== Number(current.durationMinutes || 30);
    if (!isDeveloper(actor) && scheduleChanged) await validateSchedule(payload, id);
    await ref.update({ ...payload, updatedAt: FieldValue.serverTimestamp() });
    await audit(actor, "APPOINTMENT_UPDATED", id, payload);
    return Response.json({ ok: true, id });
  } catch (e: any) {
    const code = e?.message;
    if (code === "SCHEDULE_NOT_AVAILABLE") return Response.json({ error: "Este responsável não está disponível nesse dia e horário." }, { status: 409 });
    if (code === "SCHEDULE_CONFLICT") return Response.json({ error: "O responsável já possui outra coleta nesse período." }, { status: 409 });
    if (code === "INVALID_FIELDS") return Response.json({ error: "Preencha corretamente os campos obrigatórios." }, { status: 400 });
    if (code === "INVALID_RESPONSIBLE") return Response.json({ error: "O responsável selecionado não está disponível para receber coletas." }, { status: 400 });
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível atualizar o agendamento.", technical: status === 500 ? technical.message : undefined }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    if (!canDelete(actor)) return Response.json({ error: "Seu perfil não pode excluir agendamentos." }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) return Response.json({ error: "Agendamento inválido." }, { status: 400 });
    const ref = adminDb().collection("appointments").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
    const payload = snap.data() as any;
    await ref.delete();
    await audit(actor, "APPOINTMENT_DELETED", id, payload);
    return Response.json({ ok: true });
  } catch (e: any) {
    const code = e?.message;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível excluir o agendamento.", technical: status === 500 ? technical.message : undefined }, { status });
  }
}
