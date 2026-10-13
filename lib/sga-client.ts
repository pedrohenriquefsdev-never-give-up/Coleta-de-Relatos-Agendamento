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
  if (Array.isArray(value?.dados)) return value.dados;
  if (value && typeof value === "object" && (value.codigo_veiculo || value.placa)) return [value];
  return [];
}

function eventsFrom(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.eventos)) return value.eventos;
  return [];
}

function withFilteredEvents(value: any, events: any[]) {
  // Mantemos um formato estável para o frontend: sempre { eventos: [...] }.
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value, eventos: events };
  return { eventos: events };
}

function vehicleCodeOf(item: any) {
  return String(item?.codigo_veiculo ?? item?.codigo ?? "").trim();
}

function exactVehicleForPlate(items: any[], normalizedPlate: string) {
  return items.find((item) => normalizeSgaPlate(item?.placa) === normalizedPlate) || null;
}

function eventMatchesPlateOrVehicle(event: any, normalizedPlate: string, vehicleCode?: string) {
  const eventPlate = normalizeSgaPlate(event?.placa);
  const eventVehicleCode = String(event?.codigo_veiculo ?? "").trim();

  // Se a API trouxe a placa, ela precisa ser exatamente a placa solicitada.
  if (eventPlate) return eventPlate === normalizedPlate;

  // Alguns retornos podem omitir a placa. Nesse caso só aceitamos quando o
  // código do veículo veio de uma busca EXATA da placa no cadastro do SGA.
  return Boolean(vehicleCode && eventVehicleCode && eventVehicleCode === vehicleCode);
}

type SgaResolutionTrace = {
  step: string;
  lookup: string;
  ok: boolean;
  status?: number;
  message?: string;
  returnedPlates?: string[];
};

async function lookupVehicleByPlate(normalizedPlate: string) {
  const trace: SgaResolutionTrace[] = [];
  const paths = [
    `veiculo/buscar/${encodeURIComponent(normalizedPlate)}/placa`,
    `veiculo/buscar-por-permissao/${encodeURIComponent(normalizedPlate)}/placa`,
    `veiculo/buscar/${encodeURIComponent(normalizedPlate)}`,
    `veiculo/buscar-por-permissao/${encodeURIComponent(normalizedPlate)}`,
  ];

  let lastError: any = null;
  let receivedAnyResponse = false;

  for (const path of paths) {
    try {
      const data = await sgaFetch(path);
      receivedAnyResponse = true;
      const vehicles = asArray(data);
      const exact = exactVehicleForPlate(vehicles, normalizedPlate);
      const returnedPlates = Array.from(new Set(
        vehicles
          .map((item) => normalizeSgaPlate(item?.placa))
          .filter(Boolean),
      )).slice(0, 8);

      if (exact) {
        trace.push({ step: "vehicle_exact", lookup: path, ok: true, returnedPlates });
        return { data, vehicle: exact, trace, error: null };
      }

      trace.push({
        step: "vehicle_exact",
        lookup: path,
        ok: false,
        message: vehicles.length > 0
          ? `Resposta descartada: nenhum veículo retornado possui a placa exata ${normalizedPlate}.`
          : `Nenhum veículo retornado para a placa ${normalizedPlate}.`,
        returnedPlates,
      });
    } catch (error: any) {
      lastError = error;
      trace.push({
        step: "vehicle_exact",
        lookup: path,
        ok: false,
        ...(error?.status ? { status: Number(error.status) } : {}),
        message: String(error?.message || error),
      });
    }
  }

  if (receivedAnyResponse && !lastError) {
    lastError = new Error(`Nenhum veículo com a placa exata ${normalizedPlate} foi localizado no SGA.`);
    lastError.code = "SGA_EXACT_VEHICLE_NOT_FOUND";
  }

  return { data: null, vehicle: null, trace, error: lastError };
}

export async function resolveSgaEventsByPlate(value: unknown) {
  const normalizedPlate = normalizeSgaPlate(value);
  if (!normalizedPlate) throw new Error("SGA_PLATE_EMPTY");

  const trace: SgaResolutionTrace[] = [];
  let lastError: any = null;
  let exactVehicle: any = null;
  let vehicleCode = "";

  // 1) Caminho preferencial: localizar SOMENTE um veículo cuja placa seja
  // exatamente igual à placa solicitada. Nunca usamos o primeiro item retornado.
  const vehicleLookup = await lookupVehicleByPlate(normalizedPlate);
  trace.push(...vehicleLookup.trace);
  exactVehicle = vehicleLookup.vehicle;
  vehicleCode = vehicleCodeOf(exactVehicle);
  if (vehicleLookup.error) lastError = vehicleLookup.error;

  // 2) Se encontramos o veículo exato, consultamos os eventos pelo código interno
  // e filtramos novamente para impedir qualquer associação cruzada.
  if (vehicleCode) {
    try {
      const data = await listSgaEventsByVehicle(vehicleCode);
      const rawEvents = eventsFrom(data);
      const exactEvents = rawEvents.filter((event) => eventMatchesPlateOrVehicle(event, normalizedPlate, vehicleCode));

      trace.push({
        step: "event_by_exact_vehicle_code",
        lookup: vehicleCode,
        ok: exactEvents.length > 0,
        message: exactEvents.length > 0
          ? `${exactEvents.length} evento(s) confirmado(s) para ${normalizedPlate}.`
          : rawEvents.length > 0
            ? `Eventos retornados pelo código ${vehicleCode} foram descartados por não corresponderem à placa ${normalizedPlate}.`
            : `Nenhum evento encontrado para o veículo ${vehicleCode}.`,
        returnedPlates: Array.from(new Set(rawEvents.map((event) => normalizeSgaPlate(event?.placa)).filter(Boolean))).slice(0, 8),
      });

      if (exactEvents.length > 0) {
        return {
          data: withFilteredEvents(data, exactEvents),
          normalizedPlate,
          vehicleCode,
          vehicle: exactVehicle,
          resolvedBy: "vehicle_code_exact",
          trace,
        };
      }
    } catch (error: any) {
      lastError = error;
      trace.push({
        step: "event_by_exact_vehicle_code",
        lookup: vehicleCode,
        ok: false,
        ...(error?.status ? { status: Number(error.status) } : {}),
        message: String(error?.message || error),
      });
    }
  }

  // 3) Fallback controlado: consulta direta pela placa. Mesmo que o SGA responda,
  // só aceitamos eventos cuja placa retornada seja EXATAMENTE a solicitada.
  try {
    const data = await listSgaEventsByVehicle(normalizedPlate);
    const rawEvents = eventsFrom(data);
    const exactEvents = rawEvents.filter((event) => normalizeSgaPlate(event?.placa) === normalizedPlate);

    trace.push({
      step: "event_by_exact_plate",
      lookup: normalizedPlate,
      ok: exactEvents.length > 0,
      message: exactEvents.length > 0
        ? `${exactEvents.length} evento(s) confirmado(s) pela placa.`
        : rawEvents.length > 0
          ? `A consulta retornou eventos, mas nenhum pertence à placa exata ${normalizedPlate}; todos foram descartados.`
          : `Nenhum evento encontrado diretamente para ${normalizedPlate}.`,
      returnedPlates: Array.from(new Set(rawEvents.map((event) => normalizeSgaPlate(event?.placa)).filter(Boolean))).slice(0, 8),
    });

    if (exactEvents.length > 0) {
      const eventVehicleCode = String(exactEvents[0]?.codigo_veiculo ?? "").trim();
      return {
        data: withFilteredEvents(data, exactEvents),
        normalizedPlate,
        vehicleCode: vehicleCode || eventVehicleCode,
        vehicle: exactVehicle,
        resolvedBy: "plate_exact",
        trace,
      };
    }
  } catch (error: any) {
    lastError = error;
    trace.push({
      step: "event_by_exact_plate",
      lookup: normalizedPlate,
      ok: false,
      ...(error?.status ? { status: Number(error.status) } : {}),
      message: String(error?.message || error),
    });
  }

  const finalError: any = new Error(
    `Nenhum evento com correspondência exata para a placa ${normalizedPlate} foi localizado no SGA.`,
  );
  finalError.code = "SGA_EXACT_EVENT_NOT_FOUND";
  finalError.cause = lastError;
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
