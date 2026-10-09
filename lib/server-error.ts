export function safeServerError(error: any) {
  const message = String(error?.message || "Erro desconhecido.");
  const code = String(error?.code || "");

  return {
    code: code || null,
    message:
      message
        .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[PRIVATE_KEY]")
        .slice(0, 500),
  };
}
