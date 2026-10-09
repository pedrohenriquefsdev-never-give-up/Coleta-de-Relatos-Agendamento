"use client";

import { addDays, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  CalendarCheck2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Eye,
  History,
  LogOut,
  Pencil,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import type { AppUser, Appointment } from "@/lib/types";
import { effectiveRole, isManagementRole } from "@/lib/access-control";
import { useSession } from "./AuthGate";
import AppointmentModal from "./AppointmentModal";
import Plate from "./Plate";
import ProfilePanel from "./ProfilePanel";
import ThemeToggle from "./ThemeToggle";
import UserManager from "./UserManager";
import VTCallPage from "./VTCallPage";

const hours = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
];

const actions: Record<string, string> = {
  LOGIN_SUCCESS: "Login realizado",
  APPOINTMENT_CREATED: "Criou agendamento",
  APPOINTMENT_UPDATED: "Alterou agendamento",
  APPOINTMENT_DELETED: "Excluiu agendamento",
  USER_CREATED: "Criou usuário",
  USER_UPDATED: "Alterou usuário",
  PROFILE_PHOTO_UPDATED: "Atualizou foto do perfil",
  USER_PHOTO_UPDATED_BY_DEVELOPER: "Desenvolvedor alterou foto de usuário",
  VTCALL_CREDENTIALS_UPDATED: "Atualizou configuração VTCall",
  VTCALL_CALL_REQUESTED: "Solicitou ligação VTCall",
};

const tabLabels: Record<string, string> = {
  agenda: "Agenda",
  agendamentos: "Agendamentos",
  usuarios: "Usuários",
  logs: "Logs e auditoria",
  perfil: "Meu perfil",
  vtcall: "VTCall",
};

const appointmentStatusLabels: Record<string, string> = {
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

export default function Dashboard() {
  const { profile, logout } = useSession();
  const [tab, setTab] = useState("agenda");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [responsibleFilter, setResponsibleFilter] = useState("todos");
  const [dateFilter, setDateFilter] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [modal, setModal] = useState<{ item?: Appointment | null; date?: string; time?: string } | null>(null);

  useEffect(() => {
    return onSnapshot(collection(db, "appointments"), (snapshot) => {
      setAppointments(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Appointment)));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "users"), orderBy("name")), (snapshot) => {
      setUsers(snapshot.docs.map((docSnap) => { const raw = { uid: docSnap.id, ...docSnap.data() } as AppUser; return { ...raw, role: effectiveRole(raw.uid, raw.role) }; }));
    });
  }, []);

  useEffect(() => {
    if (!profile || !isManagementRole(profile.role)) {
      setLogs([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(100)),
      (snapshot) => setLogs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
      () => setLogs([]),
    );
  }, [profile]);

  const start = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const filtered = appointments.filter((a) => {
    const matchesSearch = `${a.plate} ${a.fullName} ${a.phone}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "todos" || a.status === statusFilter || (statusFilter === "concluido" && a.status === "atendido");
    const matchesResponsible = responsibleFilter === "todos" || (a.assignedTo || a.createdBy) === responsibleFilter;
    const matchesDate = !dateFilter || a.date === dateFilter;
    return matchesSearch && matchesStatus && matchesResponsible && matchesDate;
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const todayItems = appointments.filter((a) => a.date === today && a.status !== "cancelado");
  const confirmed = appointments.filter((a) => a.date === today && a.status === "confirmado").length;
  const completed = appointments.filter((a) => a.date === today && (a.status === "atendido" || a.status === "concluido")).length;
  const nextAppointment = todayItems.filter((a) => a.time >= format(new Date(), "HH:mm")).sort((a, b) => a.time.localeCompare(b.time))[0];

  if (!profile) return <div className="loading"><div className="spinner" /></div>;
  const currentProfile = profile;
  const canDeleteAppointments = currentProfile.role === "desenvolvedor" || currentProfile.role === "admin";
  const canEditAppointments = currentProfile.role === "desenvolvedor" || currentProfile.role === "admin" || currentProfile.role === "atendente";

  function openEdit(appointment: Appointment) {
    setModal({ item: appointment });
  }

  function renderAppointmentsTab() {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Todos os agendamentos</h2>
            <small>Consulte, edite e acompanhe os registros da agenda.</small>
          </div>
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input className="input" placeholder="Placa, nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="select table-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todos">Todos os status</option>
              <option value="agendado">Agendado</option>
              <option value="confirmado">Confirmado</option>
              <option value="em_contato">Em contato</option>
              <option value="nao_atendeu">Não atendeu</option>
              <option value="reagendar">Reagendar</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
              <option value="nao_compareceu">Não compareceu</option>
            </select>
            <select className="select table-filter" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)}>
              <option value="todos">Todos os responsáveis</option>
              {users.filter((u) => u.active && (u.role === "desenvolvedor" || u.role === "admin" || u.role === "atendente")).map((u) => (
                <option key={u.uid} value={u.uid}>{u.name}</option>
              ))}
            </select>
            <input className="input table-date-filter" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} title="Filtrar por data" />
            {(search || statusFilter !== "todos" || responsibleFilter !== "todos" || dateFilter) && (
              <button className="btn" onClick={() => { setSearch(""); setStatusFilter("todos"); setResponsibleFilter("todos"); setDateFilter(""); }}>Limpar</button>
            )}
            {canEditAppointments && (
              <button className="btn primary" onClick={() => setModal({})}>
                <Plus size={16} /> Novo
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Hora</th>
                <th>Placa</th>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Responsável</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
                .map((a) => (
                  <tr key={a.id}>
                    <td>{a.date.split("-").reverse().join("/")}</td>
                    <td>{a.time}</td>
                    <td><Plate value={a.plate} compact /></td>
                    <td><strong>{a.fullName}</strong></td>
                    <td>{a.phone}</td>
                    <td>{a.assignedToName || a.createdByName || "—"}</td>
                    <td><span className={`pill status-${a.status}`}>{appointmentStatusLabels[a.status] || a.status.replaceAll("_", " ")}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn icon-only" title={canEditAppointments ? "Editar agendamento" : "Visualizar agendamento"} onClick={() => openEdit(a)}>
                          {canEditAppointments ? <Pencil size={15} /> : <Eye size={15} />}
                        </button>
                        {canDeleteAppointments && (
                          <button className="btn icon-only danger ghost" title="Excluir agendamento" onClick={() => openEdit(a)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8}><div className="empty compact-empty">Nenhum agendamento encontrado com os filtros selecionados.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderBody() {
    if (tab === "usuarios") {
      return isManagementRole(currentProfile.role) ? (
        <UserManager />
      ) : (
        <div className="panel"><div className="empty">Somente o Desenvolvedor e administradores podem gerenciar usuários.</div></div>
      );
    }

    if (tab === "perfil") return <ProfilePanel />;

    if (tab === "vtcall") return <VTCallPage />;

    if (tab === "logs") {
      if (!isManagementRole(currentProfile.role)) {
        return <div className="panel"><div className="empty">Somente o Desenvolvedor e administradores podem consultar os logs.</div></div>;
      }
      return (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Logs e auditoria</h2>
              <small>Histórico das principais ações realizadas no portal.</small>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Referência</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.createdAt?.toDate ? format(l.createdAt.toDate(), "dd/MM/yyyy HH:mm") : "—"}</td>
                    <td>{l.userName || l.userEmail || "Sistema"}</td>
                    <td>{actions[l.action] || l.action}</td>
                    <td>{l.details?.fullName || l.details?.plate || l.details?.phone || l.targetId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (tab === "agendamentos") return renderAppointmentsTab();

    return (
      <>
        <div className="hero-row">
          <div className="welcome-card">
            <div>
              <span className="eyebrow">PAINEL OPERACIONAL</span>
              <h2>Olá, {currentProfile.name.split(" ")[0]}.</h2>
              <p>Acompanhe a agenda de hoje e os próximos atendimentos.</p>
            </div>
            <div className="welcome-vehicle">
              <CarFront size={42} />
              <Plate value={nextAppointment?.plate || "BRA2E19"} compact />
            </div>
          </div>

          <div className="quick-actions">
            {canEditAppointments ? (
              <button onClick={() => setModal({})}>
                <span className="quick-icon"><CalendarCheck2 size={21} /></span>
                <span><strong>Novo agendamento</strong><small>Criar um horário</small></span>
                <Plus size={17} />
              </button>
            ) : (
              <div className="quick-disabled">
                <span className="quick-icon"><CalendarCheck2 size={21} /></span>
                <span><strong>Agenda</strong><small>Perfil somente consulta</small></span>
                <em>Consulta</em>
              </div>
            )}
            <button onClick={() => setTab("vtcall")}>
              <span className="quick-icon"><PhoneCall size={21} /></span>
              <span><strong>VTCall</strong><small>Ramal e configuração</small></span>
              <span className="quick-ready">Ativo</span>
            </button>
            <div className="quick-disabled">
              <span className="quick-icon"><FileText size={21} /></span>
              <span><strong>Coleta de relato</strong><small>Fluxo em evolução</small></span>
              <em>Em breve</em>
            </div>
          </div>
        </div>

        <div className="cards">
          <div className="stat"><span className="stat-icon"><CalendarDays size={18} /></span><div><div className="label">Hoje</div><div className="value">{todayItems.length}</div><div className="meta">agendamentos ativos</div></div></div>
          <div className="stat"><span className="stat-icon"><CheckCircle2 size={18} /></span><div><div className="label">Confirmados</div><div className="value">{confirmed}</div><div className="meta">para hoje</div></div></div>
          <div className="stat"><span className="stat-icon"><ClipboardList size={18} /></span><div><div className="label">Atendidos</div><div className="value">{completed}</div><div className="meta">concluídos hoje</div></div></div>
          <div className="stat"><span className="stat-icon"><Clock3 size={18} /></span><div><div className="label">Próximo horário</div><div className="value">{nextAppointment?.time || "—"}</div><div className="meta">agenda do dia</div></div></div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Agenda semanal</h2>
              <small>{format(start, "dd MMM", { locale: ptBR })} — {format(addDays(start, 6), "dd MMM yyyy", { locale: ptBR })}</small>
            </div>
            <div className="toolbar">
              <button className="btn" onClick={() => setWeekOffset((v) => v - 1)}>Anterior</button>
              <button className="btn" onClick={() => setWeekOffset(0)}>Hoje</button>
              <button className="btn" onClick={() => setWeekOffset((v) => v + 1)}>Próxima</button>
              {canEditAppointments && <button className="btn primary" onClick={() => setModal({})}><Plus size={16} /> Novo</button>}
            </div>
          </div>

          <div className="calendar-wrap">
            <div className="calendar">
              <div className="cal-header">
                <div>Horário</div>
                {days.map((d) => {
                  const date = format(d, "yyyy-MM-dd");
                  const dayCount = appointments.filter((a) => a.date === date && a.status !== "cancelado").length;
                  return (
                    <div key={d.toISOString()}>
                      {format(d, "EEE", { locale: ptBR })}
                      <strong>{format(d, "dd/MM")}</strong>
                      <span className="day-appointment-count">{dayCount === 1 ? "1 coleta" : `${dayCount} coletas`}</span>
                    </div>
                  );
                })}
              </div>

              {hours.map((h) => (
                <div className="cal-row" key={h}>
                  <div className="cal-time">{h}</div>
                  {days.map((d) => {
                    const date = format(d, "yyyy-MM-dd");
                    const items = appointments
                      .filter((a) => a.date === date && a.time === h)
                      .sort((a, b) => (a.assignedToName || a.createdByName || "").localeCompare(b.assignedToName || b.createdByName || ""));
                    return (
                      <div className="cal-cell" key={date + h} onDoubleClick={() => canEditAppointments && setModal({ date, time: h })}>
                        {items.map((a) => (
                          <div key={a.id} className={`appointment-card ${a.status}`} onClick={() => openEdit(a)}>
                            <div className="appointment-time">{a.time}</div>
                            <Plate value={a.plate} compact />
                            <span>{a.fullName}</span>
                            <small className="appointment-responsible">{a.assignedToName || a.createdByName || "Sem responsável"}</small>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark image-mark"><img src="/assets/app-symbol.png" alt="Ícone do aplicativo" /></span>
          <div>
            <strong>Portal Coleta</strong>
            <small>de Relatos</small>
          </div>
        </div>

        <div className="nav">
          <button className={tab === "agenda" ? "active" : ""} onClick={() => setTab("agenda")}><CalendarDays size={18} /> Agenda</button>
          <button className={tab === "agendamentos" ? "active" : ""} onClick={() => setTab("agendamentos")}><ClipboardList size={18} /> Agendamentos</button>
          {isManagementRole(currentProfile.role) && <button className={tab === "usuarios" ? "active" : ""} onClick={() => setTab("usuarios")}><Users size={18} /> Usuários</button>}
          {isManagementRole(currentProfile.role) && <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}><History size={18} /> Logs</button>}
          <button className={tab === "perfil" ? "active" : ""} onClick={() => setTab("perfil")}><UserRound size={18} /> Meu perfil</button>
          <button className={tab === "vtcall" ? "active" : ""} onClick={() => setTab("vtcall")}><PhoneCall size={18} /> VTCall</button>
        </div>

        <div className="sidebar-profile-card" onClick={() => setTab("perfil")}>
          {currentProfile.photoUrl ? (
            <img className="sidebar-profile-photo" src={currentProfile.photoUrl} alt={`Foto de ${currentProfile.name}`} />
          ) : (
            <div className="sidebar-profile-photo sidebar-profile-placeholder">{currentProfile.name?.[0]}</div>
          )}
          <strong>{currentProfile.name}</strong>
          <span>{currentProfile.department || "Departamento não informado"}</span>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-session">
            <div>
              <small>Sessão ativa</small>
              <strong>{currentProfile.role === "desenvolvedor" ? "Desenvolvedor" : currentProfile.role}</strong>
            </div>
            <button className="icon-btn sidebar-logout" onClick={logout} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="breadcrumb">Portal Coleta de Relatos</div>
            <h1>{tabLabels[tab]}</h1>
            <p>{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <button className="top-user" onClick={() => setTab("perfil")}>
              {currentProfile.photoUrl ? <img className="avatar" src={currentProfile.photoUrl} alt="" /> : <div className="avatar">{currentProfile.name?.[0]}</div>}
              <span>
                <strong>{currentProfile.name}</strong>
                <small>{currentProfile.role === "desenvolvedor" ? "Desenvolvedor" : currentProfile.role}</small>
              </span>
            </button>
          </div>
        </div>

        {renderBody()}
      </main>

      {modal && <AppointmentModal initial={modal.item} defaultDate={modal.date} defaultTime={modal.time} existingAppointments={appointments} availableUsers={users} readOnly={!canEditAppointments} onClose={() => setModal(null)} onSaved={() => {}} />}
    </div>
  );
}
