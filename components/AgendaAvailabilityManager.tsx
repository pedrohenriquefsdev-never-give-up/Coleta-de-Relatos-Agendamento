"use client";

import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck2, CalendarClock, CalendarX2, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { fitsAvailability } from "@/lib/agenda-availability";
import type { AgendaAvailability, AgendaAvailabilitySlot, AppUser, Appointment } from "@/lib/types";
import { useSession } from "./AuthGate";

const defaultSlot = (): AgendaAvailabilitySlot => ({ assignedTo: "", assignedToName: "", start: "08:00", end: "12:00" });

export default function AgendaAvailabilityManager({
  availability,
  appointments,
  users,
  onChanged,
}: {
  availability: Record<string, AgendaAvailability>;
  appointments: Appointment[];
  users: AppUser[];
  onChanged?: (item: AgendaAvailability) => void;
}) {
  const { user } = useSession();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<AgendaAvailabilitySlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error">("info");

  const operationalUsers = useMemo(
    () => users.filter((item) => item.active && (item.role === "desenvolvedor" || item.role === "admin" || item.role === "atendente")),
    [users],
  );
  const month = useMemo(() => addMonths(startOfMonth(new Date()), monthOffset), [monthOffset]);
  const gridStart = useMemo(() => startOfWeek(month, { weekStartsOn: 1 }), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const today = format(new Date(), "yyyy-MM-dd");

  function selectDate(date: string) {
    if (date < today) return;
    setSelectedDate(date);
    setMessage("");
    const existing = Array.isArray(availability[date]?.slots) ? availability[date].slots! : [];
    setSlots(existing.map((slot) => ({ ...slot })));
  }

  function updateSlot(index: number, patch: Partial<AgendaAvailabilitySlot>) {
    setSlots((current) => current.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  }

  async function persist(nextSlots: AgendaAvailabilitySlot[]) {
    if (!user || !selectedDate) return;
    const activeAppointments = appointments.filter((item) => item.date === selectedDate && item.status !== "cancelado");
    const proposed: AgendaAvailability = { date: selectedDate, enabled: nextSlots.length > 0, slots: nextSlots };
    const uncovered = activeAppointments.filter((item) => !fitsAvailability(proposed, item.assignedTo || item.createdBy, item.time, Number(item.durationMinutes || 30)));
    if (uncovered.length > 0) {
      const ok = window.confirm(`${uncovered.length} coleta(s) já agendada(s) ficarão fora da nova disponibilidade. Os agendamentos não serão apagados. Deseja salvar mesmo assim?`);
      if (!ok) return;
    }
    setSaving(true);
    setMessage("");
    setMessageKind("info");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/agenda/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: selectedDate, slots: nextSlots }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a disponibilidade.");
      if (data.item) onChanged?.(data.item as AgendaAvailability);
      setSlots(Array.isArray(data.item?.slots) ? data.item.slots : []);
      setMessage(nextSlots.length > 0 ? "Disponibilidade salva com sucesso." : "Dia fechado para novos agendamentos.");
    } catch (e) {
      setMessageKind("error");
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar a disponibilidade.");
    } finally {
      setSaving(false);
    }
  }

  async function closeDay() {
    if (!selectedDate) return;
    await persist([]);
  }

  const selectedAppointments = selectedDate ? appointments.filter((item) => item.date === selectedDate && item.status !== "cancelado") : [];

  return (
    <div className="stack">
      <div className="panel availability-panel">
        <div className="panel-head availability-head">
          <div>
            <h2>Disponibilidade da agenda</h2>
            <small>Defina os dias, responsáveis e faixas de horário em que o Atendimento poderá agendar coletas.</small>
          </div>
          <div className="toolbar">
            <button className="btn icon-only" onClick={() => setMonthOffset((v) => v - 1)} title="Mês anterior"><ChevronLeft size={16} /></button>
            <button className="btn" onClick={() => setMonthOffset(0)}>Mês atual</button>
            <button className="btn icon-only" onClick={() => setMonthOffset((v) => v + 1)} title="Próximo mês"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="availability-summary">
          <div><CalendarCheck2 size={17} /><span><strong>Com horários</strong><small>Possui períodos liberados</small></span></div>
          <div><CalendarClock size={17} /><span><strong>Parcial</strong><small>Disponibilidade por responsável e período</small></span></div>
          <div><CalendarX2 size={17} /><span><strong>Fechado</strong><small>Nenhum novo agendamento</small></span></div>
        </div>

        <div className="availability-month-title">{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</div>
        <div className="availability-calendar">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => <div className="availability-weekday" key={label}>{label}</div>)}
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const inMonth = day.getMonth() === month.getMonth();
            const isPast = date < today;
            const item = availability[date];
            const isOpen = item?.enabled === true;
            const periodCount = Array.isArray(item?.slots) ? item.slots.length : 0;
            const legacy = isOpen && periodCount === 0;
            const dayAppointments = appointments.filter((appointment) => appointment.date === date && appointment.status !== "cancelado").length;
            return (
              <button
                type="button"
                key={date}
                disabled={isPast}
                className={`availability-day ${inMonth ? "" : "outside"} ${isOpen ? "open" : "closed"} ${isPast ? "past" : ""} ${selectedDate === date ? "selected" : ""}`}
                onClick={() => selectDate(date)}
                title={isPast ? "Data passada" : "Clique para configurar os horários"}
              >
                <span className="availability-day-number">{format(day, "dd")}</span>
                <span className={`availability-state ${isOpen ? "open" : "closed"}`}>{isOpen ? legacy ? "Disponível (legado)" : `${periodCount} período${periodCount === 1 ? "" : "s"}` : "Fechado"}</span>
                {dayAppointments > 0 && <span className="availability-count">{dayAppointments} {dayAppointments === 1 ? "coleta" : "coletas"}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="panel availability-editor">
          <div className="panel-head">
            <div>
              <h2>{selectedDate.split("-").reverse().join("/")}</h2>
              <small>{selectedAppointments.length > 0 ? `${selectedAppointments.length} coleta(s) já agendada(s) neste dia.` : "Nenhuma coleta agendada neste dia."}</small>
            </div>
            <div className="toolbar">
              <button className="btn" onClick={() => setSlots((current) => [...current, defaultSlot()])}><Plus size={15} /> Adicionar período</button>
              <button className="btn danger ghost" onClick={closeDay} disabled={saving}><CalendarX2 size={15} /> Fechar dia</button>
              <button className="btn primary" onClick={() => persist(slots)} disabled={saving}><Save size={15} /> {saving ? "Salvando..." : "Salvar horários"}</button>
            </div>
          </div>

          {message && <div className={messageKind === "error" ? "error" : "info-note"}>{message}</div>}

          {slots.length === 0 ? (
            <div className="empty compact-empty">Nenhum horário configurado. Adicione um período para liberar este dia.</div>
          ) : (
            <div className="availability-slot-list">
              {slots.map((slot, index) => (
                <div className="availability-slot-row" key={index}>
                  <div className="field">
                    <label>Responsável</label>
                    <select className="select" value={slot.assignedTo} onChange={(e) => {
                      const selected = operationalUsers.find((item) => item.uid === e.target.value);
                      updateSlot(index, { assignedTo: e.target.value, assignedToName: selected?.name || "" });
                    }}>
                      <option value="">Selecione</option>
                      {operationalUsers.map((item) => <option key={item.uid} value={item.uid}>{item.name}{item.department ? ` • ${item.department}` : ""}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Início</label><input className="input" type="time" value={slot.start} onChange={(e) => updateSlot(index, { start: e.target.value })} /></div>
                  <div className="field"><label>Fim</label><input className="input" type="time" value={slot.end} onChange={(e) => updateSlot(index, { end: e.target.value })} /></div>
                  <button className="btn icon-only danger ghost slot-remove" title="Remover período" onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="availability-footnote">Exemplo: um responsável pode ficar indisponível pela manhã e ter apenas 13:00-17:00 liberado. O Atendimento verá somente os horários permitidos para o responsável selecionado.</div>
        </div>
      )}
    </div>
  );
}
