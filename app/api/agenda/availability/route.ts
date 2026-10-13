import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { normalizeSlot, timeToMinutes } from "@/lib/agenda-availability";
import { isDeveloper, requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";
import type { AgendaAvailabilitySlot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManage(user: any) {
  return isDeveloper(user) || user?.role === "admin" || user?.canManageAgendaAvailability === true;
}

function cleanSlots(items: any[]): AgendaAvailabilitySlot[] {
  return items
    .map((slot) => normalizeSlot(slot))
    .filter((slot): slot is AgendaAvailabilitySlot => slot !== null);
}

function timestampToIso(value: any): string | null {
  try {
    if (value?.toDate) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
  } catch {}
  return null;
}

function serialize(id: string, data: any) {
  const slots = Array.isArray(data?.slots) ? cleanSlots(data.slots) : [];
  return {
    date: String(data?.date || id),
    enabled: data?.enabled === true,
    slots,
    openedBy: data?.openedBy ? String(data.openedBy) : undefined,
    openedByName: data?.openedByName ? String(data.openedByName) : undefined,
    openedAt: timestampToIso(data?.openedAt),
    closedBy: data?.closedBy ? String(data.closedBy) : undefined,
    closedByName: data?.closedByName ? String(data.closedByName) : undefined,
    closedAt: timestampToIso(data?.closedAt),
    updatedAt: timestampToIso(data?.updatedAt),
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const snapshot = await adminDb().collection("agendaAvailability").get();
    const availability = snapshot.docs.map((doc) => serialize(doc.id, doc.data()));
    return Response.json({ availability });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: "Não foi possível carregar a disponibilidade da agenda.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    if (!canManage(actor)) {
      return Response.json({ error: "Seu usuário não possui permissão para gerenciar a disponibilidade da agenda." }, { status: 403 });
    }

    const body = await req.json();
    const date = String(body.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "Data inválida." }, { status: 400 });
    }

    const requestedSlots = Array.isArray(body.slots) ? body.slots : null;
    const normalizedSlots = requestedSlots ? cleanSlots(requestedSlots) : null;

    if (requestedSlots && normalizedSlots!.length !== requestedSlots.length) {
      return Response.json({ error: "Existe um período inválido. Confira responsável, horário inicial e horário final." }, { status: 400 });
    }

    if (normalizedSlots && normalizedSlots.length > 0) {
      const operatorIds = Array.from(new Set(normalizedSlots.map((slot) => slot.assignedTo)));
      const operatorDocs = await Promise.all(operatorIds.map((uid) => adminDb().collection("users").doc(uid).get()));
      const invalidOperator = operatorDocs.find((snap) => !snap.exists || snap.data()?.active === false || snap.data()?.canPerformCollections !== true);
      if (invalidOperator) {
        return Response.json({ error: "A disponibilidade só pode ser atribuída a usuários marcados como ‘Realiza coletas de relatos’." }, { status: 400 });
      }
    }

    if (normalizedSlots) {
      for (let i = 0; i < normalizedSlots.length; i++) {
        for (let j = i + 1; j < normalizedSlots.length; j++) {
          const a = normalizedSlots[i];
          const b = normalizedSlots[j];
          if (a.assignedTo !== b.assignedTo) continue;
          if (timeToMinutes(a.start) < timeToMinutes(b.end) && timeToMinutes(a.end) > timeToMinutes(b.start)) {
            return Response.json({ error: `Existem períodos sobrepostos para ${a.assignedToName || "o mesmo responsável"}.` }, { status: 400 });
          }
        }
      }
    }

    // Compatibilidade com versões anteriores que enviavam apenas enabled.
    const enabled = normalizedSlots !== null ? normalizedSlots.length > 0 : body.enabled === true;
    if (normalizedSlots === null && typeof body.enabled !== "boolean") {
      return Response.json({ error: "Informe os períodos disponíveis ou o status do dia." }, { status: 400 });
    }

    const now = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = {
      date,
      enabled,
      updatedAt: now,
    };

    if (normalizedSlots !== null) update.slots = normalizedSlots;

    if (enabled) {
      update.openedBy = actor.uid;
      update.openedByName = actor.name || actor.email || "Usuário";
      update.openedAt = now;
    } else {
      update.closedBy = actor.uid;
      update.closedByName = actor.name || actor.email || "Usuário";
      update.closedAt = now;
      update.slots = [];
    }

    await adminDb().collection("agendaAvailability").doc(date).set(update, { merge: true });
    await adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || "Usuário",
      userEmail: actor.email || "",
      action: enabled ? "AGENDA_AVAILABILITY_UPDATED" : "AGENDA_DAY_CLOSED",
      targetId: date,
      details: {
        date,
        periods: normalizedSlots?.length ?? 0,
        slots: normalizedSlots ?? [],
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    const snap = await adminDb().collection("agendaAvailability").doc(date).get();
    return Response.json({ ok: true, item: serialize(snap.id, snap.data()) });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: status === 403 ? "Seu usuário não possui permissão para gerenciar a disponibilidade da agenda." : "Não foi possível alterar a disponibilidade da agenda.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
