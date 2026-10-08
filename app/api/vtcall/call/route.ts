import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/server-auth";

const cleanPhone = (v: string) => String(v || "").replace(/\D/g, "");

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const phone = cleanPhone(body.phone);
    const appointmentId = String(body.appointmentId || "").trim();
    if (phone.length < 8) return Response.json({ error: "Telefone inválido." }, { status: 400 });

    const cred = await adminDb().collection("vtcallCredentials").doc(user.uid).get();
    if (!cred.exists || !cred.data()?.extension) return Response.json({ error: "Seu ramal VTCall ainda não foi configurado." }, { status: 409 });

    const token = process.env.VTCALL_ACCESS_TOKEN;
    const apiUrl = process.env.VTCALL_CLICK_TO_CALL_URL || "http://www23.vtcall.app/API/clicktocall";
    if (!token) return Response.json({ error: "Token da API VTCall ainda não configurado no servidor." }, { status: 503 });

    const extension = String(cred.data()?.extension);
    const vtResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": token,
      },
      body: JSON.stringify({ type: "ramal", first: extension, last: phone }),
      cache: "no-store",
    });

    let vtBody: any = {};
    try { vtBody = await vtResponse.json(); } catch {}
    if (!vtResponse.ok) {
      return Response.json({ error: vtBody?.message || `VTCall retornou HTTP ${vtResponse.status}.` }, { status: vtResponse.status >= 500 ? 502 : 400 });
    }

    const attempt = await adminDb().collection("callAttempts").add({
      appointmentId: appointmentId || null,
      userId: user.uid,
      userName: user.name,
      extension,
      phone,
      provider: "vtcall",
      status: "requested",
      requestedAt: FieldValue.serverTimestamp(),
      providerResponse: vtBody?.message || "Ok",
    });

    if (appointmentId) {
      await adminDb().collection("appointments").doc(appointmentId).set({
        call: {
          provider: "vtcall",
          status: "requested",
          lastAttemptId: attempt.id,
          requestedAt: FieldValue.serverTimestamp(),
          extension,
          phone,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await adminDb().collection("auditLogs").add({
      userId: user.uid,
      userName: user.name,
      userEmail: user.email,
      action: "VTCALL_CALL_REQUESTED",
      targetId: appointmentId || attempt.id,
      details: { phone, extension, attemptId: attempt.id },
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ ok: true, message: "Ligação solicitada. Aguarde o seu ramal tocar.", attemptId: attempt.id });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    return Response.json({ error: "Não foi possível iniciar a ligação." }, { status });
  }
}
