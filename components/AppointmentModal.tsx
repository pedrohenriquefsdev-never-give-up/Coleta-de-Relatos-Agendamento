"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useSession } from "./AuthGate";
import Modal from "./Modal";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const cleanPlate = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
const cleanPhone = (v: string) => v.replace(/\D/g, "").slice(0, 11);

export default function AppointmentModal({ initial, defaultDate, defaultTime, onClose, onSaved }: { initial?: Appointment | null; defaultDate?: string; defaultTime?: string; onClose: () => void; onSaved: () => void }) {
  const { user, profile } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    plate: initial?.plate || "", fullName: initial?.fullName || "", phone: initial?.phone || "", email: initial?.email || "",
    date: initial?.date || defaultDate || new Date().toISOString().slice(0,10), time: initial?.time || defaultTime || "08:00",
    durationMinutes: initial?.durationMinutes || 30, status: initial?.status || "agendado" as AppointmentStatus, notes: initial?.notes || ""
  });
  const title = useMemo(() => initial ? `Agendamento • ${initial.plate}` : "Novo agendamento", [initial]);

  async function save() {
    setError("");
    if (!form.plate || !form.fullName || !form.phone || !form.email || !form.date || !form.time) return setError("Preencha os campos obrigatórios.");
    setSaving(true);
    try {
      const payload = { ...form, plate: cleanPlate(form.plate), phone: cleanPhone(form.phone), updatedAt: serverTimestamp() };
      if (initial) {
        await updateDoc(doc(db, "appointments", initial.id), payload);
        await addDoc(collection(db, "auditLogs"), { userId: user!.uid, userName: profile!.name, userEmail: profile!.email, action: "APPOINTMENT_UPDATED", targetId: initial.id, details: { plate: payload.plate }, createdAt: serverTimestamp() });
      } else {
        const created = await addDoc(collection(db, "appointments"), { ...payload, createdAt: serverTimestamp(), createdBy: user!.uid, createdByName: profile!.name });
        await addDoc(collection(db, "auditLogs"), { userId: user!.uid, userName: profile!.name, userEmail: profile!.email, action: "APPOINTMENT_CREATED", targetId: created.id, details: { plate: payload.plate }, createdAt: serverTimestamp() });
      }
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  return <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar agendamento"}</button></>}>
    <div className="stack">
      {error && <div className="error">{error}</div>}
      <div className="grid-2"><div className="field"><label>Placa *</label><input className="input" value={form.plate} onChange={e=>setForm({...form,plate:cleanPlate(e.target.value)})} placeholder="ABC1D23"/></div><div className="field"><label>Nome completo *</label><input className="input" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></div></div>
      <div className="grid-2"><div className="field"><label>Telefone atualizado *</label><input className="input" value={form.phone} onChange={e=>setForm({...form,phone:cleanPhone(e.target.value)})} placeholder="81999999999"/></div><div className="field"><label>E-mail *</label><input className="input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div></div>
      <div className="grid-3"><div className="field"><label>Data *</label><input className="input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div className="field"><label>Horário *</label><input className="input" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></div><div className="field"><label>Duração</label><select className="select" value={form.durationMinutes} onChange={e=>setForm({...form,durationMinutes:Number(e.target.value)})}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option></select></div></div>
      <div className="field"><label>Status</label><select className="select" value={form.status} onChange={e=>setForm({...form,status:e.target.value as AppointmentStatus})}><option value="agendado">Agendado</option><option value="confirmado">Confirmado</option><option value="atendido">Atendido</option><option value="cancelado">Cancelado</option><option value="nao_compareceu">Não compareceu</option></select></div>
      <div className="field"><label>Observações</label><textarea className="textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Informações adicionais..."/></div>
      {initial?.call?.callId && <div className="success">Ligação VTCall vinculada: <strong>{initial.call.callId}</strong></div>}
    </div>
  </Modal>;
}
