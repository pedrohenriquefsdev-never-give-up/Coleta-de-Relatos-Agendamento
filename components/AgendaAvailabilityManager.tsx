"use client";

import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck2, CalendarX2, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { useMemo, useState } from "react";
import type { AgendaAvailability, Appointment } from "@/lib/types";
import { useSession } from "./AuthGate";

type Props = {
  availability: Record<string, AgendaAvailability>;
  appointments: Appointment[];
  onChanged?: (item: AgendaAvailability) => void;
};

export default function AgendaAvailabilityManager({ availability, appointments, onChanged }: Props) {
  const { user } = useSession();
  const [monthOffset, setMonthOffset] = useState(0);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error">("info");

  const month = useMemo(() => addMonths(startOfMonth(new Date()), monthOffset), [monthOffset]);
  const gridStart = useMemo(() => startOfWeek(month, { weekStartsOn: 1 }), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const today = format(new Date(), "yyyy-MM-dd");

  async function toggle(date: string) {
    if (!user || date < today) return;
    const isOpen = availability[date]?.enabled === true;
    const activeAppointments = appointments.filter((item) => item.date === date && item.status !== "cancelado");

    if (isOpen && activeAppointments.length > 0) {
      const ok = window.confirm(
        `Existem ${activeAppointments.length} coleta(s) agendada(s) para ${date.split("-").reverse().join("/")}. Fechar o dia não cancela esses agendamentos. Deseja continuar?`,
      );
      if (!ok) return;
    }

    setSavingDate(date);
    setMessage("");
    setMessageKind("info");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/agenda/availability", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date, enabled: !isOpen }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a disponibilidade.");
      if (data.item) onChanged?.(data.item as AgendaAvailability);
      setMessage(
        !isOpen
          ? `Dia ${date.split("-").reverse().join("/")} liberado para agendamentos.`
          : `Dia ${date.split("-").reverse().join("/")} fechado para novos agendamentos.`,
      );
    } catch (e) {
      setMessageKind("error");
      setMessage(e instanceof Error ? e.message : "Não foi possível alterar a disponibilidade.");
    } finally {
      setSavingDate(null);
    }
  }

  return (
    <div className="panel availability-panel">
      <div className="panel-head availability-head">
        <div>
          <h2>Disponibilidade da agenda</h2>
          <small>Libere os dias em que o Atendimento poderá criar novas coletas de relatos.</small>
        </div>
        <div className="toolbar">
          <button className="btn icon-only" onClick={() => setMonthOffset((v) => v - 1)} title="Mês anterior"><ChevronLeft size={16} /></button>
          <button className="btn" onClick={() => setMonthOffset(0)}>Mês atual</button>
          <button className="btn icon-only" onClick={() => setMonthOffset((v) => v + 1)} title="Próximo mês"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="availability-summary">
        <div><CalendarCheck2 size={17} /><span><strong>Disponível</strong><small>Atendimento pode agendar</small></span></div>
        <div><CalendarX2 size={17} /><span><strong>Fechado</strong><small>Novos agendamentos bloqueados</small></span></div>
        <div><LockKeyhole size={17} /><span><strong>Controle operacional</strong><small>Somente usuários autorizados liberam dias</small></span></div>
      </div>

      {message && <div className={`${messageKind === "error" ? "error" : "info-note"} availability-message`}>{message}</div>}

      <div className="availability-month-title">{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</div>
      <div className="availability-calendar">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => <div className="availability-weekday" key={label}>{label}</div>)}
        {days.map((day) => {
          const date = format(day, "yyyy-MM-dd");
          const inMonth = day.getMonth() === month.getMonth();
          const isPast = date < today;
          const isOpen = availability[date]?.enabled === true;
          const dayAppointments = appointments.filter((item) => item.date === date && item.status !== "cancelado").length;
          const busy = savingDate === date;
          return (
            <button
              type="button"
              key={date}
              disabled={isPast || busy}
              className={`availability-day ${inMonth ? "" : "outside"} ${isOpen ? "open" : "closed"} ${isPast ? "past" : ""}`}
              onClick={() => toggle(date)}
              title={isPast ? "Data passada" : isOpen ? "Clique para fechar este dia" : "Clique para liberar este dia"}
            >
              <span className="availability-day-number">{format(day, "dd")}</span>
              <span className={`availability-state ${isOpen ? "open" : "closed"}`}>{busy ? "Salvando..." : isOpen ? "Disponível" : "Fechado"}</span>
              {dayAppointments > 0 && <span className="availability-count">{dayAppointments} {dayAppointments === 1 ? "coleta" : "coletas"}</span>}
            </button>
          );
        })}
      </div>

      <div className="availability-footnote">
        Fechar um dia que já possui coletas não apaga nem bloqueia os registros existentes; apenas impede novos agendamentos ou mudança de outras coletas para essa data.
      </div>
    </div>
  );
}
