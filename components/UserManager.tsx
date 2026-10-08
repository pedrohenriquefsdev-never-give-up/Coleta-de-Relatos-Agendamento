"use client";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { BriefcaseBusiness, KeyRound, Pencil, PhoneCall, Plus, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import type { AppUser, UserRole } from "@/lib/types";
import Modal from "./Modal";

const DEPARTMENTS = ["Atendimento", "Cadastro", "Comercial", "Operação", "Rastreamento", "Administrativo", "Marketing"];
const DEFAULT_VTCALL = { host: "sip23.vtcall.app", extension: "", password: "", port: 5068, transport: "UDP" };

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
  }
}

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingVT, setLoadingVT] = useState(false);
  const [error, setError] = useState("");
  const [otherDepartment, setOtherDepartment] = useState("");
  const [form, setForm] = useState({ name: "", email: "", cpf: "", role: "atendente" as UserRole, department: "Atendimento" });
  const [vtcall, setVtcall] = useState(DEFAULT_VTCALL);

  useEffect(() => onSnapshot(query(collection(db, "users"), orderBy("name")), (s) => setUsers(s.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)))), []);

  async function token() { return await auth.currentUser?.getIdToken(); }
  const finalDepartment = form.department === "__outro__" ? otherDepartment.trim() : form.department;

  async function saveVTCallFor(uid: string, config = vtcall) {
    if (!config.extension && !config.password) return;
    const res = await fetch(`/api/admin/users/${uid}/vtcall`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(config),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || `Não foi possível salvar o VTCall (HTTP ${res.status}).`);
  }

  async function create() {
    setError("");
    if (!form.name || !form.email || !finalDepartment || form.cpf.replace(/\D/g, "").length !== 11)
      return setError("Preencha nome, e-mail, departamento e um CPF com 11 dígitos.");
    if ((vtcall.extension || vtcall.password) && (!vtcall.extension || !vtcall.password))
      return setError("Para configurar o VTCall, informe ramal e senha.");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ ...form, department: finalDepartment, cpf: form.cpf.replace(/\D/g, "") }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário");
      await saveVTCallFor(data.uid);
      setForm({ name: "", email: "", cpf: "", role: "atendente", department: "Atendimento" });
      setVtcall(DEFAULT_VTCALL);
      setOtherDepartment("");
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  }

  async function toggle(u: AppUser) {
    const res = await fetch(`/api/admin/users/${u.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ active: !u.active }),
    });
    if (!res.ok) alert("Não foi possível alterar o acesso.");
  }

  async function openEdit(u: AppUser) {
    setError("");
    setEditing({ ...u, department: u.department || "Atendimento" });
    setOtherDepartment("");
    setVtcall(DEFAULT_VTCALL);
    setLoadingVT(true);
    try {
      const res = await fetch(`/api/admin/users/${u.uid}/vtcall`, { headers: { Authorization: `Bearer ${await token()}` } });
      const data = await readJsonSafe(res);
      if (res.ok && data.configured) setVtcall({ host: data.host, extension: data.extension, password: data.password, port: Number(data.port || 5068), transport: data.transport || "UDP" });
    } finally { setLoadingVT(false); }
  }

  async function saveEditing() {
    if (!editing) return;
    const department = editing.department === "__outro__" ? otherDepartment.trim() : (editing.department || "").trim();
    if (!department) return setError("Informe o departamento.");
    const wantsVTCall = Boolean(vtcall.extension || vtcall.password || editing.vtcallConfigured);
    if (wantsVTCall && (!vtcall.extension || !vtcall.password)) return setError("Preencha o ramal e a senha do VTCall.");
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/users/${editing.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ department }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(`Perfil: ${data.error || `falha HTTP ${res.status}`}. Verifique as variáveis FIREBASE_ADMIN_* na Vercel.`);
      if (wantsVTCall) {
        try {
          await saveVTCallFor(editing.uid);
        } catch (vtError) {
          throw new Error(`VTCall: ${vtError instanceof Error ? vtError.message : "não foi possível salvar a configuração."}`);
        }
      }
      setEditing(null); setOtherDepartment(""); setVtcall(DEFAULT_VTCALL);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  }

  const VtFields = () => (
    <div className="vt-admin-box">
      <div className="vt-admin-head"><PhoneCall size={16}/><div><strong>Configuração VTCall</strong><small>Dados individuais para conexão do ramal.</small></div></div>
      <div className="grid-2">
        <div className="field"><label>Host</label><input className="input" value={vtcall.host} onChange={(e)=>setVtcall({...vtcall,host:e.target.value})}/></div>
        <div className="field"><label>Ramal / Extension</label><input className="input" value={vtcall.extension} onChange={(e)=>setVtcall({...vtcall,extension:e.target.value.replace(/\D/g,"")})} placeholder="7219"/></div>
      </div>
      <div className="field"><label>Senha do ramal</label><input className="input" value={vtcall.password} onChange={(e)=>setVtcall({...vtcall,password:e.target.value})} placeholder="Senha fornecida pelo VTCall"/></div>
      <div className="grid-2">
        <div className="field"><label>Porta</label><input className="input" inputMode="numeric" value={vtcall.port} onChange={(e)=>setVtcall({...vtcall,port:Number(e.target.value||5068)})}/></div>
        <div className="field"><label>Transporte</label><select className="select" value={vtcall.transport} onChange={(e)=>setVtcall({...vtcall,transport:e.target.value})}><option>UDP</option><option>TCP</option><option>TLS</option></select></div>
      </div>
    </div>
  );

  return <>
    <div className="panel">
      <div className="panel-head"><div><h2>Usuários com acesso</h2><small>Perfis, identificação, ramal e status de acesso ao portal.</small></div><button className="btn primary" onClick={()=>setOpen(true)}><Plus size={16}/> Novo usuário</button></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Departamento</th><th>Ramal</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>
        {users.map((u)=><tr key={u.uid}>
          <td><div className="user-table-cell">{u.photoUrl?<img className="avatar" src={u.photoUrl} alt=""/>:<div className="avatar">{u.name?.[0]}</div>}<strong>{u.name}</strong></div></td>
          <td>{u.email}</td>
          <td><span className="department-chip"><BriefcaseBusiness size={13}/>{u.department||"Não informado"}</span></td>
          <td>{u.vtcallConfigured?<span className="department-chip"><PhoneCall size={13}/>{u.vtcallExtension||"Configurado"}</span>:<span className="pill">Não configurado</span>}</td>
          <td><span className={`pill ${u.role}`}>{u.role}</span></td><td><span className={`pill ${u.active?"active":""}`}>{u.active?"Ativo":"Bloqueado"}</span></td>
          <td><div className="row-actions"><button className="btn icon-only" title="Editar usuário e VTCall" onClick={()=>openEdit(u)}><Pencil size={15}/></button><button className="btn" onClick={()=>toggle(u)}>{u.active?<><UserX size={15}/> Bloquear</>:<><UserCheck size={15}/> Ativar</>}</button></div></td>
        </tr>)}
      </tbody></table></div>
    </div>

    {open&&<Modal title="Criar usuário" onClose={()=>setOpen(false)} footer={<><button className="btn" onClick={()=>setOpen(false)}>Cancelar</button><button className="btn primary" onClick={create} disabled={loading}>{loading?"Criando...":"Criar usuário"}</button></>}>
      <div className="stack">{error&&<div className="error">{error}</div>}
        <div className="field"><label>Nome completo</label><input className="input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></div>
        <div className="field"><label>E-mail de acesso</label><input className="input" type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></div>
        <div className="field"><label>CPF — senha de acesso</label><input className="input" inputMode="numeric" value={form.cpf} onChange={(e)=>setForm({...form,cpf:e.target.value.replace(/\D/g,"").slice(0,11)})}/><small style={{color:"#777"}}>O CPF não será gravado em texto puro no Firestore.</small></div>
        <div className="grid-2"><div className="field"><label>Departamento</label><select className="select" value={form.department} onChange={(e)=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map((d)=><option key={d}>{d}</option>)}<option value="__outro__">Outro</option></select></div><div className="field"><label>Perfil de acesso</label><select className="select" value={form.role} onChange={(e)=>setForm({...form,role:e.target.value as UserRole})}><option value="admin">Administrador</option><option value="atendente">Atendente</option><option value="consulta">Consulta</option></select></div></div>
        {form.department==="__outro__"&&<div className="field"><label>Nome do departamento</label><input className="input" value={otherDepartment} onChange={(e)=>setOtherDepartment(e.target.value)}/></div>}
        <div className="info-note"><BriefcaseBusiness size={16}/><span>Departamento é apenas identificação e não altera permissões.</span></div>
        <VtFields/>
      </div>
    </Modal>}

    {editing&&<Modal title={`Usuário • ${editing.name}`} onClose={()=>setEditing(null)} footer={<><button className="btn" onClick={()=>setEditing(null)}>Cancelar</button><button className="btn primary" onClick={saveEditing} disabled={loading||loadingVT}>{loading?"Salvando...":"Salvar alterações"}</button></>}>
      <div className="stack">{error&&<div className="error">{error}</div>}{loadingVT&&<div className="info-note"><KeyRound size={16}/><span>Carregando configuração segura do VTCall...</span></div>}
        <div className="field"><label>Departamento</label><select className="select" value={DEPARTMENTS.includes(editing.department||"")?editing.department:"__outro__"} onChange={(e)=>{if(e.target.value==="__outro__"){setOtherDepartment(DEPARTMENTS.includes(editing.department||"")?"":(editing.department||""));setEditing({...editing,department:"__outro__"})}else{setOtherDepartment("");setEditing({...editing,department:e.target.value})}}}>{DEPARTMENTS.map((d)=><option key={d}>{d}</option>)}<option value="__outro__">Outro</option></select></div>
        {editing.department==="__outro__"&&<div className="field"><label>Nome do departamento</label><input className="input" value={otherDepartment} onChange={(e)=>setOtherDepartment(e.target.value)}/></div>}
        <VtFields/>
      </div>
    </Modal>}
  </>;
}
