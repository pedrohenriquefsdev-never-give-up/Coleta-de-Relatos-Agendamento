import { auth } from "./firebase";

export async function writeAudit(action: string, details: Record<string, unknown> = {}, targetId = "") {
  try {
    const current = auth.currentUser;
    if (!current) return;
    const token = await current.getIdToken();
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, details, targetId }),
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria", error);
  }
}
