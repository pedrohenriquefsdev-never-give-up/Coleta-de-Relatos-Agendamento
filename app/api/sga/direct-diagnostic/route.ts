import { NextRequest } from "next/server";
import { requireDeveloper } from "@/lib/server-auth";
import { authenticateSga, normalizeSgaPlate, sgaFetch } from "@/lib/sga-client";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseShape(value: any) {
  return Array.isArray(value) ? "array" : value && typeof value === "object" ? "object" : typeof value;
}

function eventsFrom(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.eventos)) return value.eventos;
  if (Array.isArray(value?.resultado)) return value.resultado;
  if (Array.isArray(value?.dados)) return value.dados;
  return [];
}

function vehiclesFrom(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.veiculos)) return value.veiculos;
  if (Array.isArray(value?.resultado)) return value.resultado;
  if (Array.isArray(value?.dados)) return value.dados;
  if (value && typeof value === "object" && (value?.codigo_veiculo || value?.placa)) return [value];
  return [];
}

function eventPlate(item: any) {
  return String(item?.placa ?? item?.veiculo?.placa ?? "");
}

function eventVehicleCode(item: any) {
  return String(item?.codigo_veiculo ?? item?.veiculo?.codigo ?? "").trim();
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
    data_evento: String(item?.data_evento ?? ""),
    cooperativa: String(cooperative?.descricao ?? cooperative?.nome ?? item?.codigo_cooperativa ?? ""),
    regional: String(regional?.descricao ?? regional?.nome ?? item?.codigo_regional ?? ""),
  };
}

function sanitizeVehicle(item: any) {
  return {
    codigo_veiculo: String(item?.codigo_veiculo ?? item?.codigo ?? ""),
    placa: String(item?.placa ?? ""),
    codigo_regional: String(item?.codigo_regional ?? item?.regional?.codigo ?? ""),
    codigo_cooperativa: String(item?.codigo_cooperativa ?? item?.cooperativa?.codigo ?? ""),
    codigo_associado: String(item?.codigo_associado ?? item?.associado?.codigo ?? ""),
    situacao: String(item?.descricao_situacao ?? item?.situacao ?? ""),
  };
}

type DiagnosticResult = {
  id: string;
  label: string;
  method: "GET" | "POST";
  path: string;
  accepted: boolean;
  status: number | null;
  message: string;
  responseShape: string | null;
  rawCount: number;
  exactPlateCount: number;
  exactVehicleCodeCount: number;
  returnedPlateSamples: string[];
  returnedVehicleCodeSamples: string[];
  events: ReturnType<typeof sanitizeEvent>[];
  vehicles: ReturnType<typeof sanitizeVehicle>[];
};

async function runEventRequest({
  id,
  label,
  path,
  targetPlate,
  targetVehicleCode,
}: {
  id: string;
  label: string;
  path: string;
  targetPlate: string;
  targetVehicleCode?: string;
}): Promise<DiagnosticResult> {
  try {
    const raw = await sgaFetch(path, { signal: AbortSignal.timeout(12000) });
    const rawEvents = eventsFrom(raw);
    const exactPlate = rawEvents.filter((item) => normalizeSgaPlate(eventPlate(item)) === targetPlate);
    const exactVehicle = targetVehicleCode
      ? rawEvents.filter((item) => eventVehicleCode(item) === targetVehicleCode)
      : [];
    const samples = Array.from(new Set(rawEvents.map((item) => normalizeSgaPlate(eventPlate(item))).filter(Boolean))).slice(0, 15);
    const codeSamples = Array.from(new Set(rawEvents.map((item) => eventVehicleCode(item)).filter(Boolean))).slice(0, 15);

    return {
      id,
      label,
      method: "GET",
      path,
      accepted: true,
      status: 200,
      message: exactPlate.length > 0
        ? `A placa ${targetPlate} apareceu no retorno.`
        : rawEvents.length > 0
          ? `Requisição aceita; ${rawEvents.length} evento(s) retornado(s), mas nenhum com a placa exata ${targetPlate}.`
          : "Requisição aceita, sem eventos no retorno.",
      responseShape: responseShape(raw),
      rawCount: rawEvents.length,
      exactPlateCount: exactPlate.length,
      exactVehicleCodeCount: exactVehicle.length,
      returnedPlateSamples: samples,
      returnedVehicleCodeSamples: codeSamples,
      events: [
        ...exactPlate.map(sanitizeEvent),
        ...rawEvents.filter((item) => normalizeSgaPlate(eventPlate(item)) !== targetPlate).slice(0, 8).map(sanitizeEvent),
      ].slice(0, 12),
      vehicles: [],
    };
  } catch (e: any) {
    const technical = safeServerError(e);
    return {
      id,
      label,
      method: "GET",
      path,
      accepted: false,
      status: typeof e?.status === "number" ? e.status : null,
      message: technical.message,
      responseShape: null,
      rawCount: 0,
      exactPlateCount: 0,
      exactVehicleCodeCount: 0,
      returnedPlateSamples: [],
      returnedVehicleCodeSamples: [],
      events: [],
      vehicles: [],
    };
  }
}

async function runVehicleRequest({
  id,
  label,
  path,
  targetPlate,
}: {
  id: string;
  label: string;
  path: string;
  targetPlate: string;
}): Promise<DiagnosticResult> {
  try {
    const raw = await sgaFetch(path, { signal: AbortSignal.timeout(12000) });
    const rawVehicles = vehiclesFrom(raw);
    const exactVehicles = rawVehicles.filter((item) => normalizeSgaPlate(item?.placa) === targetPlate);
    const samples = Array.from(new Set(rawVehicles.map((item) => normalizeSgaPlate(item?.placa)).filter(Boolean))).slice(0, 15);
    const codeSamples = Array.from(new Set(rawVehicles.map((item) => String(item?.codigo_veiculo ?? item?.codigo ?? "").trim()).filter(Boolean))).slice(0, 15);

    return {
      id,
      label,
      method: "GET",
      path,
      accepted: true,
      status: 200,
      message: exactVehicles.length > 0
        ? `Veículo exato ${targetPlate} localizado.`
        : rawVehicles.length > 0
          ? `Requisição aceita; retornou veículo(s), mas nenhum com a placa exata ${targetPlate}.`
          : "Requisição aceita, sem veículo no retorno.",
      responseShape: responseShape(raw),
      rawCount: rawVehicles.length,
      exactPlateCount: exactVehicles.length,
      exactVehicleCodeCount: 0,
      returnedPlateSamples: samples,
      returnedVehicleCodeSamples: codeSamples,
      events: [],
      vehicles: [
        ...exactVehicles.map(sanitizeVehicle),
        ...rawVehicles.filter((item) => normalizeSgaPlate(item?.placa) !== targetPlate).slice(0, 8).map(sanitizeVehicle),
      ].slice(0, 12),
    };
  } catch (e: any) {
    const technical = safeServerError(e);
    return {
      id,
      label,
      method: "GET",
      path,
      accepted: false,
      status: typeof e?.status === "number" ? e.status : null,
      message: technical.message,
      responseShape: null,
      rawCount: 0,
      exactPlateCount: 0,
      exactVehicleCodeCount: 0,
      returnedPlateSamples: [],
      returnedVehicleCodeSamples: [],
      events: [],
      vehicles: [],
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireDeveloper(req);
    await authenticateSga();

    const targetPlate = normalizeSgaPlate(req.nextUrl.searchParams.get("plate") || "");
    if (!targetPlate) return Response.json({ error: "Informe uma placa válida para o diagnóstico." }, { status: 400 });

    const legacyPlate = /^[A-Z]{3}\d{4}$/.test(targetPlate)
      ? `${targetPlate.slice(0, 3)}-${targetPlate.slice(3)}`
      : targetPlate;

    const vehicleStandard = await runVehicleRequest({
      id: "vehicle_standard",
      label: "Veículo — busca comum",
      path: `veiculo/buscar/${encodeURIComponent(targetPlate)}/placa`,
      targetPlate,
    });

    const vehiclePermission = await runVehicleRequest({
      id: "vehicle_permission",
      label: "Veículo — busca por permissão",
      path: `veiculo/buscar-por-permissao/${encodeURIComponent(targetPlate)}/placa`,
      targetPlate,
    });

    const exactVehicle = [
      ...vehicleStandard.vehicles,
      ...vehiclePermission.vehicles,
    ].find((item) => normalizeSgaPlate(item.placa) === targetPlate);
    const targetVehicleCode = String(exactVehicle?.codigo_veiculo || "").trim();

    const tests: DiagnosticResult[] = [vehicleStandard, vehiclePermission];

    if (targetVehicleCode) {
      tests.push(await runEventRequest({
        id: "event_vehicle_code",
        label: `Evento por veículo — código interno (${targetVehicleCode})`,
        path: `listar/evento-veiculo/${encodeURIComponent(targetVehicleCode)}`,
        targetPlate,
        targetVehicleCode,
      }));
    }

    tests.push(await runEventRequest({
      id: "event_vehicle_plate",
      label: `Evento por veículo — placa (${legacyPlate})`,
      path: `listar/evento-veiculo/${encodeURIComponent(legacyPlate)}`,
      targetPlate,
      targetVehicleCode,
    }));

    if (legacyPlate !== targetPlate) {
      tests.push(await runEventRequest({
        id: "event_vehicle_normalized_plate",
        label: `Evento por veículo — placa normalizada (${targetPlate})`,
        path: `listar/evento-veiculo/${encodeURIComponent(targetPlate)}`,
        targetPlate,
        targetVehicleCode,
      }));
    }

    const eventTests = tests.filter((item) => item.id.startsWith("event_"));
    const exactEventTests = eventTests.filter((item) => item.exactPlateCount > 0);

    return Response.json({
      ok: true,
      version: "1.39.23",
      targetPlate,
      legacyPlate,
      targetVehicleCode: targetVehicleCode || null,
      vehicleVisibleCommon: vehicleStandard.exactPlateCount > 0,
      vehicleVisibleByPermission: vehiclePermission.exactPlateCount > 0,
      eventVisibleAnywhere: exactEventTests.length > 0,
      eventVisibleIn: exactEventTests.map((item) => item.label),
      tests,
    });
  } catch (e: any) {
    const technical = safeServerError(e);
    return Response.json({
      ok: false,
      error: "Não foi possível executar o diagnóstico direto do SGA.",
      technical: technical.message,
      status: e?.status || null,
    }, { status: e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500 });
  }
}
