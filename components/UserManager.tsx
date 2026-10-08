"use client";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { BriefcaseBusiness, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import type { AppUser, UserRole } from "@/lib/types";
import Modal from "./Modal";

const DEPARTMENTS = [
  "Atendimento",
  "Cadastro",
  "Comercial",
  "Operação",
  "Rastreamento",
  "Administrativo",
  "Marketing",
];

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otherDepartment, setOtherDepartment] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    cpf: "",
    role: "atendente" as UserRole,
    department: "Atendimento",
  });

  useEffect(
    () =>
      onSnapshot(query(collection(db, "users"), orderBy("name")), (s) =>
        setUsers(s.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)))
      ),
    []
  );

  async function token() {
    return await auth.currentUser?.getIdToken();
  }

  const finalDepartment = form.department === "__outro__" ? otherDepartment.trim() : form.department;

  async function create() {
    setError("");
    if (!form.name || !form.email || !finalDepartment || form.cpf.replace(/\D/g, "").length !== 11)
      return setError("Preencha nome, e-mail, departamento e um CPF com 11 dígitos.");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          ...form,
          department: finalDepartment,
          cpf: form.cpf.replace(/\D/g, ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário");
      setForm({ name: "", email: "", cpf: "", role: "atendente", department: "Atendimento" });
      setOtherDepartment("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(u: AppUser) {
    const res = await fetch(`/api/admin/users/${u.uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ active: !u.active }),
    });
    if (!res.ok) alert("Não foi possível alterar o acesso.");
  }

  async function saveDepartment() {
    if (!editing) return;
    const department =
      editing.department === "__outro__" ? otherDepartment.trim() : (editing.department || "").trim();

    if (!department) return setError("Informe o departamento.");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${editing.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ department }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar.");
      setEditing(null);
      setOtherDepartment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Usuários com acesso</h2>
            <small>Perfis, identificação e status de acesso ao portal.</small>
          </div>
          <button className="btn primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Novo usuário
          </button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Departamento</th>
                <th>CPF</th>
                <th>Perfil</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid}>
                  <td>
                    <div className="user-table-cell">
                      {u.photoUrl ? (
                        <img className="avatar" src={u.photoUrl} alt="" />
                      ) : (
                        <div className="avatar">{u.name?.[0]}</div>
                      )}
                      <strong>{u.name}</strong>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="department-chip">
                      <BriefcaseBusiness size={13} />
                      {u.department || "Não informado"}
                    </span>
                  </td>
                  <td>{u.cpfLast4 ? `***.***.***-${u.cpfLast4}` : "—"}</td>
                  <td><span className={`pill ${u.role}`}>{u.role}</span></td>
                  <td><span className={`pill ${u.active ? "active" : ""}`}>{u.active ? "Ativo" : "Bloqueado"}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn icon-only" title="Editar departamento" onClick={() => {
                        setError("");
                        setEditing({ ...u, department: u.department || "Atendimento" });
                        setOtherDepartment("");
                      }}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn" onClick={() => toggle(u)}>
                        {u.active ? <><UserX size={15} /> Bloquear</> : <><UserCheck size={15} /> Ativar</>}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal
          title="Criar usuário"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn primary" onClick={create} disabled={loading}>
                {loading ? "Criando..." : "Criar usuário"}
              </button>
            </>
          }
        >
          <div className="stack">
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label>Nome completo</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>E-mail de acesso</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>CPF — senha de acesso</label>
              <input className="input" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
              <small style={{ color: "#777" }}>O CPF não será gravado em texto puro no Firestore.</small>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Departamento</label>
                <select className="select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  <option value="__outro__">Outro</option>
                </select>
              </div>
              <div className="field">
                <label>Perfil de acesso</label>
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  <option value="admin">Administrador</option>
                  <option value="atendente">Atendente</option>
                  <option value="consulta">Consulta</option>
                </select>
              </div>
            </div>
            {form.department === "__outro__" && (
              <div className="field">
                <label>Nome do departamento</label>
                <input className="input" value={otherDepartment} onChange={(e) => setOtherDepartment(e.target.value)} />
              </div>
            )}
            <div className="info-note">
              <BriefcaseBusiness size={16} />
              <span>Departamento é apenas uma identificação interna e não altera as permissões do usuário.</span>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Departamento • ${editing.name}`}
          onClose={() => { setEditing(null); setOtherDepartment(""); }}
          footer={
            <>
              <button className="btn" onClick={() => { setEditing(null); setOtherDepartment(""); }}>Cancelar</button>
              <button className="btn primary" onClick={saveDepartment} disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </>
          }
        >
          <div className="stack">
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label>Departamento</label>
              <select
                className="select"
                value={DEPARTMENTS.includes(editing.department || "") ? editing.department : "__outro__"}
                onChange={(e) => {
                  if (e.target.value === "__outro__") {
                    setOtherDepartment(DEPARTMENTS.includes(editing.department || "") ? "" : (editing.department || ""));
                    setEditing({ ...editing, department: "__outro__" });
                  } else {
                    setOtherDepartment("");
                    setEditing({ ...editing, department: e.target.value });
                  }
                }}
              >
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                <option value="__outro__">Outro</option>
              </select>
            </div>
            {editing.department === "__outro__" && (
              <div className="field">
                <label>Nome do departamento</label>
                <input className="input" value={otherDepartment} onChange={(e) => setOtherDepartment(e.target.value)} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
