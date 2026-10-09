import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timestampToIso(value: any): string | null {
  try {
    if (value?.toDate) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const appointmentId = String(req.nextUrl.searchParams.get("appointmentId") || "").trim();
    if (!appointmentId) return Response.json({ error: "Agendamento não informado." }, { status: 400 });

    const appointment = await adminDb().collection("appointments").doc(appointmentId).get();
    if (!appointment.exists) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });

    const snapshot = await adminDb()
      .collection("callAttempts")
      .where("appointmentId", "==", appointmentId)
      .limit(25)
      .get();

    const attempts = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          status: String(data.status || "requested"),
          extension: String(data.extension || ""),
          phone: String(data.phone || ""),
          userName: String(data.userName || ""),
          providerResponse: String(data.providerResponse || ""),
          requestedAt: timestampToIso(data.requestedAt),
          preExistingCall: Boolean(data.preExistingCall),
          showpeerBeforeCount: Number(data.showpeerBefore?.count || 0),
          showpeerAfterCount: Number(data.showpeerAfter?.count || 0),
        };
      })
      .sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));

    return Response.json({ attempts });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: "Não foi possível carregar o histórico de ligações.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
