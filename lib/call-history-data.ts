import { adminDb } from "@/lib/firebase-admin";

function toDate(value: any): Date | null {
  try {
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
  } catch {}
  return null;
}

export async function loadCallHistoryData(appointmentId: string) {
  const appointmentSnap = await adminDb().collection("appointments").doc(appointmentId).get();
  if (!appointmentSnap.exists) return null;
  const appointment = appointmentSnap.data() as any;

  const attemptsSnap = await adminDb().collection("callAttempts").where("appointmentId", "==", appointmentId).get();
  const attempts = attemptsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as any))
    .sort((a, b) => {
      const da = toDate(a.requestedAt)?.getTime() || 0;
      const db = toDate(b.requestedAt)?.getTime() || 0;
      return da - db;
    });

  return { appointmentSnap, appointment, attempts };
}
