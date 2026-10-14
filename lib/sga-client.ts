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

export async function listSgaEventsByVehicle(plateOrCode: string | number, timeoutMs = 8000) {
  const lookup = String(plateOrCode || "").trim();
  if (!lookup) throw new Error("SGA_EVENT_LOOKUP_EMPTY");
  return sgaFetch(`listar/evento-veiculo/${encodeURIComponent(lookup)}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
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

export async function listSgaEventByProtocol(protocol: string | number, timeoutMs = 8000) {
  const value = String(protocol || "").trim();
  if (!value) throw new Error("SGA_EVENT_PROTOCOL_EMPTY");
  return sgaFetch("listar/evento", {
    method: "POST",
    body: JSON.stringify({ protocolo: value, inicio_paginacao: 0, quantidade_por_pagina: 10 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function listSgaEventsByDateRange(
  startDate: Date,
  endDate: Date,
  page = 0,
  pageSize = 100,
  timeoutMs = 7000,
) {
  return sgaFetch("listar/evento", {
    method: "POST",
    body: JSON.stringify({
      data_cadastro: formatSgaDate(startDate),
      data_cadastro_final: formatSgaDate(endDate),
      inicio_paginacao: page,
      quantidade_por_pagina: pageSize,
    }),
    signal: AbortSignal.timeout(timeoutMs),
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
  windowDays: number;
  pageSize: number;
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

type SgaGeneralListDebugAttempt = {
  window: string;
  windowDays: number;
  pageSize: number;
  page: number;
  ok: boolean;
  status?: number;
  message: string;
};

type SgaGeneralListDebug = {
  targetPlate: string;
  targetVehicleCode: string;
  requestedPageSizes: number[];
  requestedWindowDays: number[];
  effectivePageSize: number | null;
  effectiveWindowDays: number | null;
  pages: SgaGeneralListDebugPage[];
  attempts: SgaGeneralListDebugAttempt[];
  capped: boolean;
  requestCount?: number;
  elapsedMs?: number;
  stoppedReason?: string | null;
  nextCursorDate?: string | null;
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
  windowDays: number,
  pageSize: number,
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
    windowDays,
    pageSize,
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
  cursorEndInput?: unknown,
) {
  const startedAt = Date.now();
  const referenceDate = resolveReferenceDate(referenceDateInput);
  const rawContractDate = exactVehicle?.data_contrato ?? exactVehicle?.data_cadastro ?? exactVehicle?.data_reativacao ?? "";
  const parsedContractDate = parseSgaDate(rawContractDate);

  // A busca histórica só é executada quando o veículo exato foi localizado.
  // Isso evita uma varredura extensa sem um veículo confiável para validação.
  if (!exactVehicle) {
    return {
      data: null,
      vehicleCode: "",
      resolvedBy: "",
      referenceDate: formatIsoDate(referenceDate),
      vehicleContractDate: null,
      windowsSearched: 0,
      pending: false,
      nextCursorDate: null,
      generalDebug: {
        targetPlate: normalizedPlate,
        targetVehicleCode: "",
        requestedPageSizes: [25, 10],
        requestedWindowDays: [30, 15, 7, 1],
        effectivePageSize: null,
        effectiveWindowDays: null,
        pages: [],
        attempts: [],
        capped: false,
        requestCount: 0,
        elapsedMs: Date.now() - startedAt,
        stoppedReason: "vehicle_not_resolved",
        nextCursorDate: null,
      } satisfies SgaGeneralListDebug,
    };
  }

  const fallbackLowerBound = addDays(referenceDate, -(366 * 20));
  const lowerBound = parsedContractDate && parsedContractDate.getTime() <= referenceDate.getTime()
    ? parsedContractDate
    : fallbackLowerBound;

  let cursorEnd = cursorEndInput ? resolveReferenceDate(cursorEndInput) : referenceDate;
  if (cursorEnd.getTime() > referenceDate.getTime()) cursorEnd = referenceDate;
  if (cursorEnd.getTime() < lowerBound.getTime()) cursorEnd = lowerBound;

  trace.push({
    step: "event_general_list_reference",
    lookup: formatSgaDate(cursorEnd),
    ok: true,
    message: parsedContractDate
      ? `Busca segmentada até a data de contrato/cadastro do veículo: ${formatSgaDate(lowerBound)}.`
      : `O SGA não informou data de contrato/cadastro utilizável; aplicada margem histórica de segurança.`,
  });

  // V1.39.16: cada requisição do Portal faz apenas um bloco curto de busca.
  // O navegador continua automaticamente pelo próximo bloco, evitando timeout
  // do backend e mantendo suporte a eventos antigos sem exigir ação do usuário.
  const pageSizeCandidates = [25, 10];
  const windowDayCandidates = [30, 15, 7, 1];
  const maxCompletedWindowsPerChunk = 3;
  const maxRequestsPerChunk = 18;
  const maxChunkMs = 12000;
  const hardPagesPerWindow = 12;
  const generalDebug: SgaGeneralListDebug = {
    targetPlate: normalizedPlate,
    targetVehicleCode: vehicleCodeOf(exactVehicle),
    requestedPageSizes: pageSizeCandidates,
    requestedWindowDays: windowDayCandidates,
    effectivePageSize: null,
    effectiveWindowDays: null,
    pages: [],
    attempts: [],
    capped: false,
    requestCount: 0,
    elapsedMs: 0,
    stoppedReason: null,
    nextCursorDate: null,
  };

  const addAttempt = (item: SgaGeneralListDebugAttempt) => {
    if (generalDebug.attempts.length < 80) generalDebug.attempts.push(item);
    else generalDebug.capped = true;
  };
  const addDebugPage = (item: SgaGeneralListDebugPage) => {
    if (generalDebug.pages.length < 60) generalDebug.pages.push(item);
    else generalDebug.capped = true;
  };
  const budgetExhausted = () =>
    Number(generalDebug.requestCount || 0) >= maxRequestsPerChunk || Date.now() - startedAt >= maxChunkMs;

  let windowsSearched = 0;
  let preferredPageSize = 25;
  let preferredWindowDays = 30;

  while (cursorEnd.getTime() >= lowerBound.getTime() && windowsSearched < maxCompletedWindowsPerChunk) {
    if (budgetExhausted()) break;

    const windowCandidates = [preferredWindowDays, ...windowDayCandidates.filter((v) => v !== preferredWindowDays)];
    let completedWindow: { start: Date; end: Date; matches: any[]; pageSize: number; windowDays: number } | null = null;

    for (const requestedWindowDays of windowCandidates) {
      if (budgetExhausted()) break;
      const naturalStart = addDays(cursorEnd, -(requestedWindowDays - 1));
      const start = laterDate(naturalStart, lowerBound);
      const end = cursorEnd;
      const actualWindowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const label = `${formatSgaDate(start)}–${formatSgaDate(end)}`;
      const pageCandidates = [preferredPageSize, ...pageSizeCandidates.filter((v) => v !== preferredPageSize)];

      for (const pageSize of pageCandidates) {
        if (budgetExhausted()) break;
        const matches: any[] = [];
        let failed = false;
        let completed = false;

        for (let page = 0; page < hardPagesPerWindow; page += 1) {
          if (budgetExhausted()) break;
          try {
            generalDebug.requestCount = Number(generalDebug.requestCount || 0) + 1;
            const data = await listSgaEventsByDateRange(start, end, page, pageSize, 6000);
            const rawEvents = eventsFrom(data);
            const normalizedEvents = rawEvents.map(normalizeSgaEvent);
            const exactMatches = normalizedEvents.filter((event) => eventPlateOf(event) === normalizedPlate);
            matches.push(...exactMatches);

            addAttempt({
              window: label,
              windowDays: actualWindowDays,
              pageSize,
              page: page + 1,
              ok: true,
              message: `${rawEvents.length} evento(s) retornado(s).`,
            });
            addDebugPage(makeGeneralDebugPage(data, rawEvents, normalizedPlate, generalDebug.targetVehicleCode, label, actualWindowDays, pageSize, page));

            trace.push({
              step: "event_general_list_exact_plate",
              lookup: `${label} / página ${page + 1} / ${pageSize} registros`,
              ok: exactMatches.length > 0,
              message: exactMatches.length > 0
                ? `${exactMatches.length} evento(s) da placa ${normalizedPlate} localizado(s).`
                : `${rawEvents.length} evento(s) analisado(s); nenhum pertence à placa ${normalizedPlate}.`,
              returnedPlates: exactMatches.length > 0 ? [normalizedPlate] : [],
            });

            // Encontrou a placa: não precisamos continuar paginando nem varrendo histórico.
            if (matches.length > 0) {
              generalDebug.effectivePageSize = pageSize;
              generalDebug.effectiveWindowDays = actualWindowDays;
              generalDebug.elapsedMs = Date.now() - startedAt;
              const found = dedupeEvents(matches).sort((a, b) => eventSortValue(b) - eventSortValue(a));
              return {
                data: { eventos: found },
                vehicleCode: eventVehicleCodeOf(found[0]),
                resolvedBy: "event_list_exact_plate",
                referenceDate: formatIsoDate(referenceDate),
                vehicleContractDate: parsedContractDate ? formatIsoDate(lowerBound) : null,
                windowsSearched: windowsSearched + 1,
                pending: false,
                nextCursorDate: null,
                generalDebug,
              };
            }

            const totalPagesRaw = data?.paginacao?.numero_paginas ?? data?.paginacao?.total_paginas;
            const totalPages = Number(totalPagesRaw);
            const hasKnownTotalPages = Number.isFinite(totalPages) && totalPages > 0;
            if (rawEvents.length === 0 || (hasKnownTotalPages && page + 1 >= totalPages) || (!hasKnownTotalPages && rawEvents.length < pageSize)) {
              completed = true;
              break;
            }
          } catch (error: any) {
            failed = true;
            const status = error?.status ? Number(error.status) : undefined;
            const message = String(error?.message || error || "Erro desconhecido do SGA.");
            addAttempt({
              window: label,
              windowDays: actualWindowDays,
              pageSize,
              page: page + 1,
              ok: false,
              ...(status ? { status } : {}),
              message,
            });
            trace.push({
              step: "event_general_list_request_error",
              lookup: `POST listar/evento • ${label} • página ${page + 1} • ${pageSize} registros`,
              ok: false,
              ...(status ? { status } : {}),
              message,
            });
            break;
          }
        }

        if (!failed && completed) {
          preferredPageSize = pageSize;
          preferredWindowDays = requestedWindowDays;
          generalDebug.effectivePageSize = pageSize;
          generalDebug.effectiveWindowDays = actualWindowDays;
          completedWindow = { start, end, matches: [], pageSize, windowDays: actualWindowDays };
          break;
        }

        if (budgetExhausted()) break;
        trace.push({
          step: "event_general_list_retry",
          lookup: `${label} / ${pageSize} registros`,
          ok: false,
          message: `A tentativa falhou ou ficou incompleta; o Portal seguirá automaticamente com parâmetros menores.`,
        });
      }

      if (completedWindow || budgetExhausted()) break;
    }

    if (!completedWindow) {
      // Uma falha localizada não derruba toda a consulta. Avançamos um dia para
      // trás e deixamos a próxima requisição automática continuar desse ponto.
      trace.push({
        step: "event_general_list_window_unavailable",
        lookup: formatSgaDate(cursorEnd),
        ok: false,
        message: `A janela não pôde ser concluída dentro do limite seguro desta requisição.`,
      });
      cursorEnd = addDays(cursorEnd, -1);
      break;
    }

    windowsSearched += 1;
    cursorEnd = addDays(completedWindow.start, -1);
  }

  const hasMore = cursorEnd.getTime() >= lowerBound.getTime();
  generalDebug.elapsedMs = Date.now() - startedAt;
  generalDebug.stoppedReason = hasMore
    ? (budgetExhausted() ? "safe_request_budget" : "chunk_complete")
    : "history_exhausted";
  generalDebug.nextCursorDate = hasMore ? formatIsoDate(cursorEnd) : null;

  return {
    data: null,
    vehicleCode: "",
    resolvedBy: "",
    referenceDate: formatIsoDate(referenceDate),
    vehicleContractDate: parsedContractDate ? formatIsoDate(lowerBound) : null,
    windowsSearched,
    pending: hasMore,
    nextCursorDate: hasMore ? formatIsoDate(cursorEnd) : null,
    generalDebug,
  };
}

export async function resolveSgaEventsByPlate(value: unknown, options: { referenceDate?: unknown; cursorEnd?: unknown; skipDirect?: boolean } = {}) {
  const normalizedPlate = normalizeSgaPlate(value);
  if (!normalizedPlate) throw new Error("SGA_PLATE_EMPTY");

  const trace: SgaResolutionTrace[] = [];
  let lastError: any = null;
  let exactVehicle: any = null;
  let vehicleCode = "";

  // 1) Sempre resolvemos o veículo exato. É a âncora de segurança da integração.
  const vehicleLookup = await lookupVehicleByPlate(normalizedPlate);
  trace.push(...vehicleLookup.trace);
  exactVehicle = vehicleLookup.vehicle;
  vehicleCode = vehicleCodeOf(exactVehicle);
  if (vehicleLookup.error) lastError = vehicleLookup.error;

  if (!exactVehicle) {
    const vehicleError: any = new Error(`Nenhum veículo com correspondência exata para a placa ${normalizedPlate} foi localizado no SGA.`);
    vehicleError.code = "SGA_EXACT_VEHICLE_NOT_FOUND";
    vehicleError.cause = lastError;
    vehicleError.trace = trace;
    vehicleError.normalizedPlate = normalizedPlate;
    vehicleError.vehicleCode = "";
    throw vehicleError;
  }

  // 2) Se encontramos o veículo exato, consultamos os eventos pelo código interno
  // e filtramos novamente para impedir qualquer associação cruzada.
  if (vehicleCode && !options.skipDirect && !options.cursorEnd) {
    try {
      const data = await listSgaEventsByVehicle(vehicleCode);
      const rawEvents = eventsFrom(data);
      const exactEvents = rawEvents.filter((event) => eventMatchesPlateOrVehicle(event, normalizedPlate, vehicleCode));

      trace.push({
        step: "event_by_exact_vehicle_code",
        lookup: `GET listar/evento-veiculo/${vehicleCode}`,
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
        lookup: `GET listar/evento-veiculo/${vehicleCode}`,
        ok: false,
        ...(error?.status ? { status: Number(error.status) } : {}),
        message: String(error?.message || error),
      });
    }
  }

  // 3) Fallback controlado: consulta direta pela placa. Nas continuações da
  // busca histórica, pulamos esta etapa para não repetir chamadas já testadas.
  if (!options.skipDirect && !options.cursorEnd) try {
    const data = await listSgaEventsByVehicle(normalizedPlate);
    const rawEvents = eventsFrom(data);
    const exactEvents = rawEvents.map(normalizeSgaEvent).filter((event) => eventPlateOf(event) === normalizedPlate);

    trace.push({
      step: "event_by_exact_plate",
      lookup: `GET listar/evento-veiculo/${normalizedPlate}`,
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
      lookup: `GET listar/evento-veiculo/${normalizedPlate}`,
      ok: false,
      ...(error?.status ? { status: Number(error.status) } : {}),
      message: String(error?.message || error),
    });
  }

  // 4) Fallback automático final: consulta a listagem geral de eventos em
  // janelas de 30 dias e filtra SOMENTE a placa exata. Isso evita exigir que o
  // operador abra o SGA para descobrir ou digitar protocolo.
  let generalLookup: any;
  try {
    generalLookup = await lookupEventsInGeneralList(normalizedPlate, trace, exactVehicle, options.referenceDate, options.cursorEnd);
  } catch (error: any) {
    lastError = error;
    trace.push({
      step: "event_general_list_unhandled",
      lookup: "POST listar/evento",
      ok: false,
      ...(error?.status ? { status: Number(error.status) } : {}),
      message: String(error?.message || error),
    });
    generalLookup = {
      data: null,
      vehicleCode: "",
      resolvedBy: "",
      referenceDate: formatIsoDate(resolveReferenceDate(options.referenceDate)),
      vehicleContractDate: null,
      windowsSearched: 0,
      pending: false,
      nextCursorDate: null,
      generalDebug: {
        targetPlate: normalizedPlate,
        targetVehicleCode: vehicleCode,
        requestedPageSizes: [25, 10],
        requestedWindowDays: [30, 15, 7, 1],
        effectivePageSize: null,
        effectiveWindowDays: null,
        pages: [],
        attempts: [{ window: "—", windowDays: 0, pageSize: 0, page: 0, ok: false, ...(error?.status ? { status: Number(error.status) } : {}), message: String(error?.message || error) }],
        capped: false,
        requestCount: 0,
        elapsedMs: 0,
        stoppedReason: "unhandled_error",
        nextCursorDate: null,
      },
    };
  }
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

  if (generalLookup.pending && generalLookup.nextCursorDate) {
    return {
      data: null,
      pending: true,
      nextCursorDate: generalLookup.nextCursorDate,
      normalizedPlate,
      vehicleCode,
      vehicle: exactVehicle,
      resolvedBy: "history_continue",
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
