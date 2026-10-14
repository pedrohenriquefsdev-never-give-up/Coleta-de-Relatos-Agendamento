"use client";

import { format } from "date-fns";
import { Copy, Database, Download, History, PhoneCall, RefreshCw, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "./AuthGate";
import Modal from "./Modal";
import { availableTimesForUser, fitsAvailability } from "@/lib/agenda-availability";
import type { AgendaAvailability, AppUser, Appointment, AppointmentStatus } from "@/lib/types";

function localReferenceDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

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

type SgaEvent = {
  codigo_evento?: string | number;
  codigo_veiculo?: string | number;
  protocolo?: string | number;
  placa?: string;
  nome_associado?: string;
  situacao_evento?: string;
  descricao_motivo?: string;
};

type SgaPhotoType = {
  codigo_tipofoto?: string | number;
  codigo?: string | number;
  descricao?: string;
  nome?: string;
};

const sgaEventKey = (event: SgaEvent) => `${String(event.codigo_evento ?? "")}:${String(event.codigo_veiculo ?? "")}`;
const sgaPhotoTypeCode = (item: SgaPhotoType) => String(item.codigo_tipofoto ?? item.codigo ?? "");

export default function AppointmentModal({
  initial,
  defaultDate,
  defaultTime,
  existingAppointments = [],
  availableUsers = [],
  availableDates = [],
  availability = {},
  developerOverride = false,
  readOnly = false,
  onClose,
  onSaved,
}: {
  initial?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
  existingAppointments?: Appointment[];
  availableUsers?: AppUser[];
  availableDates?: string[];
  availability?: Record<string, AgendaAvailability>;
  developerOverride?: boolean;
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
  const [sgaLoading, setSgaLoading] = useState(false);
  const [sgaEvents, setSgaEvents] = useState<SgaEvent[]>([]);
  const [sgaPhotoTypes, setSgaPhotoTypes] = useState<SgaPhotoType[]>([]);
  const [selectedSgaEvent, setSelectedSgaEvent] = useState("");
  const [selectedSgaPhotoType, setSelectedSgaPhotoType] = useState("");
  const [sgaCatalogWarning, setSgaCatalogWarning] = useState("");
  const [sgaMessage, setSgaMessage] = useState("");
  const [sendingSga, setSendingSga] = useState(false);
  const [lastSgaUpload, setLastSgaUpload] = useState<any>(initial?.sga?.lastUpload || null);
  const sortedAvailableDates = useMemo(() => Array.from(new Set(availableDates)).sort(), [availableDates]);
  const todayLocal = format(new Date(), "yyyy-MM-dd");
  const firstAvailableDate = sortedAvailableDates.find((date) => date >= todayLocal) || sortedAvailableDates[0] || "";
  const initialFormDate = initial?.date || defaultDate || (developerOverride ? todayLocal : firstAvailableDate);
  const [form, setForm] = useState({
    plate: initial?.plate || "",
    fullName: initial?.fullName || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    date: initialFormDate,
    time: initial?.time || defaultTime || "08:00",
    durationMinutes: initial?.durationMinutes || 30,
    assignedTo: initial ? (initial.assignedTo || initial.createdBy || "") : "",
    assignedToName: initial ? (initial.assignedToName || initial.createdByName || "") : "",
    status: ((initial?.status === "atendido" ? "concluido" : initial?.status) || "agendado") as AppointmentStatus,
    notes: initial?.notes || "",
    sgaObservation: initial?.sgaObservation || initial?.sga?.lastUpload?.observation || "",
  });

  const title = useMemo(() => (initial ? `Agendamento • ${initial.plate}` : "Novo agendamento"), [initial]);
  const canDelete = !!initial && !readOnly && (profile?.role === "desenvolvedor" || profile?.role === "admin");

  const collectionOperators = useMemo(
    () => availableUsers.filter((item) => item.active && item.canPerformCollections === true),
    [availableUsers],
  );

  const canHandleCollection = Boolean(
    initial && profile && (
      profile.role === "desenvolvedor" ||
      profile.role === "admin" ||
      (initial.assignedTo || initial.createdBy) === profile.uid
    )
  );

  const selectedAvailability = availability[form.date];
  const hasStructuredAvailability = Boolean(selectedAvailability?.enabled && Array.isArray(selectedAvailability?.slots) && selectedAvailability.slots.length > 0);
  const operatorAvailableDates = useMemo(() => {
    if (!form.assignedTo) return sortedAvailableDates;
    return sortedAvailableDates.filter((date) => {
      const item = availability[date];
      if (!item?.enabled) return false;
      const slots = Array.isArray(item.slots) ? item.slots : [];
      if (slots.length === 0) return true; // compatibilidade com dias liberados antes da V1.39.7
      return availableTimesForUser(item, form.assignedTo, Number(form.durationMinutes || 30)).length > 0;
    });
  }, [availability, form.assignedTo, form.durationMinutes, sortedAvailableDates]);
  const allowedTimes = useMemo(
    () => hasStructuredAvailability ? availableTimesForUser(selectedAvailability, form.assignedTo, Number(form.durationMinutes || 30)) : [],
    [form.assignedTo, form.durationMinutes, hasStructuredAvailability, selectedAvailability],
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

  async function getToken(): Promise<string> {
    if (!user) throw new Error("Sessão não encontrada. Faça login novamente.");
    return user.getIdToken();
  }


  function exportCallHistory() {
    if (!initial || callAttempts.length === 0) return;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Data/Hora", "Status", "Ramal", "Telefone", "Usuário", "Retorno VTCall"],
      ...callAttempts.map((attempt) => [
        attempt.requestedAt ? new Date(attempt.requestedAt).toLocaleString("pt-BR") : "",
        attempt.status === "requested" ? "Solicitada" : attempt.status,
        attempt.extension,
        attempt.phone,
        attempt.userName,
        attempt.providerResponse,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `historico-ligacoes-${cleanPlate(initial.plate) || initial.id}-${initial.date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function exportCallHistoryPdf() {
    if (!initial || !user) return;
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(`/api/reports/call-history/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appointmentId: initial.id, observation: form.sgaObservation }),
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível gerar o PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `coleta-relato-${cleanPlate(initial.plate) || initial.id}-${initial.date}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    }
  }

  async function fetchSgaEventsAutomatically(token: string, plate: string) {
    const referenceDate = localReferenceDate();
    let cursorEnd = "";
    for (let chunk = 1; chunk <= 40; chunk += 1) {
      const params = new URLSearchParams({
        plate,
        referenceDate,
        t: String(Date.now()),
      });
      if (cursorEnd) params.set("cursorEnd", cursorEnd);
      const response = await fetch(`/api/sga/event?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${data.error || "Não foi possível localizar o evento no SGA."}${data.technical ? ` — ${data.technical}` : ""}`);
      if (!data.pending) return data;
      const nextCursor = String(data?.resolution?.nextCursorDate || "").trim();
      if (!nextCursor || nextCursor === cursorEnd) throw new Error("A busca histórica do SGA não informou um próximo período válido.");
      cursorEnd = nextCursor;
    }
    throw new Error("A busca histórica do SGA atingiu o limite de segurança do Portal.");
  }

  async function loadSgaContext() {
    if (!initial || !user) return;
    setSgaLoading(true);
    setSgaCatalogWarning("");
    setSgaMessage("");
    setError("");
    try {
      const token = await getToken();
      const plate = cleanPlate(initial.plate || form.plate);
      const [eventData, catalogResponse] = await Promise.all([
        fetchSgaEventsAutomatically(token, plate),
        fetch(`/api/sga/catalogs?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      const catalogData = await catalogResponse.json().catch(() => ({}));
      if (!catalogResponse.ok) throw new Error(catalogData.error || "Não foi possível carregar as classificações do SGA.");

      const events = Array.isArray(eventData.data?.eventos) ? eventData.data.eventos as SgaEvent[] : [];
      const photoTypes = Array.isArray(catalogData.photoTypes) ? catalogData.photoTypes as SgaPhotoType[] : catalogData.photoTypes ? [catalogData.photoTypes as SgaPhotoType] : [];
      setSgaEvents(events);
      setSgaPhotoTypes(photoTypes);
      if (events.length > 0 && eventData.resolution?.resolvedBy) {
        const vehicleCode = eventData.resolution?.vehicleCode ? ` • veículo SGA ${eventData.resolution.vehicleCode}` : "";
        setSgaMessage(eventData.resolution.resolvedBy === "vehicle_code_exact"
          ? `Evento confirmado pelo código interno do veículo${vehicleCode}.`
          : eventData.resolution.resolvedBy === "event_list_exact_plate"
            ? `Evento localizado automaticamente na listagem geral do SGA${vehicleCode}.`
            : eventData.resolution.resolvedBy === "plate_exact_legacy_mask"
              ? `Evento confirmado diretamente pela placa no formato ${eventData.resolution.directPlateLookup || "ABC-1234"}${vehicleCode}.`
              : "Evento confirmado diretamente pela placa.");
      }

      if (!catalogData.checks?.photoTypes?.ok) {
        setSgaCatalogWarning("O token não conseguiu listar as classificações de arquivo. Habilite Vistoria → listar tipo foto para realizar o upload.");
      }

      const previousEventKey = lastSgaUpload?.eventCode && lastSgaUpload?.vehicleCode
        ? `${String(lastSgaUpload.eventCode)}:${String(lastSgaUpload.vehicleCode)}`
        : "";
      if (previousEventKey && events.some((item) => sgaEventKey(item) === previousEventKey)) setSelectedSgaEvent(previousEventKey);
      else if (events.length === 1) setSelectedSgaEvent(sgaEventKey(events[0]));
      else setSelectedSgaEvent("");

      const previousType = String(lastSgaUpload?.photoTypeCode || "");
      if (previousType && photoTypes.some((item) => sgaPhotoTypeCode(item) === previousType)) setSelectedSgaPhotoType(previousType);
      else {
        const suggested = photoTypes.find((item) => /document|relato|arquivo|evento/i.test(String(item.descricao || item.nome || "")));
        setSelectedSgaPhotoType(suggested ? sgaPhotoTypeCode(suggested) : photoTypes.length === 1 ? sgaPhotoTypeCode(photoTypes[0]) : "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível preparar a integração com o SGA.");
    } finally {
      setSgaLoading(false);
    }
  }

  async function copySgaObservation() {
    const text = form.sgaObservation.trim();
    if (!text) return setError("Preencha a observação antes de copiar.");
    try {
      await navigator.clipboard.writeText(text);
      setSgaMessage("Observação copiada.");
    } catch {
      setError("Não foi possível copiar a observação neste navegador.");
    }
  }

  async function sendHistoryToSga() {
    if (!initial || !user) return;
    if (callAttempts.length === 0) return setError("Faça ao menos uma tentativa de ligação antes de enviar o histórico ao SGA.");
    const event = sgaEvents.find((item) => sgaEventKey(item) === selectedSgaEvent);
    if (!event) return setError("Selecione o evento correto do SGA.");
    if (!selectedSgaPhotoType) return setError("Selecione a classificação do documento no SGA.");

    const protocol = String(event.protocolo || "sem protocolo");
    const confirmed = window.confirm(`Enviar o PDF desta coleta para o evento ${protocol}, placa ${cleanPlate(initial.plate)}?`);
    if (!confirmed) return;

    setSendingSga(true);
    setSgaMessage("");
    setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/sga/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          appointmentId: initial.id,
          eventCode: event.codigo_evento,
          vehicleCode: event.codigo_veiculo,
          photoTypeCode: selectedSgaPhotoType,
          eventProtocol: event.protocolo || "",
          observation: form.sgaObservation,
          referenceDate: localReferenceDate(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${data.error || "Não foi possível enviar ao SGA."}${data.technical ? ` — ${data.technical}` : ""}`);
      setLastSgaUpload(data.upload || null);
      setSgaMessage(data.message || "PDF enviado ao SGA com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar ao SGA.");
    } finally {
      setSendingSga(false);
    }
  }

  async function refreshRamalStatus(silent = false): Promise<RamalStatus | null> {
    if (!initial || !user || !canHandleCollection) return null;
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
    if (!initial || !user || !canHandleCollection) return;
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
  }, [initial?.id, user, canHandleCollection]);

  async function openVTCall() {
    if (readOnly) return setError("Seu perfil possui acesso somente para consulta.");
    if (!canHandleCollection) return setError(`Esta coleta está atribuída a ${initial?.assignedToName || "outro operador"}. Somente o operador responsável ou a gestão pode iniciar a ligação.`);
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
    const scheduleChanged = !initial || form.date !== initial.date || form.time !== initial.time || form.assignedTo !== (initial.assignedTo || initial.createdBy) || Number(form.durationMinutes || 30) !== Number(initial.durationMinutes || 30);
    if (!developerOverride && scheduleChanged) {
      if (!sortedAvailableDates.includes(form.date)) {
        return setError("Esta data não foi liberada para novos agendamentos. Escolha um dos dias disponíveis na agenda.");
      }
      if (hasStructuredAvailability && !fitsAvailability(selectedAvailability, form.assignedTo, form.time, Number(form.durationMinutes || 30))) {
        return setError("Este responsável não está disponível nesse horário. Escolha um dos horários liberados.");
      }
    }
    if (scheduleConflicts.length > 0) {
      const first = scheduleConflicts[0];
      return setError(`Conflito de agenda: ${form.assignedToName || "o responsável"} já possui uma coleta às ${first.time}. Escolha outro horário ou responsável.`);
    }
    setSaving(true);
    try {
      const cleanedPhone = cleanPhone(form.phone);
      const selectedResponsible = collectionOperators.find((item) => item.uid === form.assignedTo);
      const payload = {
        ...form,
        assignedToName: selectedResponsible?.name || form.assignedToName || profile?.name || "",
        assignedDepartment: selectedResponsible?.department || "",
        plate: cleanPlate(form.plate),
        phone: cleanedPhone,
        phoneDigits: cleanedPhone,
      };
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada. Entre novamente no portal.");
      const response = await fetch("/api/appointments", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(initial ? { id: initial.id, ...payload } : payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o agendamento.");
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
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada. Entre novamente no portal.");
      const response = await fetch("/api/appointments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: initial.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o agendamento.");
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
            <input className="input" disabled={readOnly} value={form.plate} onChange={(e) => setForm({ ...form, plate: cleanPlate(e.target.value) })} placeholder="GPV0000 ou ABC1D23" />
            {!readOnly && <small className="field-help">Pode digitar com ou sem hífen. O Portal salva a placa normalizada sem caracteres especiais.</small>}
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
              {initial && !readOnly && canHandleCollection && (
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

        {initial && canHandleCollection && (
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

        {initial && !canHandleCollection && (
          <div className="info-note">Esta coleta está atribuída a <strong>{initial.assignedToName || initial.createdByName || "outro operador"}</strong>. Você pode consultar/editar o agendamento, mas a ligação VTCall e o envio operacional ao SGA ficam com o operador responsável ou com a gestão.</div>
        )}

        {initial && (
          <div className="appointment-origin-grid">
            <div><small>Agendado por</small><strong>{initial.createdByName || "—"}</strong></div>
            <div><small>Operador da coleta</small><strong>{initial.assignedToName || initial.createdByName || "—"}</strong></div>
          </div>
        )}

        <div className="field">
          <label>Responsável pela coleta *</label>
          <select
            className="select"
            disabled={readOnly}
            value={form.assignedTo}
            onChange={(e) => {
              const assignedTo = e.target.value;
              const selected = collectionOperators.find((item) => item.uid === assignedTo);
              const candidateDates = sortedAvailableDates.filter((date) => {
                const item = availability[date];
                const slots = Array.isArray(item?.slots) ? item!.slots! : [];
                return Boolean(item?.enabled && (slots.length === 0 || availableTimesForUser(item, assignedTo, Number(form.durationMinutes || 30)).length > 0));
              });
              const nextDate = candidateDates.includes(form.date) ? form.date : (candidateDates[0] || form.date);
              const nextTimes = Array.isArray(availability[nextDate]?.slots) && availability[nextDate]!.slots!.length > 0
                ? availableTimesForUser(availability[nextDate], assignedTo, Number(form.durationMinutes || 30))
                : [];
              setForm({ ...form, assignedTo, assignedToName: selected?.name || "", date: nextDate, time: nextTimes.length > 0 && !nextTimes.includes(form.time) ? nextTimes[0] : form.time });
            }}
          >
            <option value="">Selecione o operador da coleta</option>
            {collectionOperators.map((item) => (
              <option key={item.uid} value={item.uid}>
                {item.name}{item.department ? ` • ${item.department}` : ""}
              </option>
            ))}
            {form.assignedTo && !collectionOperators.some((item) => item.uid === form.assignedTo) && (
              <option value={form.assignedTo}>{form.assignedToName || "Responsável atual"}</option>
            )}
          </select>
          <small className="field-help">Este campo define quem realizará a ligação/coleta. Quem está criando o agendamento é registrado automaticamente como “Agendado por”.</small>
        </div>

        <div className="grid-3">
          <div className="field">
            <label>Data *</label>
            {developerOverride ? (
              <input className="input" disabled={readOnly} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            ) : (
              <select className="select" disabled={readOnly} value={form.date} onChange={(e) => {
                const date = e.target.value;
                const nextTimes = Array.isArray(availability[date]?.slots) && availability[date]!.slots!.length > 0
                  ? availableTimesForUser(availability[date], form.assignedTo, Number(form.durationMinutes || 30))
                  : [];
                setForm({ ...form, date, time: nextTimes.length > 0 && !nextTimes.includes(form.time) ? nextTimes[0] : form.time });
              }}>
                <option value="">Selecione um dia liberado</option>
                {initial && initial.date && !sortedAvailableDates.includes(initial.date) && (
                  <option value={initial.date}>{initial.date.split("-").reverse().join("/")} • data atual (fechada)</option>
                )}
                {operatorAvailableDates.map((date) => (
                  <option key={date} value={date}>{date.split("-").reverse().join("/")}</option>
                ))}
              </select>
            )}
            {!developerOverride && !readOnly && <small className="field-help">Os dias disponíveis vêm da agenda dos operadores de coleta, independentemente de quem está realizando o agendamento.</small>}
            {developerOverride && !readOnly && <small className="field-help">Acesso Desenvolvedor: você pode usar qualquer data, inclusive fora da disponibilidade publicada.</small>}
          </div>
          <div className="field">
            <label>Horário *</label>
            {developerOverride || !hasStructuredAvailability ? (
              <input className="input" disabled={readOnly} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            ) : (
              <select className="select" disabled={readOnly || !form.assignedTo} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}>
                <option value="">Selecione um horário liberado</option>
                {allowedTimes.map((time) => <option key={time} value={time}>{time}</option>)}
                {initial && form.time && !allowedTimes.includes(form.time) && <option value={form.time}>{form.time} • horário atual</option>}
              </select>
            )}
            {!developerOverride && hasStructuredAvailability && form.assignedTo && allowedTimes.length === 0 && !readOnly && <small className="field-help warning-text">Este responsável não possui horário compatível com a duração selecionada neste dia.</small>}
          </div>
          <div className="field">
            <label>Duração</label>
            <select className="select" disabled={readOnly} value={form.durationMinutes} onChange={(e) => {
              const durationMinutes = Number(e.target.value);
              const nextTimes = hasStructuredAvailability ? availableTimesForUser(selectedAvailability, form.assignedTo, durationMinutes) : [];
              setForm({ ...form, durationMinutes, time: nextTimes.length > 0 && !nextTimes.includes(form.time) ? nextTimes[0] : form.time });
            }}>
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
              <div className="call-history-actions">
                <button type="button" className="btn compact" onClick={exportCallHistory} disabled={callAttempts.length === 0} title="Exportar histórico de tentativas em CSV">
                  <Download size={13} /> CSV
                </button>
                <button type="button" className="btn compact" onClick={exportCallHistoryPdf} disabled={callAttempts.length === 0} title="Gerar PDF da coleta para anexar ao SGA">
                  <Download size={13} /> PDF
                </button>
                <button type="button" className="icon-btn mini" onClick={() => loadCallHistory()} disabled={historyLoading} title="Atualizar histórico">
                  <RefreshCw size={14} className={historyLoading ? "spin-icon" : ""} />
                </button>
              </div>
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

        {initial && !readOnly && canHandleCollection && (
          <div className="sga-transfer-card">
            <div className="sga-transfer-head">
              <div>
                <Database size={16} />
                <span><strong>Enviar coleta ao SGA</strong><small>Localize o evento pela placa e anexe o PDF diretamente nele.</small></span>
              </div>
              <button type="button" className="btn compact" onClick={loadSgaContext} disabled={sgaLoading}>
                <RefreshCw size={13} className={sgaLoading ? "spin-icon" : ""} /> {sgaLoading ? "Consultando..." : sgaEvents.length > 0 ? "Atualizar SGA" : "Localizar evento"}
              </button>
            </div>

            {lastSgaUpload && (
              <div className="sga-last-upload">
                <strong>Último envio confirmado</strong>
                <span>Protocolo {lastSgaUpload.protocol || "—"} • Evento {lastSgaUpload.eventCode || "—"} • {lastSgaUpload.filename || "PDF da coleta"}</span>
              </div>
            )}

            {sgaCatalogWarning && <div className="info-note sga-inline-warning">{sgaCatalogWarning}</div>}

            {sgaEvents.length > 0 && (
              <div className="sga-transfer-grid">
                <div className="field">
                  <label>Evento / protocolo *</label>
                  <select className="select" value={selectedSgaEvent} onChange={(e) => setSelectedSgaEvent(e.target.value)}>
                    <option value="">Selecione o evento correto</option>
                    {sgaEvents.map((event, index) => (
                      <option key={`${sgaEventKey(event)}:${index}`} value={sgaEventKey(event)}>
                        {event.protocolo || "Sem protocolo"} • {event.situacao_evento || "Sem situação"} • {event.descricao_motivo || "Sem motivo"}
                      </option>
                    ))}
                  </select>
                  {sgaEvents.length > 1 && <small className="field-help warning-text">Há mais de um evento para esta placa. Confirme o protocolo antes de enviar.</small>}
                </div>

                <div className="field">
                  <label>Classificação do documento *</label>
                  <select className="select" value={selectedSgaPhotoType} onChange={(e) => setSelectedSgaPhotoType(e.target.value)} disabled={sgaPhotoTypes.length === 0}>
                    <option value="">Selecione a classificação</option>
                    {sgaPhotoTypes.map((item, index) => (
                      <option key={`${sgaPhotoTypeCode(item)}:${index}`} value={sgaPhotoTypeCode(item)}>
                        {item.descricao || item.nome || `Código ${sgaPhotoTypeCode(item)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="field">
              <label>Observação para o SGA</label>
              <textarea
                className="textarea sga-observation"
                value={form.sgaObservation}
                onChange={(e) => setForm({ ...form, sgaObservation: e.target.value.slice(0, 4000) })}
                placeholder="Ex.: Realizada coleta de relato por contato telefônico. Histórico de tentativas anexado em PDF."
              />
              <small className="field-help">A observação será incluída no PDF e enviada junto ao documento. Enquanto a API não expõe escrita no campo “Descrição Evento do Veículo”, use “Copiar observação” se também precisar colá-la manualmente no Controle Interno.</small>
            </div>

            <div className="sga-transfer-actions">
              <button type="button" className="btn compact" onClick={copySgaObservation} disabled={!form.sgaObservation.trim()}>
                <Copy size={13} /> Copiar observação
              </button>
              <button
                type="button"
                className="btn primary compact"
                onClick={sendHistoryToSga}
                disabled={sendingSga || callAttempts.length === 0 || !selectedSgaEvent || !selectedSgaPhotoType}
              >
                <Send size={13} /> {sendingSga ? "Enviando..." : "Enviar PDF ao SGA"}
              </button>
            </div>

            {sgaMessage && <div className="success sga-transfer-message">{sgaMessage}</div>}
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
