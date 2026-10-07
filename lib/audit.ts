import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function writeAudit(action: string, details: Record<string, unknown> = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      details,
      createdAt: serverTimestamp(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria", error);
  }
}
