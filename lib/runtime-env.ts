export function runtimeEnv(name: string): string {
  const value = Reflect.get(process.env, name);
  return typeof value === "string" ? value : "";
}

export function hasRuntimeEnv(name: string): boolean {
  return runtimeEnv(name).length > 0;
}
