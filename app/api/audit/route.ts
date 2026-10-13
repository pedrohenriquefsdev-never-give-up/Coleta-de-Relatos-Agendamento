import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ACTIONS = new Set([
  "LOGIN_SUCCESS",
  "LOGOUT",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_UPDATED",
  "APPOINTMENT_DELETED",
]);

function timestampToIso(value: any): string | null {
  try {
    if (value?.toDate) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
  } catch {}
  return null;
}

function safeDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input).slice(0, 30)) {
    if (/password|senha|token|secret|cpf/i.test(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 500);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) output[key] = item;
    else if (Array.isArray(item)) output[key] = item.slice(0, 20).map((x) => String(x).slice(0, 200));
  }
  return output;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const rawLimit = Number(req.nextUrl.searchParams.get("limit") || 150);
    const take = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 150, 1), 300);
    const snapshot = await adminDb().collection("auditLogs").orderBy("createdAt", "desc").limit(take).get();
    const logs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: String(data.userId || ""),
        userName: String(data.userName || ""),
        userEmail: String(data.userEmail || ""),
        action: String(data.action || ""),
        targetId: String(data.targetId || ""),
        details: data.details && typeof data.details === "object" ? data.details : {},
        createdAt: timestampToIso(data.createdAt),
      };
    });
    return Response.json({ logs });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: status === 403 ? "Você não possui permissão para consultar os logs." : "Não foi possível carregar os logs.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    const body = await req.json();
    const action = String(body.action || "").trim();
    if (!CLIENT_ACTIONS.has(action)) {
      return Response.json({ error: "Ação de auditoria inválida." }, { status: 400 });
    }

    const targetId = String(body.targetId || "").trim().slice(0, 180);
    const details = safeDetails(body.details);
    await adminDb().collection("auditLogs").add({
      userId: actor.uid,
      userName: actor.name || actor.email || "Usuário",
      userEmail: actor.email || "",
      action,
      targetId: targetId || null,
      details,
      createdAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: "Não foi possível registrar a ação no histórico.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
