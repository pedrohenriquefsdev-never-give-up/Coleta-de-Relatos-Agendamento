import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { isDeveloper, requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManage(user: any) {
  return isDeveloper(user) || user?.role === "admin" || user?.canManageAgendaAvailability === true;
}

function timestampToIso(value: any): string | null {
  try {
    if (value?.toDate) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
  } catch {}
  return null;
}

function serialize(id: string, data: any) {
  return {
    date: String(data?.date || id),
    enabled: data?.enabled === true,
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
      return Response.json({ error: "Seu usuário não possui permissão para liberar dias da agenda." }, { status: 403 });
    }

    const body = await req.json();
    const date = String(body.date || "").trim();
    const enabled = body.enabled;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof enabled !== "boolean") {
      return Response.json({ error: "Data ou disponibilidade inválida." }, { status: 400 });
    }

    const now = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = {
      date,
      enabled,
      updatedAt: now,
    };
    if (enabled) {
      update.openedBy = actor.uid;
      update.openedByName = actor.name || actor.email || "Usuário";
      update.openedAt = now;
    } else {
      update.closedBy = actor.uid;
      update.closedByName = actor.name || actor.email || "Usuário";
      update.closedAt = now;
    }

    await adminDb().collection("agendaAvailability").doc(date).set(update, { merge: true });
    await adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || "Usuário",
      userEmail: actor.email || "",
      action: enabled ? "AGENDA_DAY_OPENED" : "AGENDA_DAY_CLOSED",
      targetId: date,
      details: { date },
      createdAt: FieldValue.serverTimestamp(),
    });

    const snap = await adminDb().collection("agendaAvailability").doc(date).get();
    return Response.json({ ok: true, item: serialize(snap.id, snap.data()) });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: status === 403 ? "Seu usuário não possui permissão para liberar dias da agenda." : "Não foi possível alterar a disponibilidade da agenda.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
