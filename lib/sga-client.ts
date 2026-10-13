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

export async function listSgaEventsByVehicle(plateOrCode: string) {
  return sgaFetch(`listar/evento-veiculo/${encodeURIComponent(plateOrCode)}`);
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
