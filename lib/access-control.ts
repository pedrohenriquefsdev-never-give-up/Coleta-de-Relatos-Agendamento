import type { UserRole } from "@/lib/types";

// Conta técnica principal do portal. Este UID não é uma credencial e não concede
// acesso por si só; ele apenas fixa qual conta autenticada recebe o nível exclusivo.
const PORTAL_DEVELOPER_UID = "PBH5b5zU3EQuQYigKWGe8MTlQis2";

export function isPortalDeveloperUid(uid?: string | null) {
  return Boolean(uid && uid === PORTAL_DEVELOPER_UID);
}

export function effectiveRole(uid: string | undefined | null, role: UserRole | string | undefined): UserRole {
  if (isPortalDeveloperUid(uid)) return "desenvolvedor";
  if (role === "admin" || role === "atendente" || role === "consulta") return role;
  return "consulta";
}

export function isManagementRole(role?: string) {
  return role === "desenvolvedor" || role === "admin";
}

export function canOperate(role?: string) {
  return role === "desenvolvedor" || role === "admin" || role === "atendente";
}
