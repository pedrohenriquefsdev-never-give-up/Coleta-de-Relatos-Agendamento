import { SGA_API_PASSWORD, SGA_API_USER, SGA_BASE_URL, SGA_INTEGRATION_TOKEN, sgaConfigStatus } from "@/lib/sga-env";

let cachedUserToken = "";

function urlFor(path: string) {
  return `${SGA_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = typeof data === "object" && data?.mensagem
      ? data.mensagem
      : typeof data === "object" && data?.message
        ? data.message
        : typeof data === "object" && data?.error
          ? data.error
          : String(text || `HTTP ${response.status}`);
    const error: any = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function authenticateSga(force = false): Promise<string> {
  if (!force && cachedUserToken) return cachedUserToken;
  const status = sgaConfigStatus();
  if (!status.configured) throw new Error("SGA_NOT_CONFIGURED");

  const response = await fetch(urlFor("usuario/autenticar"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SGA_INTEGRATION_TOKEN}`,
    },
    body: JSON.stringify({ usuario: SGA_API_USER, senha: SGA_API_PASSWORD }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await parseResponse(response);
  const token = String(data?.token_usuario || "").trim();
  if (!token) throw new Error("SGA_AUTH_NO_USER_TOKEN");
  cachedUserToken = token;
  return token;
}

export async function sgaFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await authenticateSga();
  const response = await fetch(urlFor(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(20000),
  });
  if (response.status === 401 && retry) {
    cachedUserToken = "";
    await authenticateSga(true);
    return sgaFetch(path, init, false);
  }
  return parseResponse(response);
}

export async function listSgaDepartments() {
  return sgaFetch("listar/departamento/ativo");
}

export async function listSgaStatuses() {
  return sgaFetch("listar/status-atendimento/ativo");
}

export async function listSgaTypes() {
  return sgaFetch("listar/tipo-atendimento/ativo");
}

export async function listSgaEventSituations() {
  return sgaFetch("situacao-evento/listar/ativo");
}

export async function listSgaPhotoTypes() {
  return sgaFetch("listar/tipo-foto/ativo");
}

export function normalizeSgaPlate(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export async function listSgaEventsByVehicle(plateOrCode: string | number) {
  const lookup = String(plateOrCode || "").trim();
  if (!lookup) throw new Error("SGA_EVENT_LOOKUP_EMPTY");
  return sgaFetch(`listar/evento-veiculo/${encodeURIComponent(lookup)}`);
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.resultado)) return value.resultado;
  if (Array.isArray(value?.veiculos)) return value.veiculos;
  if (value && typeof value === "object" && (value.codigo_veiculo || value.placa)) return [value];
  return [];
}

function eventsFrom(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.eventos)) return value.eventos;
  return [];
}

async function lookupVehicleByPlate(normalizedPlate: string) {
  const trace: Array<{ step: string; lookup: string; ok: boolean; status?: number; message?: string }> = [];
  const paths = [
    `veiculo/buscar/${encodeURIComponent(normalizedPlate)}/placa`,
    `veiculo/buscar/${encodeURIComponent(normalizedPlate)}`,
  ];

  let lastError: any = null;
  for (const path of paths) {
    try {
      const data = await sgaFetch(path);
      const vehicles = asArray(data);
      const exact = vehicles.find((item) => normalizeSgaPlate(item?.placa) === normalizedPlate);
      const vehicle = exact || vehicles[0] || null;
      trace.push({ step: "vehicle", lookup: path, ok: Boolean(vehicle) });
      if (vehicle) return { data, vehicle, trace, error: null };
    } catch (error: any) {
      lastError = error;
      trace.push({
        step: "vehicle",
        lookup: path,
        ok: false,
        ...(error?.status ? { status: Number(error.status) } : {}),
        message: String(error?.message || error),
      });
    }
  }

  return { data: null, vehicle: null, trace, error: lastError };
}

export async function resolveSgaEventsByPlate(value: unknown) {
  const normalizedPlate = normalizeSgaPlate(value);
  if (!normalizedPlate) throw new Error("SGA_PLATE_EMPTY");

  const trace: Array<{ step: string; lookup: string; ok: boolean; status?: number; message?: string }> = [];
  let lastError: any = null;
  let emptyEventDataByVehicleCode: any = null;

  // Caminho principal: resolve primeiro o veículo pelo endpoint específico de placa.
  const vehicleLookup = await lookupVehicleByPlate(normalizedPlate);
  const vehicleCode = String(vehicleLookup.vehicle?.codigo_veiculo ?? vehicleLookup.vehicle?.codigo ?? "").trim();
  trace.push(...vehicleLookup.trace);
  if (vehicleLookup.error) lastError = vehicleLookup.error;

  if (vehicleCode) {
    try {
      const data = await listSgaEventsByVehicle(vehicleCode);
      trace.push({ step: "event_by_vehicle_code", lookup: vehicleCode, ok: true });
      if (eventsFrom(data).length > 0) {
        return { data, normalizedPlate, vehicleCode, vehicle: vehicleLookup.vehicle, resolvedBy: "vehicle_code", trace };
      }
      emptyEventDataByVehicleCode = data;
      // Mesmo sem eventos, ainda tentamos a placa diretamente como fallback.
    } catch (error: any) {
      lastError = error;
      trace.push({
        step: "event_by_vehicle_code",
        lookup: vehicleCode,
        ok: false,
        ...(error?.status ? { status: Number(error.status) } : {}),
        message: String(error?.message || error),
      });
    }
  }

  // Fallback: alguns ambientes do SGA aceitam a placa diretamente no endpoint de eventos.
  try {
    const data = await listSgaEventsByVehicle(normalizedPlate);
    trace.push({ step: "event_by_plate", lookup: normalizedPlate, ok: true });
    return { data, normalizedPlate, vehicleCode, vehicle: vehicleLookup.vehicle, resolvedBy: "plate", trace };
  } catch (error: any) {
    lastError = error;
    trace.push({
      step: "event_by_plate",
      lookup: normalizedPlate,
      ok: false,
      ...(error?.status ? { status: Number(error.status) } : {}),
      message: String(error?.message || error),
    });
  }

  if (vehicleCode && emptyEventDataByVehicleCode != null) {
    return {
      data: emptyEventDataByVehicleCode,
      normalizedPlate,
      vehicleCode,
      vehicle: vehicleLookup.vehicle,
      resolvedBy: "vehicle_code",
      trace,
    };
  }

  const finalError: any = lastError instanceof Error ? lastError : new Error("SGA_EVENT_NOT_FOUND");
  finalError.trace = trace;
  finalError.normalizedPlate = normalizedPlate;
  finalError.vehicleCode = vehicleCode;
  throw finalError;
}

export async function uploadSgaEventDocument({
  vehicleCode,
  eventCode,
  photoTypeCode,
  filename,
  base64,
  observation,
}: {
  vehicleCode: number;
  eventCode: number;
  photoTypeCode: number;
  filename: string;
  base64: string;
  observation?: string;
}) {
  return sgaFetch("veiculo/foto/cadastrar", {
    method: "POST",
    body: JSON.stringify({
      codigo_veiculo: vehicleCode,
      codigo_evento: eventCode,
      foto: [
        {
          nome_arquivo: filename,
          codigo_tipo: photoTypeCode,
          binario: base64,
          ...(observation ? { observacao: observation } : {}),
        },
      ],
    }),
  });
}
