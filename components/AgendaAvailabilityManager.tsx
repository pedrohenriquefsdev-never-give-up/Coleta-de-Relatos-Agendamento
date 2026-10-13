"use client";

import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { CalendarCheck2, CalendarX2, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import type { AgendaAvailability, Appointment } from "@/lib/types";
import { useSession } from "./AuthGate";

type Props = {
  availability: Record<string, AgendaAvailability>;
  appointments: Appointment[];
};

export default function AgendaAvailabilityManager({ availability, appointments }: Props) {
  const { user, profile } = useSession();
  const [monthOffset, setMonthOffset] = useState(0);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const month = useMemo(() => addMonths(startOfMonth(new Date()), monthOffset), [monthOffset]);
  const gridStart = useMemo(() => startOfWeek(month, { weekStartsOn: 1 }), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const today = format(new Date(), "yyyy-MM-dd");

  async function audit(action: string, date: string) {
    if (!user || !profile) return;
    try {
      await addDoc(collection(db, "auditLogs"), {
        userId: user.uid,
        userName: profile.name,
        userEmail: profile.email,
        action,
        targetId: date,
        details: { date },
        createdAt: serverTimestamp(),
      });
    } catch {
      // A auditoria não deve impedir a gestão da agenda.
    }
  }

  async function toggle(date: string) {
    if (!user || !profile || date < today) return;
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
    try {
      if (isOpen) {
        await setDoc(doc(db, "agendaAvailability", date), {
          date,
          enabled: false,
          closedBy: user.uid,
          closedByName: profile.name,
          closedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await audit("AGENDA_DAY_CLOSED", date);
        setMessage(`Dia ${date.split("-").reverse().join("/")} fechado para novos agendamentos.`);
      } else {
        await setDoc(doc(db, "agendaAvailability", date), {
          date,
          enabled: true,
          openedBy: user.uid,
          openedByName: profile.name,
          openedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await audit("AGENDA_DAY_OPENED", date);
        setMessage(`Dia ${date.split("-").reverse().join("/")} liberado para agendamentos.`);
      }
    } catch (e) {
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

      {message && <div className="info-note availability-message">{message}</div>}

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
