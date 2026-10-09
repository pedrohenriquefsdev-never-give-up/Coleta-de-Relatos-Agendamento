import { runtimeEnv } from "@/lib/runtime-env";

export function vtEnv(name: string, fallback = "") {
  let value = runtimeEnv(name) || fallback;
  value = String(value).trim();

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

export function vtTokenMeta(rawName = "VTCALL_ACCESS_TOKEN") {
  const raw = runtimeEnv(rawName) || "";
  const normalized = vtEnv(rawName);

  return {
    source: rawName,
    present: Boolean(normalized),
    length: normalized.length,
    hadOuterQuotes:
      raw.length >= 2 &&
      ((raw.trim().startsWith('"') && raw.trim().endsWith('"')) ||
        (raw.trim().startsWith("'") && raw.trim().endsWith("'"))),
    hadOuterWhitespace: raw !== raw.trim(),
  };
}
