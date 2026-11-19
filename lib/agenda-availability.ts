import type { AgendaAvailability, AgendaAvailabilitySlot } from "@/lib/types";

export function timeToMinutes(value: string): number {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

export function normalizeSlot(slot: Partial<AgendaAvailabilitySlot>): AgendaAvailabilitySlot | null {
  const assignedTo = String(slot.assignedTo || "").trim();
  const assignedToName = String(slot.assignedToName || "").trim();
  const start = String(slot.start || "").trim();
  const end = String(slot.end || "").trim();
  if (!assignedTo || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (startMin < 0 || endMin < startMin) return null;
  return { assignedTo, assignedToName, start, end };
}

export function fitsAvailability(
  availability: AgendaAvailability | null | undefined,
  assignedTo: string,
  time: string,
  durationMinutes = 30,
): boolean {
  if (!availability?.enabled) return false;
  const slots = Array.isArray(availability.slots) ? availability.slots : [];
  // Compatibilidade com dias já liberados nas versões anteriores.
  if (slots.length === 0) return true;

  const start = timeToMinutes(time);
  if (start < 0) return false;
  // A disponibilidade representa horários permitidos para INÍCIO da coleta.
  // Portanto, o último horário informado é inclusivo: 08:00–12:00 libera também 12:00.
  return slots.some((slot) => {
    const normalized = normalizeSlot(slot);
    if (!normalized || normalized.assignedTo !== assignedTo) return false;
    return start >= timeToMinutes(normalized.start) && start <= timeToMinutes(normalized.end);
  });
}

export function dateHasTime(availability: AgendaAvailability | null | undefined, time: string, durationMinutes = 30): boolean {
  if (!availability?.enabled) return false;
  const slots = Array.isArray(availability.slots) ? availability.slots : [];
  if (slots.length === 0) return true;
  const start = timeToMinutes(time);
  return slots.some((slot) => {
    const normalized = normalizeSlot(slot);
    return Boolean(normalized && start >= timeToMinutes(normalized.start) && start <= timeToMinutes(normalized.end));
  });
}

export function availableTimesForUser(
  availability: AgendaAvailability | null | undefined,
  assignedTo: string,
  durationMinutes = 30,
  stepMinutes = 30,
): string[] {
  if (!availability?.enabled || !assignedTo) return [];
  const slots = Array.isArray(availability.slots) ? availability.slots : [];
  if (slots.length === 0) return [];
  const values = new Set<string>();
  for (const slot of slots) {
    const normalized = normalizeSlot(slot);
    if (!normalized || normalized.assignedTo !== assignedTo) continue;
    const start = timeToMinutes(normalized.start);
    const end = timeToMinutes(normalized.end);
    for (let cursor = start; cursor <= end; cursor += stepMinutes) {
      const h = String(Math.floor(cursor / 60)).padStart(2, "0");
      const m = String(cursor % 60).padStart(2, "0");
      values.add(`${h}:${m}`);
    }
    // Se o último horário não cair exatamente no passo de 30 min, ele ainda foi
    // escolhido explicitamente por quem liberou a agenda e deve aparecer.
    const endHour = String(Math.floor(end / 60)).padStart(2, "0");
    const endMinute = String(end % 60).padStart(2, "0");
    values.add(`${endHour}:${endMinute}`);
  }
  return Array.from(values).sort();
}
