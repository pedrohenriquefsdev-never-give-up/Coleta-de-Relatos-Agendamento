"use client";

import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { History, PhoneCall, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useSession } from "./AuthGate";
import Modal from "./Modal";
import type { AppUser, Appointment, AppointmentStatus } from "@/lib/types";

const cleanPlate = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
const cleanPhone = (v: string) => v.replace(/\D/g, "").slice(0, 11);

const statusLabels: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_contato: "Em contato",
  nao_atendeu: "Não atendeu",
  reagendar: "Reagendar",
  concluido: "Concluído",
  atendido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};

type RamalStatus = {
  configured: boolean;
  extension: string;
  ok?: boolean;
  providerStatus?: number | null;
  active: boolean;
  available: boolean;
  count: number;
};

type CallAttempt = {
  id: string;
  status: string;
  extension: string;
  phone: string;
  userName: string;
  providerResponse: string;
  requestedAt: string | null;
};

async function tryWriteAudit(payload: Record<string, unknown>) {
  try {
    await addDoc(collection(db, "auditLogs"), { ...payload, createdAt: serverTimestamp() });
  } catch {
    // auditoria não deve impedir o fluxo principal
  }
}

export default function AppointmentModal({
  initial,
  defaultDate,
  defaultTime,
  existingAppointments = [],
  availableUsers = [],
  readOnly = false,
  onClose,
  onSaved,
}: {
  initial?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
  existingAppointments?: Appointment[];
  availableUsers?: AppUser[];
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, profile } = useSession();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callMessage, setCallMessage] = useState("");
  const [error, setError] = useState("");
  const [ramalStatus, setRamalStatus] = useState<RamalStatus | null>(null);
  const [ramalLoading, setRamalLoading] = useState(false);
  const [callAttempts, setCallAttempts] = useState<CallAttempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm] = useState({
    plate: initial?.plate || "",
    fullName: initial?.fullName || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    date: initial?.date || defaultDate || new Date().toISOString().slice(0, 10),
    time: initial?.time || defaultTime || "08:00",
    durationMinutes: initial?.durationMinutes || 30,
    assignedTo: initial?.assignedTo || initial?.createdBy || profile?.uid || "",
    assignedToName: initial?.assignedToName || initial?.createdByName || profile?.name || "",
    status: ((initial?.status === "atendido" ? "concluido" : initial?.status) || "agendado") as AppointmentStatus,
    notes: initial?.notes || "",
  });

  const title = useMemo(() => (initial ? `Agendamento • ${initial.plate}` : "Novo agendamento"), [initial]);
  const canDelete = !!initial && !readOnly && profile?.role === "admin";

  const operationalUsers = useMemo(
    () => availableUsers.filter((item) => item.active && (item.role === "admin" || item.role === "atendente")),
    [availableUsers],
  );

  const duplicateMatches = useMemo(() => {
    const plate = cleanPlate(form.plate);
    const phone = cleanPhone(form.phone);
    if ((!plate && !phone) || !form.date || !form.time) return [];

    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    };
    const targetMinutes = toMinutes(form.time);

    return existingAppointments
      .filter((item) => item.id !== initial?.id && item.status !== "cancelado" && item.date === form.date)
      .filter((item) => {
        const samePlate = plate.length >= 7 && cleanPlate(item.plate) === plate;
        const samePhone = phone.length >= 8 && cleanPhone(item.phoneDigits || item.phone) === phone;
        if (!samePlate && !samePhone) return false;
        return Math.abs(toMinutes(item.time) - targetMinutes) <= 120;
      })
      .slice(0, 3);
  }, [existingAppointments, form.date, form.phone, form.plate, form.time, initial?.id]);

  const scheduleConflicts = useMemo(() => {
    if (!form.date || !form.time || !form.assignedTo) return [];

    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    };
    const startsAt = toMinutes(form.time);
    const endsAt = startsAt + Number(form.durationMinutes || 30);

    return existingAppointments
      .filter((item) => item.id !== initial?.id && item.status !== "cancelado" && item.date === form.date)
      .filter((item) => (item.assignedTo || item.createdBy) === form.assignedTo)
      .filter((item) => {
        const itemStart = toMinutes(item.time);
        const itemEnd = itemStart + Number(item.durationMinutes || 30);
        return startsAt < itemEnd && endsAt > itemStart;
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [existingAppointments, form.assignedTo, form.date, form.durationMinutes, form.time, initial?.id]);

  async function getToken() {
    return user?.getIdToken();
  }

  async function refreshRamalStatus(silent = false): Promise<RamalStatus | null> {
    if (!initial || !user) return null;
    if (!silent) setRamalLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/vtcall/status?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) return null;
      setRamalStatus(data);
      return data;
    } catch {
      return null;
    } finally {
      if (!silent) setRamalLoading(false);
    }
  }

  async function loadCallHistory(silent = false) {
    if (!initial || !user) return;
    if (!silent) setHistoryLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/vtcall/attempts?appointmentId=${encodeURIComponent(initial.id)}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setCallAttempts(Array.isArray(data.attempts) ? data.attempts : []);
    } catch {
      // histórico é complementar ao agendamento
    } finally {
      if (!silent) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!initial || !user) return;
    let mounted = true;

    const load = async () => {
      if (!mounted) return;
      await refreshRamalStatus(true);
    };

    setRamalLoading(true);
    Promise.all([load(), loadCallHistory()]).finally(() => mounted && setRamalLoading(false));
    const timer = window.setInterval(load, 10000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
    // o id identifica a abertura deste agendamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id, user]);

  async function openVTCall() {
    if (readOnly) return setError("Seu perfil possui acesso somente para consulta.");
    const phone = cleanPhone(form.phone);
    if (!phone) return setError("Informe um telefone válido antes de iniciar a ligação.");
    if (!initial) return setError("Salve o agendamento antes de iniciar uma ligação.");

    setError("");
    setCallMessage("");
    setCalling(true);

    try {
      const freshStatus = await refreshRamalStatus(true);
      if (freshStatus?.configured === false) throw new Error("Seu ramal VTCall ainda não foi configurado.");
      if (freshStatus?.active) throw new Error(`O ramal ${freshStatus.extension} já está em uma chamada. Finalize a ligação atual antes de iniciar outra.`);

      const token = await getToken();
      const res = await fetch("/api/vtcall/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, appointmentId: initial.id }),
      });
      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || `HTTP ${res.status}` }; }
      if (!res.ok) {
        const detail = data.providerMessage && data.providerMessage !== data.error ? ` — ${data.providerMessage}` : "";
        const showpeer = data.showpeerDiagnostic?.status ? ` [Showpeer HTTP ${data.showpeerDiagnostic.status}]` : "";
        throw new Error(`${data.error || "Não foi possível iniciar a ligação."}${detail}${showpeer}`);
      }

      setCallMessage(data.message || "Ligação solicitada. Aguarde o seu ramal tocar.");
      if (data.showpeer?.after) {
        setRamalStatus((prev) => ({
          configured: true,
          extension: prev?.extension || initial.call?.extension || "",
          ok: data.showpeer.after.ok,
          providerStatus: data.showpeer.after.status,
          active: Boolean(data.showpeer.after.active),
          available: Boolean(data.showpeer.after.ok) && !data.showpeer.after.active,
          count: Number(data.showpeer.after.count || 0),
        }));
      }
      await loadCallHistory(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar a ligação.");
    } finally {
      setCalling(false);
    }
  }

  async function save() {
    if (readOnly) return;
    setError("");
    if (!form.plate || !form.fullName || !form.phone || !form.email || !form.date || !form.time || !form.assignedTo) {
      return setError("Preencha os campos obrigatórios, incluindo o responsável pela coleta.");
    }
    if (scheduleConflicts.length > 0) {
      const first = scheduleConflicts[0];
      return setError(`Conflito de agenda: ${form.assignedToName || "o responsável"} já possui uma coleta às ${first.time}. Escolha outro horário ou responsável.`);
    }
    setSaving(true);
    try {
      const cleanedPhone = cleanPhone(form.phone);
      const selectedResponsible = operationalUsers.find((item) => item.uid === form.assignedTo);
      const payload = {
        ...form,
        assignedToName: selectedResponsible?.name || form.assignedToName || profile?.name || "",
        assignedDepartment: selectedResponsible?.department || "",
        plate: cleanPlate(form.plate),
        phone: cleanedPhone,
        phoneDigits: cleanedPhone,
        updatedAt: serverTimestamp(),
      };

      if (initial) {
        await updateDoc(doc(db, "appointments", initial.id), payload);
        await tryWriteAudit({
          userId: user!.uid,
          userName: profile!.name,
          userEmail: profile!.email,
          action: "APPOINTMENT_UPDATED",
          targetId: initial.id,
          details: { plate: payload.plate, fullName: payload.fullName, phone: payload.phone, status: payload.status, assignedToName: payload.assignedToName },
        });
      } else {
        const created = await addDoc(collection(db, "appointments"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user!.uid,
          createdByName: profile!.name,
        });
        await tryWriteAudit({
          userId: user!.uid,
          userName: profile!.name,
          userEmail: profile!.email,
          action: "APPOINTMENT_CREATED",
          targetId: created.id,
          details: { plate: payload.plate, fullName: payload.fullName, phone: payload.phone, status: payload.status, assignedToName: payload.assignedToName },
        });
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAppointment() {
    if (!initial || !canDelete) return;
    const confirmed = window.confirm(`Deseja realmente excluir o agendamento da placa ${initial.plate}?`);
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      await deleteDoc(doc(db, "appointments", initial.id));
      await tryWriteAudit({
        userId: user!.uid,
        userName: profile!.name,
        userEmail: profile!.email,
        action: "APPOINTMENT_DELETED",
        targetId: initial.id,
        details: { plate: initial.plate, fullName: initial.fullName, phone: initial.phone },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir o agendamento.");
    } finally {
      setDeleting(false);
    }
  }

  const ramalText = ramalLoading && !ramalStatus
    ? "Verificando..."
    : ramalStatus?.configured === false
      ? "Não configurado"
      : ramalStatus?.active
        ? "Em chamada"
        : ramalStatus?.available
          ? "Sem chamada ativa"
          : ramalStatus?.configured
            ? "Status indisponível"
            : "Verificando...";

  const ramalClass = ramalStatus?.active ? "busy" : ramalStatus?.available ? "available" : ramalStatus?.configured === false ? "offline" : "checking";

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {canDelete && (
            <button className="btn danger ghost" onClick={removeAppointment} disabled={deleting || saving}>
              <Trash2 size={15} />
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          )}
          <div className="footer-spacer" />
          <button className="btn" onClick={onClose} disabled={saving || deleting}>
            {readOnly ? "Fechar" : "Cancelar"}
          </button>
          {!readOnly && (
            <button className="btn primary" onClick={save} disabled={saving || deleting}>
              {saving ? "Salvando..." : "Salvar agendamento"}
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        {error && <div className="error">{error}</div>}
        {readOnly && <div className="info-note">Visualização em modo consulta. Este perfil não pode alterar o agendamento nem iniciar ligações.</div>}

        {!readOnly && duplicateMatches.length > 0 && (
          <div className="duplicate-warning">
            <strong>Possível agendamento duplicado</strong>
            {duplicateMatches.map((item) => (
              <span key={item.id}>
                {item.date.split("-").reverse().join("/")} às {item.time} • {item.plate} • {item.fullName}
              </span>
            ))}
          </div>
        )}

        {!readOnly && scheduleConflicts.length > 0 && (
          <div className="schedule-conflict">
            <strong>Conflito de horário para este responsável</strong>
            <span>O mesmo dia pode ter várias coletas, mas um responsável não pode ficar em duas coletas ao mesmo tempo.</span>
            {scheduleConflicts.map((item) => (
              <span key={item.id}>{item.time} • {item.fullName} • {item.plate}</span>
            ))}
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label>Placa *</label>
            <input className="input" disabled={readOnly} value={form.plate} onChange={(e) => setForm({ ...form, plate: cleanPlate(e.target.value) })} placeholder="ABC1D23" />
          </div>
          <div className="field">
            <label>Nome completo *</label>
            <input className="input" disabled={readOnly} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Telefone atualizado *</label>
            <div className="phone-field-wrap">
              <input className="input" disabled={readOnly} value={form.phone} onChange={(e) => setForm({ ...form, phone: cleanPhone(e.target.value) })} placeholder="81999999999" />
              {initial && !readOnly && (
                <button
                  type="button"
                  className="phone-vtcall-btn"
                  onClick={openVTCall}
                  disabled={calling || ramalStatus?.configured === false || ramalStatus?.active}
                  title={ramalStatus?.active ? "Seu ramal já está em chamada" : "Ligar pelo VTCall"}
                >
                  <PhoneCall size={15} />
                  <span>{calling ? "Chamando..." : "Ligar via VTCall"}</span>
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label>E-mail *</label>
            <input className="input" disabled={readOnly} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        {initial && (
          <div className="ramal-status-bar">
            <div className="ramal-status-copy">
              <PhoneCall size={15} />
              <span>Ramal <strong>{ramalStatus?.extension || initial.call?.extension || "—"}</strong></span>
              <span className={`ramal-status-pill ${ramalClass}`}>{ramalText}</span>
            </div>
            <button type="button" className="icon-btn mini" onClick={() => refreshRamalStatus()} disabled={ramalLoading} title="Atualizar status do ramal">
              <RefreshCw size={14} className={ramalLoading ? "spin-icon" : ""} />
            </button>
          </div>
        )}

        <div className="field">
          <label>Responsável pela coleta *</label>
          <select
            className="select"
            disabled={readOnly}
            value={form.assignedTo}
            onChange={(e) => {
              const selected = operationalUsers.find((item) => item.uid === e.target.value);
              setForm({ ...form, assignedTo: e.target.value, assignedToName: selected?.name || "" });
            }}
          >
            <option value="">Selecione o responsável</option>
            {operationalUsers.map((item) => (
              <option key={item.uid} value={item.uid}>
                {item.name}{item.department ? ` • ${item.department}` : ""}
              </option>
            ))}
            {form.assignedTo && !operationalUsers.some((item) => item.uid === form.assignedTo) && (
              <option value={form.assignedTo}>{form.assignedToName || "Responsável atual"}</option>
            )}
          </select>
          <small className="field-help">É permitido ter várias coletas no mesmo dia e até no mesmo horário, desde que sejam atribuídas a responsáveis diferentes.</small>
        </div>

        <div className="grid-3">
          <div className="field">
            <label>Data *</label>
            <input className="input" disabled={readOnly} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="field">
            <label>Horário *</label>
            <input className="input" disabled={readOnly} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
          <div className="field">
            <label>Duração</label>
            <select className="select" disabled={readOnly} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Status</label>
          <select className="select" disabled={readOnly} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AppointmentStatus })}>
            <option value="agendado">Agendado</option>
            <option value="confirmado">Confirmado</option>
            <option value="em_contato">Em contato</option>
            <option value="nao_atendeu">Não atendeu</option>
            <option value="reagendar">Reagendar</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
            <option value="nao_compareceu">Não compareceu</option>
          </select>
        </div>

        <div className="field">
          <label>Observações</label>
          <textarea className="textarea" disabled={readOnly} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Informações adicionais..." />
        </div>

        {callMessage && <div className="success">{callMessage}</div>}

        {initial && (
          <div className="call-history-card">
            <div className="call-history-head">
              <div>
                <History size={16} />
                <span><strong>Histórico de ligações</strong><small>Tentativas realizadas a partir deste agendamento.</small></span>
              </div>
              <button type="button" className="icon-btn mini" onClick={() => loadCallHistory()} disabled={historyLoading} title="Atualizar histórico">
                <RefreshCw size={14} className={historyLoading ? "spin-icon" : ""} />
              </button>
            </div>

            {historyLoading && callAttempts.length === 0 ? (
              <div className="call-history-empty">Carregando ligações...</div>
            ) : callAttempts.length === 0 ? (
              <div className="call-history-empty">Nenhuma ligação iniciada por este agendamento.</div>
            ) : (
              <div className="call-history-list">
                {callAttempts.slice(0, 8).map((attempt) => (
                  <div className="call-history-item" key={attempt.id}>
                    <span className="call-history-icon"><PhoneCall size={13} /></span>
                    <div>
                      <strong>Ligação solicitada</strong>
                      <small>
                        {attempt.requestedAt ? new Date(attempt.requestedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Data indisponível"}
                        {attempt.extension ? ` • Ramal ${attempt.extension}` : ""}
                        {attempt.userName ? ` • ${attempt.userName}` : ""}
                      </small>
                    </div>
                    <span className="pill status-em_contato">{attempt.status === "requested" ? "Solicitada" : attempt.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {initial?.call?.lastAttemptId && (
          <div className="call-reference">Última tentativa VTCall: {initial.call.lastAttemptId}</div>
        )}

        <div className="form-footnote">Status atual: {statusLabels[form.status]}</div>
      </div>
    </Modal>
  );
}
