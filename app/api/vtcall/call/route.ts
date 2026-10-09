import { vtEnv, vtTokenMeta } from "@/lib/vtcall-env";
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";
import { readShowpeer } from "@/lib/vtcall-showpeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const cleanPhone = (v: string) => String(v || "").replace(/\D/g, "");


export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (user.role !== "admin" && user.role !== "atendente") {
      return Response.json({ error: "Seu perfil possui acesso somente para consulta." }, { status: 403 });
    }
    const body = await req.json();
    const phone = cleanPhone(body.phone);
    const appointmentId = String(body.appointmentId || "").trim();
    if (phone.length < 8) return Response.json({ error: "Telefone inválido." }, { status: 400 });

    const cred = await adminDb().collection("vtcallCredentials").doc(user.uid).get();
    if (!cred.exists || !cred.data()?.extension) return Response.json({ error: "Seu ramal VTCall ainda não foi configurado." }, { status: 409 });

    const token = vtEnv("VTCALL_ACCESS_TOKEN");
    const tokenSource = "VTCALL_ACCESS_TOKEN";
    const apiUrl = vtEnv("VTCALL_CLICK_TO_CALL_URL", "https://api23.vtcall.app/API/clicktocall");
    if (!token) return Response.json({ error: "Token do Click to Call VTCall ainda não configurado no servidor." }, { status: 503 });

    const extension = String(cred.data()?.extension);

    // Captura o estado real do ramal imediatamente ANTES do Click to Call.
    // Isso ajuda a identificar se já existia uma chamada/sessão ativa no PABX.
    const showpeerBefore = await readShowpeer(extension, token);

    const vtResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": token,
        "access-token": token,
      },
      body: JSON.stringify({ type: "ramal", first: extension, last: phone }),
      cache: "no-store",
    });

    const vtRaw = await vtResponse.text();
    let vtBody: any = {};
    try { vtBody = vtRaw ? JSON.parse(vtRaw) : {}; } catch {}
    if (!vtResponse.ok) {
      const providerMessage = vtBody?.message || vtBody?.error || vtRaw?.trim();
      const tokenMeta = vtTokenMeta(tokenSource);

      let showpeerDiagnostic: any = null;

      if (vtResponse.status === 403) {
        const configuredShowpeer = vtEnv("VTCALL_SHOWPEER_URL", "http://www23.vtcall.app/API/showpeer");
        const candidates = Array.from(new Set([
          configuredShowpeer,
          "http://www23.vtcall.app/API/showpeer",
          "https://www23.vtcall.app/API/showpeer",
          "https://api23.vtcall.app/API/showpeer",
        ]));

        for (const base of candidates) {
          try {
            const url = new URL(base);
            url.searchParams.set("ramal", extension);

            const check = await fetch(url.toString(), {
              method: "GET",
              headers: {
                access_token: token,
                "access-token": token,
              },
              cache: "no-store",
              redirect: "follow",
            });

            const raw = await check.text();
            showpeerDiagnostic = {
              url: check.url,
              status: check.status,
              ok: check.ok,
              redirected: check.redirected,
              body: raw ? raw.slice(0, 250) : null,
            };

            if (check.ok) break;
          } catch (err: any) {
            showpeerDiagnostic = {
              url: base,
              status: null,
              ok: false,
              error: String(err?.message || err).slice(0, 250),
            };
          }
        }
      }

      let error = providerMessage || `VTCall retornou HTTP ${vtResponse.status}.`;

      if (vtResponse.status === 403) {
        if (showpeerDiagnostic?.ok) {
          error = "VTCall recusou o Click to Call (HTTP 403), mas o mesmo token foi aceito pelo Showpeer. O token está válido; a recusa está específica no endpoint/requisição do Click to Call.";
        } else if (showpeerDiagnostic?.status === 401 || showpeerDiagnostic?.status === 403) {
          error = `VTCall recusou o Click to Call (HTTP 403) e também rejeitou o mesmo token no Showpeer (HTTP ${showpeerDiagnostic.status}). Verifique o valor do token cadastrado na Vercel.`;
        } else {
          error = "VTCall recusou o Click to Call (HTTP 403). Não foi possível confirmar o token pelo Showpeer.";
        }
      }

      return Response.json({
        error,
        providerStatus: vtResponse.status,
        providerMessage: providerMessage ? String(providerMessage).slice(0, 400) : null,
        providerDebug: {
          requestedUrl: apiUrl,
          finalUrl: vtResponse.url || null,
          redirected: vtResponse.redirected,
          contentType: vtResponse.headers.get("content-type"),
          server: vtResponse.headers.get("server"),
        },
        tokenMeta,
        showpeerDiagnostic,
      }, { status: 502 });
    }

    // Nova leitura logo após o provedor aceitar o Click to Call.
    const showpeerAfter = await readShowpeer(extension, token);

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
      showpeerBefore,
      showpeerAfter,
      preExistingCall: Boolean(showpeerBefore?.active),
    });

    let appointmentDetails: { fullName?: string; plate?: string } = {};
    if (appointmentId) {
      const appointmentRef = adminDb().collection("appointments").doc(appointmentId);
      const appointmentSnap = await appointmentRef.get();
      if (appointmentSnap.exists) {
        appointmentDetails = {
          fullName: String(appointmentSnap.data()?.fullName || ""),
          plate: String(appointmentSnap.data()?.plate || ""),
        };
      }
      await appointmentRef.set({
        call: {
          provider: "vtcall",
          status: "requested",
          lastAttemptId: attempt.id,
          requestedAt: FieldValue.serverTimestamp(),
          extension,
          phone,
          preExistingCall: Boolean(showpeerBefore?.active),
          showpeerBefore: {
            ok: Boolean(showpeerBefore?.ok),
            status: showpeerBefore?.status ?? null,
            active: Boolean(showpeerBefore?.active),
            count: Number(showpeerBefore?.count || 0),
          },
          showpeerAfter: {
            ok: Boolean(showpeerAfter?.ok),
            status: showpeerAfter?.status ?? null,
            active: Boolean(showpeerAfter?.active),
            count: Number(showpeerAfter?.count || 0),
          },
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
      details: {
        phone,
        extension,
        attemptId: attempt.id,
        ...appointmentDetails,
        preExistingCall: Boolean(showpeerBefore?.active),
        showpeerBeforeCount: Number(showpeerBefore?.count || 0),
        showpeerAfterCount: Number(showpeerAfter?.count || 0),
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      ok: true,
      message: "Ligação solicitada. Aguarde o seu ramal tocar.",
      attemptId: attempt.id,
      showpeer: {
        before: {
          ok: Boolean(showpeerBefore?.ok),
          status: showpeerBefore?.status ?? null,
          active: Boolean(showpeerBefore?.active),
          count: Number(showpeerBefore?.count || 0),
        },
        after: {
          ok: Boolean(showpeerAfter?.ok),
          status: showpeerAfter?.status ?? null,
          active: Boolean(showpeerAfter?.active),
          count: Number(showpeerAfter?.count || 0),
        },
      },
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({
      error: "Não foi possível iniciar a ligação.",
      code: technical.code,
      technical: status === 500 ? technical.message : undefined,
    }, { status });
  }
}
