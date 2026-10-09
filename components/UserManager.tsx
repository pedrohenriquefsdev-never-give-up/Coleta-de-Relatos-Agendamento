"use client";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { BriefcaseBusiness, Camera, KeyRound, LockKeyhole, Pencil, PhoneCall, Plus, ServerCog, UserCheck, UserX } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import type { AppUser, UserRole } from "@/lib/types";
import { effectiveRole, isPortalDeveloperUid } from "@/lib/access-control";
import { useSession } from "./AuthGate";
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
  const { profile } = useSession();
  const currentIsDeveloper = profile?.role === "desenvolvedor";
  const [users, setUsers] = useState<AppUser[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingVT, setLoadingVT] = useState(false);
  const [error, setError] = useState("");
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [otherDepartment, setOtherDepartment] = useState("");
  const [form, setForm] = useState({ name: "", email: "", cpf: "", role: "atendente" as UserRole, department: "Atendimento" });
  const [vtcall, setVtcall] = useState(DEFAULT_VTCALL);
  const [editCpf, setEditCpf] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");

  useEffect(() => onSnapshot(query(collection(db, "users"), orderBy("name")), (s) => setUsers(s.docs.map((d) => { const raw = { uid: d.id, ...d.data() } as AppUser; return { ...raw, role: effectiveRole(raw.uid, raw.role) }; }))), []);

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
    if (!res.ok) throw new Error(`${data.error || `Não foi possível salvar o VTCall (HTTP ${res.status}).`}${data.technical ? ` — ${data.technical}` : ""}`);
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
    if (isPortalDeveloperUid(u.uid)) return alert("O acesso do Desenvolvedor é protegido e não pode ser bloqueado.");
    const res = await fetch(`/api/admin/users/${u.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) alert(data.error || "Não foi possível alterar o acesso.");
  }

  async function openEdit(u: AppUser) {
    if (isPortalDeveloperUid(u.uid) && !currentIsDeveloper) {
      return alert("Este acesso é protegido e só pode ser alterado pelo próprio Desenvolvedor.");
    }
    setError("");
    setPhotoMessage("");
    setEditing({ ...u, department: u.department || "Atendimento" });
    setOtherDepartment("");
    setVtcall(DEFAULT_VTCALL);
    setEditCpf("");
    setLoadingVT(true);
    try {
      const res = await fetch(`/api/admin/users/${u.uid}/vtcall`, { headers: { Authorization: `Bearer ${await token()}` } });
      const data = await readJsonSafe(res);
      if (res.ok && data.configured) setVtcall({ host: data.host, extension: data.extension, password: data.password, port: Number(data.port || 5068), transport: data.transport || "UDP" });
    } finally { setLoadingVT(false); }
  }

  async function saveEditing() {
    if (!editing) return;
    const name = String(editing.name || "").trim();
    const email = String(editing.email || "").trim().toLowerCase();
    const department = editing.department === "__outro__" ? otherDepartment.trim() : (editing.department || "").trim();
    const cpf = editCpf.replace(/\D/g, "");
    if (!name || !email || !department) return setError("Preencha nome, e-mail e departamento.");
    if (!email.includes("@")) return setError("Informe um e-mail válido.");
    if (cpf && cpf.length !== 11) return setError("O novo CPF precisa ter 11 dígitos.");
    const wantsVTCall = Boolean(vtcall.extension || vtcall.password || editing.vtcallConfigured);
    if (wantsVTCall && (!vtcall.extension || !vtcall.password)) return setError("Preencha o ramal e a senha do VTCall.");
    setLoading(true); setError("");
    try {
      const payload: Record<string, unknown> = { name, email, department };
      if (!isPortalDeveloperUid(editing.uid)) payload.role = editing.role;
      if (cpf) payload.cpf = cpf;
      const res = await fetch(`/api/admin/users/${editing.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(`Perfil: ${data.error || `falha HTTP ${res.status}`}${data.technical ? ` — ${data.technical}` : ""}`);
      if (wantsVTCall) {
        try {
          await saveVTCallFor(editing.uid);
        } catch (vtError) {
          throw new Error(`VTCall: ${vtError instanceof Error ? vtError.message : "não foi possível salvar a configuração."}`);
        }
      }
      setEditing(null); setOtherDepartment(""); setVtcall(DEFAULT_VTCALL); setEditCpf("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  }


  async function changeEditingPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    e.target.value = "";
    if (!currentIsDeveloper) return setPhotoMessage("Somente o Desenvolvedor pode alterar a foto de outros usuários.");
    if (file.size > 5 * 1024 * 1024) return setPhotoMessage("A imagem deve ter no máximo 5 MB.");

    setPhotoLoading(true);
    setPhotoMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("targetUid", editing.uid);
      const res = await fetch("/api/cloudinary-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
        body,
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.url) throw new Error(data.error || `Não foi possível atualizar a foto (HTTP ${res.status}).`);
      setEditing({ ...editing, photoUrl: data.url });
      setPhotoMessage("Foto atualizada com sucesso.");
    } catch (e) {
      setPhotoMessage(e instanceof Error ? e.message : "Não foi possível atualizar a foto.");
    } finally {
      setPhotoLoading(false);
    }
  }

  async function runDiagnostic() {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiag(null);
    try {
      const res = await fetch(`/api/diagnostics/runtime-v131?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: "no-store",
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; }
      catch { data = { error: `Resposta inválida do servidor (HTTP ${res.status}).`, raw: text.slice(0, 300) }; }
      setDiag({ httpStatus: res.status, ...data });
    } catch (e) {
      setDiag({ error: e instanceof Error ? e.message : "Falha ao executar diagnóstico." });
    } finally {
      setDiagLoading(false);
    }
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
      <div className="panel-head"><div><h2>Usuários com acesso</h2><small>Perfis, identificação, ramal e status de acesso ao portal.</small></div><div className="row-actions"><button className="btn" onClick={runDiagnostic}><ServerCog size={16}/> Diagnóstico backend</button><button className="btn primary" onClick={()=>setOpen(true)}><Plus size={16}/> Novo usuário</button></div></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Departamento</th><th>Ramal</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>
        {users.map((u)=><tr key={u.uid}>
          <td><div className="user-table-cell">{u.photoUrl?<img className="avatar" src={u.photoUrl} alt=""/>:<div className="avatar">{u.name?.[0]}</div>}<strong>{u.name}</strong></div></td>
          <td>{u.email}</td>
          <td><span className="department-chip"><BriefcaseBusiness size={13}/>{u.department||"Não informado"}</span></td>
          <td>{u.vtcallConfigured?<span className="department-chip"><PhoneCall size={13}/>{u.vtcallExtension||"Configurado"}</span>:<span className="pill">Não configurado</span>}</td>
          <td><span className={`pill ${u.role}`}>{u.role === "desenvolvedor" ? "Desenvolvedor" : u.role}</span></td><td><span className={`pill ${u.active?"active":""}`}>{u.active?"Ativo":"Bloqueado"}</span></td>
          <td>{isPortalDeveloperUid(u.uid) && !currentIsDeveloper ? <span className="protected-access"><LockKeyhole size={14}/> Acesso protegido</span> : <div className="row-actions"><button className="btn icon-only" title="Editar usuário e VTCall" onClick={()=>openEdit(u)}><Pencil size={15}/></button>{isPortalDeveloperUid(u.uid)?<span className="protected-access"><LockKeyhole size={14}/> Protegido</span>:<button className="btn" onClick={()=>toggle(u)}>{u.active?<><UserX size={15}/> Bloquear</>:<><UserCheck size={15}/> Ativar</>}</button>}</div>}</td>
        </tr>)}
      </tbody></table></div>
    </div>

    {diagOpen&&<Modal title="Diagnóstico do backend" onClose={()=>setDiagOpen(false)} footer={<button className="btn primary" onClick={()=>setDiagOpen(false)}>Fechar</button>}>
      <div className="stack">
        {diagLoading&&<div className="info-note"><ServerCog size={16}/><span>Testando Firebase Admin no servidor...</span></div>}
        {!diagLoading&&diag&&<div className="diagnostic-grid">
          <div className={`diag-row ${diag.version==="v1.33-known-route"?"ok":"bad"}`}><span>Versão da rota</span><strong>{diag.version||"Não identificada"}</strong></div>
          <div className="diag-row"><span>HTTP</span><strong>{diag.httpStatus??"—"}</strong></div>
          <div className={`diag-row ${diag.processEnvCount>0?"ok":"bad"}`}><span>Total de envs no runtime</span><strong>{diag.processEnvCount??"—"}</strong></div>
          <div className={`diag-row ${diag.vercelEnv?"ok":"bad"}`}><span>VERCEL_ENV</span><strong>{diag.vercelEnv||"Ausente"}</strong></div>
          <div className={`diag-row ${diag.serverEnvTest?"ok":"bad"}`}><span>SERVER_ENV_TEST</span><strong>{diag.serverEnvTest||"Ausente"}</strong></div>
          <div className={`diag-row ${diag.env?.firebaseProject&&diag.env?.firebaseEmail&&diag.env?.firebaseKey?"ok":"bad"}`}><span>Credenciais Firebase</span><strong>{diag.env?.firebaseProject&&diag.env?.firebaseEmail&&diag.env?.firebaseKey?"Presentes":"Incompletas"}</strong></div>
          <div className={`diag-row ${diag.firebaseAdminInit?"ok":"bad"}`}><span>Firebase Admin SDK</span><strong>{diag.firebaseAdminInit?"Inicializou":"FALHA"}</strong></div>
          <div className={`diag-row ${diag.tokenVerified?"ok":"bad"}`}><span>Validar login</span><strong>{diag.tokenVerified?"OK":"FALHA"}</strong></div>
          <div className={`diag-row ${diag.firestoreRead?"ok":"bad"}`}><span>Ler Firestore</span><strong>{diag.firestoreRead?"OK":"FALHA"}</strong></div>
          <div className={`diag-row ${diag.userDocumentExists?"ok":"bad"}`}><span>Documento do usuário</span><strong>{diag.userDocumentExists?"Encontrado":"Não encontrado"}</strong></div>
          <div className={`diag-row ${diag.firestoreWrite?"ok":"bad"}`}><span>Gravar Firestore</span><strong>{diag.firestoreWrite?"OK":"FALHA"}</strong></div>
          <div className={`diag-row ${diag.env?.cloudinary?"ok":"bad"}`}><span>Cloudinary</span><strong>{diag.env?.cloudinary?"Configurado":"Incompleto"}</strong></div>
          <div className={`diag-row ${diag.env?.vtcall?"ok":"bad"}`}><span>VTCall</span><strong>{diag.env?.vtcall?"Configurado":"Incompleto"}</strong></div>
          {diag.error&&<div className="error">{typeof diag.error==="string"?diag.error:`${diag.error.code?diag.error.code+" — ":""}${diag.error.message||JSON.stringify(diag.error)}`}</div>}
          {diag.raw&&<div className="diag-code">Resposta bruta: {String(diag.raw)}</div>}
        </div>}
      </div>
    </Modal>}

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

    {editing&&<Modal title={`Editar usuário • ${editing.name}`} onClose={()=>{setEditing(null);setEditCpf("")}} footer={<><button className="btn" onClick={()=>{setEditing(null);setEditCpf("")}}>Cancelar</button><button className="btn primary" onClick={saveEditing} disabled={loading||loadingVT}>{loading?"Salvando...":"Salvar alterações"}</button></>}>
      <div className="stack">{error&&<div className="error">{error}</div>}{loadingVT&&<div className="info-note"><KeyRound size={16}/><span>Carregando configuração segura do VTCall...</span></div>}
        {currentIsDeveloper&&<div className="admin-photo-editor">
          <div className="admin-photo-preview">{editing.photoUrl?<img src={editing.photoUrl} alt={`Foto de ${editing.name}`}/>:<span>{editing.name?.[0]||"U"}</span>}</div>
          <div className="admin-photo-copy"><strong>Foto de perfil</strong><small>Como Desenvolvedor, você pode substituir a foto deste usuário.</small>{photoMessage&&<em className={photoMessage.includes("sucesso")?"photo-success":"photo-error"}>{photoMessage}</em>}</div>
          <label className="btn"><Camera size={15}/>{photoLoading?"Enviando...":"Alterar foto"}<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={photoLoading} onChange={changeEditingPhoto}/></label>
        </div>}
        <div className="field"><label>Nome completo</label><input className="input" value={editing.name||""} onChange={(e)=>setEditing({...editing,name:e.target.value})}/></div>
        <div className="field"><label>E-mail de acesso</label><input className="input" type="email" value={editing.email||""} onChange={(e)=>setEditing({...editing,email:e.target.value})}/><small style={{color:"#777"}}>Ao alterar o e-mail, o novo endereço passa a ser usado no próximo login.</small></div>
        <div className="field"><label>Novo CPF / redefinir senha</label><input className="input" inputMode="numeric" value={editCpf} onChange={(e)=>setEditCpf(e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="Deixe em branco para manter a senha atual"/><small style={{color:"#777"}}>Preencha apenas se quiser redefinir a senha de acesso para um novo CPF. O CPF não é salvo em texto puro.</small></div>
        <div className="grid-2">
          <div className="field"><label>Departamento</label><select className="select" value={DEPARTMENTS.includes(editing.department||"")?editing.department:"__outro__"} onChange={(e)=>{if(e.target.value==="__outro__"){setOtherDepartment(DEPARTMENTS.includes(editing.department||"")?"":(editing.department||""));setEditing({...editing,department:"__outro__"})}else{setOtherDepartment("");setEditing({...editing,department:e.target.value})}}}>{DEPARTMENTS.map((d)=><option key={d}>{d}</option>)}<option value="__outro__">Outro</option></select></div>
          <div className="field"><label>Perfil de acesso</label><select className="select" value={editing.role} disabled={isPortalDeveloperUid(editing.uid) || (editing.uid===auth.currentUser?.uid && !currentIsDeveloper)} onChange={(e)=>setEditing({...editing,role:e.target.value as UserRole})}>{isPortalDeveloperUid(editing.uid)&&<option value="desenvolvedor">Desenvolvedor</option>}<option value="admin">Administrador</option><option value="atendente">Atendente</option><option value="consulta">Consulta</option></select></div>
        </div>
        {editing.department==="__outro__"&&<div className="field"><label>Nome do departamento</label><input className="input" value={otherDepartment} onChange={(e)=>setOtherDepartment(e.target.value)}/></div>}
        {isPortalDeveloperUid(editing.uid)?<div className="developer-note"><LockKeyhole size={16}/><span>Perfil Desenvolvedor exclusivo. O nível de acesso não pode ser alterado, bloqueado ou atribuído a outra conta.</span></div>:editing.uid===auth.currentUser?.uid&&<div className="info-note"><KeyRound size={16}/><span>Por segurança, você não pode remover seu próprio perfil de administrador por esta tela.</span></div>}
        <VtFields/>
      </div>
    </Modal>}
  </>;
}
