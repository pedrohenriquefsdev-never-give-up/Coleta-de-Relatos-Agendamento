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
  if (Array.isArray(value?.resultado)) return value.resultado;
  if (Array.isArray(value?.dados)) return value.dados;
  return [];
}

function eventPlateOf(event: any) {
  return normalizeSgaPlate(event?.placa ?? event?.veiculo?.placa ?? "");
}

function eventVehicleCodeOf(event: any) {
  return String(event?.codigo_veiculo ?? event?.veiculo?.codigo ?? "").trim();
}

function normalizeSgaEvent(event: any) {
  const vehicle = event?.veiculo || {};
  const associate = event?.associado || {};
  return {
    ...event,
    codigo_evento: event?.codigo_evento ?? event?.codigo ?? "",
    codigo_veiculo: event?.codigo_veiculo ?? vehicle?.codigo ?? "",
    placa: event?.placa ?? vehicle?.placa ?? "",
    protocolo: event?.protocolo ?? event?.protocolo_evento ?? "",
    nome_associado: event?.nome_associado ?? associate?.nome ?? "",
    cpf_associado: event?.cpf_associado ?? associate?.cpf ?? "",
    descricao_motivo: event?.descricao_motivo ?? event?.motivo ?? "",
    situacao_evento: event?.situacao_evento ?? event?.descricao_situacao ?? "",
  };
}

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
}

function formatSgaDate(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function formatIsoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseSgaDate(value: unknown): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return parsed;
}

function resolveReferenceDate(value?: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return normalizeDateOnly(value);
  const parsed = parseSgaDate(value);
  if (parsed) return parsed;
  return normalizeDateOnly(new Date());
}

function addDays(date: Date, amount: number) {
  const next = normalizeDateOnly(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function laterDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

export async function listSgaEventsByDateRange(
  startDate: Date,
  endDate: Date,
  page = 0,
  pageSize = 500,
) {
  return sgaFetch("listar/evento", {
    method: "POST",
    body: JSON.stringify({
      data_cadastro: formatSgaDate(startDate),
      data_cadastro_final: formatSgaDate(endDate),
      inicio_paginacao: page,
      quantidade_por_pagina: pageSize,
    }),
  });
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
  const eventPlate = eventPlateOf(event);
  const eventVehicleCode = eventVehicleCodeOf(event);

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

type SgaGeneralListDebugPage = {
  window: string;
  page: number;
  rawCount: number;
  responseShape: "array" | "object" | "other";
  responseKeys: string[];
  pagination: {
    total: number | null;
    numberPages: number | null;
    currentPage: number | null;
    showing: number | null;
  } | null;
  knownExactPlateMatches: number;
  anyPlateFieldExactMatches: number;
  exactVehicleCodeMatches: number;
  eventKeys: string[];
  vehicleKeys: string[];
  detectedPlatePaths: string[];
  returnedPlateSamples: string[];
  vehicleCodeSamples: string[];
};

type SgaGeneralListDebug = {
  targetPlate: string;
  targetVehicleCode: string;
  pageSize: number;
  pages: SgaGeneralListDebugPage[];
  capped: boolean;
};

function safeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function responseShape(value: any): "array" | "object" | "other" {
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  return "other";
}

function collectPrimitivePaths(
  value: any,
  matcher: (key: string, path: string) => boolean,
  path = "",
  depth = 0,
  output: Array<{ path: string; value: string }> = [],
) {
  if (!value || typeof value !== "object" || depth > 3 || output.length >= 80) return output;
  const entries = Array.isArray(value) ? value.slice(0, 8).map((item, index) => [String(index), item] as const) : Object.entries(value);
  for (const [key, child] of entries) {
    if (output.length >= 80) break;
    const childPath = path ? `${path}.${key}` : key;
    if (matcher(key, childPath) && (typeof child === "string" || typeof child === "number")) {
      output.push({ path: childPath, value: String(child) });
    }
    if (child && typeof child === "object") collectPrimitivePaths(child, matcher, childPath, depth + 1, output);
  }
  return output;
}

function debugPlateFields(event: any) {
  return collectPrimitivePaths(event, (key) => key.toLowerCase().includes("placa"));
}

function debugVehicleCodeFields(event: any) {
  return collectPrimitivePaths(event, (key, path) => {
    const compactKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const compactPath = path.toLowerCase().replace(/[^a-z0-9.]/g, "");
    return compactKey === "codigoveiculo" || compactPath.endsWith("veiculo.codigo");
  });
}

function maskDebugPlate(value: unknown, targetPlate: string) {
  const normalized = normalizeSgaPlate(value);
  if (!normalized) return "";
  if (normalized === targetPlate) return normalized;
  return `${normalized.slice(0, 3)}****`;
}

function makeGeneralDebugPage(
  data: any,
  rawEvents: any[],
  normalizedPlate: string,
  vehicleCode: string,
  label: string,
  page: number,
): SgaGeneralListDebugPage {
  const eventKeySet = new Set<string>();
  const vehicleKeySet = new Set<string>();
  const platePathSet = new Set<string>();
  const plateSamples = new Set<string>();
  const vehicleCodeSamples = new Set<string>();
  let anyPlateFieldExactMatches = 0;
  let exactVehicleCodeMatches = 0;

  for (const event of rawEvents.slice(0, 100)) {
    if (event && typeof event === "object") Object.keys(event).forEach((key) => eventKeySet.add(key));
    if (event?.veiculo && typeof event.veiculo === "object") Object.keys(event.veiculo).forEach((key) => vehicleKeySet.add(key));

    const plateFields = debugPlateFields(event);
    let eventHasExactPlate = false;
    for (const item of plateFields) {
      platePathSet.add(item.path);
      const masked = maskDebugPlate(item.value, normalizedPlate);
      if (masked) plateSamples.add(masked);
      if (normalizeSgaPlate(item.value) === normalizedPlate) eventHasExactPlate = true;
    }
    if (eventHasExactPlate) anyPlateFieldExactMatches += 1;

    const codeFields = debugVehicleCodeFields(event);
    let eventHasVehicleCode = false;
    for (const item of codeFields) {
      const code = String(item.value || "").trim();
      if (code) vehicleCodeSamples.add(code);
      if (vehicleCode && code === vehicleCode) eventHasVehicleCode = true;
    }
    if (eventHasVehicleCode) exactVehicleCodeMatches += 1;
  }

  const paginationRaw = data?.paginacao;
  const pagination = paginationRaw && typeof paginationRaw === "object"
    ? {
        total: safeNumber(paginationRaw.total),
        numberPages: safeNumber(paginationRaw.numero_paginas ?? paginationRaw.total_paginas),
        currentPage: safeNumber(paginationRaw.pagina_corrente ?? paginationRaw.pagina_atual),
        showing: safeNumber(paginationRaw.mostrando ?? paginationRaw.quantidade),
      }
    : null;

  return {
    window: label,
    page: page + 1,
    rawCount: rawEvents.length,
    responseShape: responseShape(data),
    responseKeys: data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data).slice(0, 30) : [],
    pagination,
    knownExactPlateMatches: rawEvents.filter((event) => eventPlateOf(event) === normalizedPlate).length,
    anyPlateFieldExactMatches,
    exactVehicleCodeMatches,
    eventKeys: Array.from(eventKeySet).sort().slice(0, 60),
    vehicleKeys: Array.from(vehicleKeySet).sort().slice(0, 40),
    detectedPlatePaths: Array.from(platePathSet).sort().slice(0, 30),
    returnedPlateSamples: Array.from(plateSamples).slice(0, 12),
    vehicleCodeSamples: Array.from(vehicleCodeSamples).slice(0, 12),
  };
}

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

function eventSortValue(event: any) {
  const raw = event?.data_cadastro_evento ?? event?.data_cadastro ?? event?.data_evento ?? "";
  const parsed = parseSgaDate(raw);
  return parsed?.getTime() || 0;
}

function dedupeEvents(events: any[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${String(event?.codigo_evento ?? event?.codigo ?? "")}|${String(event?.protocolo ?? event?.protocolo_evento ?? "")}|${eventVehicleCodeOf(event)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function lookupEventsInGeneralList(
  normalizedPlate: string,
  trace: SgaResolutionTrace[],
  exactVehicle: any,
  referenceDateInput?: unknown,
) {
  // A data vem preferencialmente do navegador do usuário. Isso evita depender
  // do relógio/data do runtime da Vercel para montar as janelas históricas.
  const referenceDate = resolveReferenceDate(referenceDateInput);
  const rawContractDate = exactVehicle?.data_contrato ?? exactVehicle?.data_cadastro ?? exactVehicle?.data_reativacao ?? "";
  const parsedContractDate = parseSgaDate(rawContractDate);

  // O evento não pode ser anterior à existência do veículo no SGA. Quando a API
  // não trouxer nenhuma data utilizável, usamos uma margem ampla de 20 anos.
  const fallbackLowerBound = addDays(referenceDate, -(366 * 20));
  const lowerBound = parsedContractDate && parsedContractDate.getTime() <= referenceDate.getTime()
    ? parsedContractDate
    : fallbackLowerBound;

  trace.push({
    step: "event_general_list_reference",
    lookup: formatSgaDate(referenceDate),
    ok: true,
    message: parsedContractDate
      ? `Busca histórica até a data de contrato/cadastro do veículo: ${formatSgaDate(lowerBound)}.`
      : `O SGA não informou data de contrato/cadastro utilizável; aplicada margem histórica de segurança.`,
  });

  const windowDays = 30;
  const pageSize = 500;
  const hardPageSafetyLimit = 100;
  const generalDebug: SgaGeneralListDebug = {
    targetPlate: normalizedPlate,
    targetVehicleCode: vehicleCodeOf(exactVehicle),
    pageSize,
    pages: [],
    capped: false,
  };
  let cursorEnd = referenceDate;
  let windowsSearched = 0;

  while (cursorEnd.getTime() >= lowerBound.getTime()) {
    const naturalStart = addDays(cursorEnd, -(windowDays - 1));
    const start = laterDate(naturalStart, lowerBound);
    const end = cursorEnd;
    const label = `${formatSgaDate(start)}–${formatSgaDate(end)}`;
    windowsSearched += 1;

    const matchesInWindow: any[] = [];
    let page = 0;

    while (page < hardPageSafetyLimit) {
      try {
        const data = await listSgaEventsByDateRange(start, end, page, pageSize);
        const rawEvents = eventsFrom(data);
        const normalizedEvents = rawEvents.map(normalizeSgaEvent);
        matchesInWindow.push(...normalizedEvents.filter((event) => eventPlateOf(event) === normalizedPlate));

        if (generalDebug.pages.length < 180) {
          generalDebug.pages.push(makeGeneralDebugPage(
            data,
            rawEvents,
            normalizedPlate,
            generalDebug.targetVehicleCode,
            label,
            page,
          ));
        } else {
          generalDebug.capped = true;
        }

        const totalPagesRaw = data?.paginacao?.numero_paginas ?? data?.paginacao?.total_paginas;
        const totalPages = Number(totalPagesRaw);
        const hasKnownTotalPages = Number.isFinite(totalPages) && totalPages > 0;

        trace.push({
          step: "event_general_list_exact_plate",
          lookup: `${label} / página ${page + 1}`,
          ok: matchesInWindow.length > 0,
          message: matchesInWindow.length > 0
            ? `${matchesInWindow.length} evento(s) da placa ${normalizedPlate} localizado(s) nesta janela.`
            : `${rawEvents.length} evento(s) analisado(s) nesta página; nenhum pertence à placa ${normalizedPlate}.`,
          returnedPlates: matchesInWindow.length > 0 ? [normalizedPlate] : [],
        });

        if (rawEvents.length === 0) break;
        if (hasKnownTotalPages && page + 1 >= totalPages) break;
        if (!hasKnownTotalPages && rawEvents.length < pageSize) break;
        page += 1;
      } catch (error: any) {
        trace.push({
          step: "event_general_list_exact_plate",
          lookup: `${label} / página ${page + 1}`,
          ok: false,
          ...(error?.status ? { status: Number(error.status) } : {}),
          message: String(error?.message || error),
        });
        // Uma janela que falhou não deve derrubar toda a estratégia. Continuamos
        // para a próxima janela histórica, mantendo o diagnóstico para Admin/Dev.
        break;
      }
    }

    const exactEvents = dedupeEvents(matchesInWindow).sort((a, b) => eventSortValue(b) - eventSortValue(a));
    if (exactEvents.length > 0) {
      const eventVehicleCode = eventVehicleCodeOf(exactEvents[0]);
      return {
        data: { eventos: exactEvents },
        vehicleCode: eventVehicleCode,
        resolvedBy: "event_list_exact_plate",
        referenceDate: formatIsoDate(referenceDate),
        vehicleContractDate: parsedContractDate ? formatIsoDate(lowerBound) : null,
        windowsSearched,
        generalDebug,
      };
    }

    // Próxima janela termina no dia imediatamente anterior ao início da atual,
    // sem sobreposição e sem buracos entre os intervalos.
    cursorEnd = addDays(start, -1);
  }

  return {
    data: null,
    vehicleCode: "",
    resolvedBy: "",
    referenceDate: formatIsoDate(referenceDate),
    vehicleContractDate: parsedContractDate ? formatIsoDate(lowerBound) : null,
    windowsSearched,
    generalDebug,
  };
}

export async function resolveSgaEventsByPlate(value: unknown, options: { referenceDate?: unknown } = {}) {
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
        returnedPlates: Array.from(new Set(rawEvents.map((event) => eventPlateOf(event)).filter(Boolean))).slice(0, 8),
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
    const exactEvents = rawEvents.map(normalizeSgaEvent).filter((event) => eventPlateOf(event) === normalizedPlate);

    trace.push({
      step: "event_by_exact_plate",
      lookup: normalizedPlate,
      ok: exactEvents.length > 0,
      message: exactEvents.length > 0
        ? `${exactEvents.length} evento(s) confirmado(s) pela placa.`
        : rawEvents.length > 0
          ? `A consulta retornou eventos, mas nenhum pertence à placa exata ${normalizedPlate}; todos foram descartados.`
          : `Nenhum evento encontrado diretamente para ${normalizedPlate}.`,
      returnedPlates: Array.from(new Set(rawEvents.map((event) => eventPlateOf(event)).filter(Boolean))).slice(0, 8),
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

  // 4) Fallback automático final: consulta a listagem geral de eventos em
  // janelas de 30 dias e filtra SOMENTE a placa exata. Isso evita exigir que o
  // operador abra o SGA para descobrir ou digitar protocolo.
  const generalLookup = await lookupEventsInGeneralList(normalizedPlate, trace, exactVehicle, options.referenceDate);
  if (generalLookup.data) {
    return {
      data: generalLookup.data,
      normalizedPlate,
      vehicleCode: generalLookup.vehicleCode || vehicleCode,
      vehicle: exactVehicle,
      resolvedBy: generalLookup.resolvedBy,
      trace,
      referenceDate: generalLookup.referenceDate,
      vehicleContractDate: generalLookup.vehicleContractDate,
      windowsSearched: generalLookup.windowsSearched,
      generalDebug: generalLookup.generalDebug,
    };
  }

  const finalError: any = new Error(
    `Nenhum evento com correspondência exata para a placa ${normalizedPlate} foi localizado no SGA.`,
  );
  finalError.code = "SGA_EXACT_EVENT_NOT_FOUND";
  finalError.cause = lastError;
  finalError.trace = trace;
  finalError.normalizedPlate = normalizedPlate;
  finalError.vehicleCode = vehicleCode;
  finalError.referenceDate = generalLookup.referenceDate;
  finalError.vehicleContractDate = generalLookup.vehicleContractDate;
  finalError.windowsSearched = generalLookup.windowsSearched;
  finalError.generalDebug = generalLookup.generalDebug;
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
