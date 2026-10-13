"use client";

import { Database, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { useSession } from "./AuthGate";
import Plate from "./Plate";

export default function SGAPage() {
  const { user } = useSession();
  const [checking, setChecking] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [error, setError] = useState("");
  const [plate, setPlate] = useState("");
  const [searching, setSearching] = useState(false);
  const [eventResult, setEventResult] = useState<any>(null);

  async function token() { return user?.getIdToken(); }

  async function testConnection() {
    setChecking(true); setError(""); setDiagnostic(null);
    try {
      const t = await token();
      const res = await fetch(`/api/sga/diagnostics?t=${Date.now()}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error + (data.technical ? ` — ${data.technical}` : ""));
      setDiagnostic(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao testar o SGA."); }
    finally { setChecking(false); }
  }

  async function searchPlate() {
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cleaned) return setError("Informe uma placa para consultar.");
    setSearching(true); setError(""); setEventResult(null);
    try {
      const t = await token();
      const res = await fetch(`/api/sga/event?plate=${encodeURIComponent(cleaned)}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error + (data.technical ? ` — ${data.technical}` : ""));
      setEventResult(data.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao consultar o SGA."); }
    finally { setSearching(false); }
  }

  const events = Array.isArray(eventResult?.eventos) ? eventResult.eventos : [];
  const departments = diagnostic?.departments ? (Array.isArray(diagnostic.departments) ? diagnostic.departments : [diagnostic.departments]) : [];
  const statuses = diagnostic?.statuses ? (Array.isArray(diagnostic.statuses) ? diagnostic.statuses : [diagnostic.statuses]) : [];
  const types = diagnostic?.types ? (Array.isArray(diagnostic.types) ? diagnostic.types : [diagnostic.types]) : [];

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <div><h2>Integração SGA</h2><small>Valide a chave, autenticação e permissões antes de liberar o envio automático de coletas.</small></div>
          <button className="btn primary" onClick={testConnection} disabled={checking}><RefreshCw size={15} className={checking ? "spin-icon" : ""} /> {checking ? "Testando..." : "Testar conexão"}</button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="sga-status-grid">
          <div><Database size={18} /><span><strong>API SGA v2</strong><small>Conexão protegida pelo backend do portal</small></span></div>
          <div><strong>{diagnostic?.ok ? "Conectado" : "Aguardando teste"}</strong><small>{diagnostic?.ok ? "Autenticação realizada com sucesso" : "Preencha as variáveis SGA na Vercel"}</small></div>
          <div><strong>{diagnostic?.ok ? departments.length : "—"}</strong><small>Departamentos disponíveis</small></div>
          <div><strong>{diagnostic?.ok ? statuses.length : "—"}</strong><small>Status de atendimento</small></div>
          <div><strong>{diagnostic?.ok ? types.length : "—"}</strong><small>Tipos de atendimento</small></div>
        </div>
        {diagnostic?.ok && (
          <>
            <div className="sga-checks">
              <span className={diagnostic.checks?.departments?.ok ? "ok" : "fail"}>Departamentos: {diagnostic.checks?.departments?.ok ? "OK" : diagnostic.checks?.departments?.error || "Sem permissão"}</span>
              <span className={diagnostic.checks?.statuses?.ok ? "ok" : "fail"}>Status: {diagnostic.checks?.statuses?.ok ? "OK" : diagnostic.checks?.statuses?.error || "Sem permissão"}</span>
              <span className={diagnostic.checks?.types?.ok ? "ok" : "fail"}>Tipos: {diagnostic.checks?.types?.ok ? "OK" : diagnostic.checks?.types?.error || "Sem permissão"}</span>
            </div>
          <div className="sga-catalog-grid">
            <div><h3>Departamentos</h3>{departments.map((item: any, i: number) => <span key={i}><strong>{item.codigo_departamento ?? item.codigo ?? "—"}</strong>{item.descricao ?? item.nome ?? "—"}</span>)}</div>
            <div><h3>Status</h3>{statuses.map((item: any, i: number) => <span key={i}><strong>{item.codigo_statusatendimento ?? item.codigo ?? "—"}</strong>{item.descricao ?? "—"}</span>)}</div>
            <div><h3>Tipos</h3>{types.map((item: any, i: number) => <span key={i}><strong>{item.codigo_tipoatendimento ?? item.codigo ?? "—"}</strong>{item.descricao ?? "—"}</span>)}</div>
          </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h2>Consulta de evento por placa</h2><small>Primeiro teste operacional da API: localizar o evento vinculado ao veículo.</small></div></div>
        <div className="sga-search-row">
          <input className="input" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))} placeholder="ABC1D23" />
          <button className="btn" onClick={searchPlate} disabled={searching}><Search size={15} /> {searching ? "Consultando..." : "Consultar SGA"}</button>
        </div>
        {eventResult && events.length === 0 && <div className="empty compact-empty">Nenhum evento localizado para esta placa.</div>}
        {events.length > 0 && <div className="sga-event-list">{events.map((event: any, index: number) => (
          <div className="sga-event-card" key={`${event.codigo_evento || event.protocolo || index}`}>
            <div><Plate value={event.placa || plate} compact /><strong>{event.nome_associado || "Associado"}</strong></div>
            <span><small>Protocolo</small><strong>{event.protocolo || "—"}</strong></span>
            <span><small>Situação</small><strong>{event.situacao_evento || "—"}</strong></span>
            <span><small>Motivo</small><strong>{event.descricao_motivo || "—"}</strong></span>
            <span><small>Código evento</small><strong>{event.codigo_evento || "—"}</strong></span>
          </div>
        ))}</div>}
      </div>

      <div className="info-note">Nesta versão a integração SGA é somente leitura/teste. Nenhum atendimento ou documento será criado no SGA até validarmos a nova chave e os códigos de departamento, status e tipo.</div>
    </div>
  );
}
