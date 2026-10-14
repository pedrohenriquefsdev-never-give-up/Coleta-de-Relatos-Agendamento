import { NextRequest } from "next/server";
import { requireDeveloper } from "@/lib/server-auth";
import { normalizeSgaPlate, sgaFetch } from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventsFrom(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.eventos)) return value.eventos;
  if (Array.isArray(value?.resultado)) return value.resultado;
  if (Array.isArray(value?.dados)) return value.dados;
  return [];
}

function sanitizeEvent(item: any) {
  const vehicle = item?.veiculo || {};
  const cooperative = item?.cooperativa || {};
  const regional = item?.regional || {};
  return {
    codigo_evento: String(item?.codigo_evento ?? item?.codigo ?? ""),
    protocolo: String(item?.protocolo ?? item?.protocolo_evento ?? ""),
    codigo_veiculo: String(item?.codigo_veiculo ?? vehicle?.codigo ?? ""),
    placa: String(item?.placa ?? vehicle?.placa ?? ""),
    situacao_evento: String(item?.situacao_evento ?? item?.descricao_situacao ?? ""),
    motivo: String(item?.descricao_motivo ?? item?.motivo ?? ""),
    data_cadastro: String(item?.data_cadastro ?? item?.data_cadastro_evento ?? ""),
    cooperativa: {
      codigo: String(cooperative?.codigo ?? cooperative?.codigo_cooperativa ?? item?.codigo_cooperativa ?? ""),
      nome: String(cooperative?.nome ?? cooperative?.descricao ?? cooperative?.nome_fantasia ?? ""),
    },
    regional: {
      codigo: String(regional?.codigo ?? regional?.codigo_regional ?? item?.codigo_regional ?? ""),
      nome: String(regional?.nome ?? regional?.descricao ?? regional?.nome_fantasia ?? ""),
    },
  };
}

type ProtocolAttempt = {
  id: string;
  label: string;
  body: Record<string, unknown>;
  accepted: boolean;
  status: number | null;
  message: string;
  responseShape: string | null;
  rawCount: number;
  protocolMatchCount: number;
  exactPlateMatchCount: number;
  events: ReturnType<typeof sanitizeEvent>[];
};

function responseShape(value: any) {
  return Array.isArray(value) ? "array" : value && typeof value === "object" ? "object" : typeof value;
}

async function runAttempt(
  id: string,
  label: string,
  body: Record<string, unknown>,
  protocol: string,
  targetPlate: string,
): Promise<ProtocolAttempt> {
  try {
    const raw = await sgaFetch("listar/evento", {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const events = eventsFrom(raw).map(sanitizeEvent);
    const protocolMatches = events.filter((event) => String(event.protocolo) === protocol);
    const exactPlateMatches = targetPlate
      ? protocolMatches.filter((event) => normalizeSgaPlate(event.placa) === targetPlate)
      : [];

    return {
      id,
      label,
      body,
      accepted: true,
      status: 200,
      message: protocolMatches.length > 0
        ? "Requisição aceita e protocolo localizado."
        : "Requisição aceita, mas o protocolo não veio no retorno.",
      responseShape: responseShape(raw),
      rawCount: events.length,
      protocolMatchCount: protocolMatches.length,
      exactPlateMatchCount: exactPlateMatches.length,
      events: protocolMatches.slice(0, 10),
    };
  } catch (e: any) {
    const technical = safeServerError(e);
    return {
      id,
      label,
      body,
      accepted: false,
      status: typeof e?.status === "number" ? e.status : null,
      message: technical.message,
      responseShape: null,
      rawCount: 0,
      protocolMatchCount: 0,
      exactPlateMatchCount: 0,
      events: [],
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireDeveloper(req);
    const protocol = String(req.nextUrl.searchParams.get("protocol") || "").trim();
    const targetPlate = normalizeSgaPlate(req.nextUrl.searchParams.get("plate") || "");
    if (!protocol) return Response.json({ error: "Informe o protocolo para o diagnóstico." }, { status: 400 });

    const attempts: ProtocolAttempt[] = [];

    attempts.push(await runAttempt(
      "string_only",
      "Protocolo como texto, sem paginação",
      { protocolo: protocol },
      protocol,
      targetPlate,
    ));

    const numericProtocol = Number(protocol);
    if (Number.isSafeInteger(numericProtocol)) {
      attempts.push(await runAttempt(
        "number_only",
        "Protocolo como número, sem paginação",
        { protocolo: numericProtocol },
        protocol,
        targetPlate,
      ));
    } else {
      attempts.push({
        id: "number_only",
        label: "Protocolo como número, sem paginação",
        body: { protocolo: protocol },
        accepted: false,
        status: null,
        message: "Protocolo não pode ser convertido com segurança para número.",
        responseShape: null,
        rawCount: 0,
        protocolMatchCount: 0,
        exactPlateMatchCount: 0,
        events: [],
      });
    }

    attempts.push(await runAttempt(
      "string_with_pagination",
      "Protocolo como texto, com paginação",
      { protocolo: protocol, inicio_paginacao: 0, quantidade_por_pagina: 10 },
      protocol,
      targetPlate,
    ));

    const acceptedAttempts = attempts.filter((attempt) => attempt.accepted);
    const visibleAttempts = attempts.filter((attempt) => attempt.protocolMatchCount > 0);
    const exactPlateAttempts = attempts.filter((attempt) => attempt.exactPlateMatchCount > 0);
    const matchedEvents = visibleAttempts.flatMap((attempt) => attempt.events);
    const uniqueEvents = Array.from(new Map(
      matchedEvents.map((event) => [
        `${event.codigo_evento}|${event.protocolo}|${event.codigo_veiculo}|${normalizeSgaPlate(event.placa)}`,
        event,
      ]),
    ).values());

    return Response.json({
      ok: true,
      endpoint: "POST listar/evento",
      targetPlate: targetPlate || null,
      protocol,
      attempts,
      acceptedVariant: acceptedAttempts[0]?.id || null,
      acceptedVariantLabel: acceptedAttempts[0]?.label || null,
      allRejected: acceptedAttempts.length === 0,
      protocolVisible: visibleAttempts.length > 0,
      exactPlateVisible: exactPlateAttempts.length > 0,
      rawCount: Math.max(0, ...attempts.map((attempt) => attempt.rawCount)),
      protocolMatchCount: Math.max(0, ...attempts.map((attempt) => attempt.protocolMatchCount)),
      exactPlateMatchCount: Math.max(0, ...attempts.map((attempt) => attempt.exactPlateMatchCount)),
      events: uniqueEvents.slice(0, 10),
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    return Response.json({
      ok: false,
      error: "Não foi possível executar o diagnóstico por protocolo.",
      technical: technical.message,
      status: e?.status || null,
    }, { status: e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500 });
  }
}
