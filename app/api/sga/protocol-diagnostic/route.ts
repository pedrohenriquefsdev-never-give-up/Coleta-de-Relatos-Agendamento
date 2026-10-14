import { NextRequest } from "next/server";
import { requireDeveloper } from "@/lib/server-auth";
import { listSgaEventByProtocol, normalizeSgaPlate } from "@/lib/sga-client";
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

export async function GET(req: NextRequest) {
  try {
    await requireDeveloper(req);
    const protocol = String(req.nextUrl.searchParams.get("protocol") || "").trim();
    const targetPlate = normalizeSgaPlate(req.nextUrl.searchParams.get("plate") || "");
    if (!protocol) return Response.json({ error: "Informe o protocolo para o diagnóstico." }, { status: 400 });

    const raw = await listSgaEventByProtocol(protocol, 12000);
    const events = eventsFrom(raw).map(sanitizeEvent);
    const protocolMatches = events.filter((event) => String(event.protocolo) === protocol);
    const exactPlateMatches = targetPlate
      ? protocolMatches.filter((event) => normalizeSgaPlate(event.placa) === targetPlate)
      : [];

    return Response.json({
      ok: true,
      endpoint: "POST listar/evento",
      request: { protocolo: protocol, inicio_paginacao: 0, quantidade_por_pagina: 10 },
      targetPlate: targetPlate || null,
      responseShape: Array.isArray(raw) ? "array" : raw && typeof raw === "object" ? "object" : typeof raw,
      rawCount: events.length,
      protocolMatchCount: protocolMatches.length,
      exactPlateMatchCount: exactPlateMatches.length,
      protocolVisible: protocolMatches.length > 0,
      exactPlateVisible: exactPlateMatches.length > 0,
      events: protocolMatches.slice(0, 10),
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    return Response.json({
      ok: false,
      error: "O diagnóstico por protocolo falhou no SGA.",
      technical: technical.message,
      status: e?.status || null,
    }, { status: e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : e?.status || 502 });
  }
}
