import { runtimeEnv } from "@/lib/runtime-env";

export const SGA_BASE_URL = runtimeEnv("SGA_BASE_URL") || "https://api.hinova.com.br/api/sga/v2";
export const SGA_INTEGRATION_TOKEN = runtimeEnv("SGA_INTEGRATION_TOKEN");
export const SGA_API_USER = runtimeEnv("SGA_API_USER") || "API.GPV";
export const SGA_API_PASSWORD = runtimeEnv("SGA_API_PASSWORD");

export function sgaConfigStatus() {
  return {
    baseUrl: SGA_BASE_URL,
    tokenConfigured: Boolean(SGA_INTEGRATION_TOKEN),
    userConfigured: Boolean(SGA_API_USER),
    passwordConfigured: Boolean(SGA_API_PASSWORD),
    configured: Boolean(SGA_INTEGRATION_TOKEN && SGA_API_USER && SGA_API_PASSWORD),
  };
}
