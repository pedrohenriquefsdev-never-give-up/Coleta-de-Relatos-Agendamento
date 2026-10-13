"use client";

import { Database, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { useSession } from "./AuthGate";
import Plate from "./Plate";

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

export default function SGAPage() {
  const { user } = useSession();
  const [checking, setChecking] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [error, setError] = useState("");
  const [plate, setPlate] = useState("");
  const [searching, setSearching] = useState(false);
  const [eventResult, setEventResult] = useState<any>(null);
  const [eventResolution, setEventResolution] = useState<any>(null);

  async function token() { return user?.getIdToken(); }

  async function testConnection() {
    setChecking(true);
    setError("");
    setDiagnostic(null);
    try {
      const t = await token();
      const res = await fetch(`/api/sga/diagnostics?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${data.error || "Falha ao testar o SGA."}${data.technical ? ` — ${data.technical}` : ""}`);
      setDiagnostic(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao testar o SGA.");
    } finally {
      setChecking(false);
    }
  }

  async function searchPlate() {
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cleaned) return setError("Informe uma placa para consultar.");
    setSearching(true);
    setError("");
    setEventResult(null);
    setEventResolution(null);
    try {
      const t = await token();
      const res = await fetch(`/api/sga/event?plate=${encodeURIComponent(cleaned)}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      setEventResolution(data.resolution || null);
      if (!res.ok) throw new Error(`${data.error || "Falha ao consultar o SGA."}${data.technical && data.technical !== data.error ? ` — ${data.technical}` : ""}`);
      setEventResult(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar o SGA.");
    } finally {
      setSearching(false);
    }
  }

  const events = Array.isArray(eventResult?.eventos) ? eventResult.eventos : [];
  const departments = asArray(diagnostic?.departments);
  const statuses = asArray(diagnostic?.statuses);
  const types = asArray(diagnostic?.types);
  const eventSituations = asArray(diagnostic?.eventSituations);
  const photoTypes = asArray(diagnostic?.photoTypes);

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Integração SGA</h2>
            <small>Valide autenticação e as permissões usadas pelo Portal antes do primeiro envio real.</small>
          </div>
          <button className="btn primary" onClick={testConnection} disabled={checking}>
            <RefreshCw size={15} className={checking ? "spin-icon" : ""} /> {checking ? "Testando..." : "Testar conexão"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="sga-status-grid sga-status-grid-v1398">
          <div><Database size={18} /><span><strong>API SGA v2</strong><small>Credenciais usadas somente no backend do Portal</small></span></div>
          <div><strong>{diagnostic?.ok ? "Conectado" : "Aguardando teste"}</strong><small>{diagnostic?.ok ? "Usuário de integração autenticado" : "Variáveis configuradas na Vercel"}</small></div>
          <div><strong>{diagnostic?.ok ? eventSituations.length : "—"}</strong><small>Situações de evento</small></div>
          <div><strong>{diagnostic?.ok ? photoTypes.length : "—"}</strong><small>Tipos de foto/documento</small></div>
          <div><strong>{diagnostic?.ok ? departments.length + statuses.length + types.length : "—"}</strong><small>Cadastros de Atendimento</small></div>
        </div>

        {diagnostic?.ok && (
          <>
            <div className="sga-checks">
              <span className={diagnostic.checks?.eventSituations?.ok ? "ok" : "fail"}>Evento / situações: {diagnostic.checks?.eventSituations?.ok ? "OK" : diagnostic.checks?.eventSituations?.error || "Sem permissão"}</span>
              <span className={diagnostic.checks?.photoTypes?.ok ? "ok" : "fail"}>Vistoria / tipo foto: {diagnostic.checks?.photoTypes?.ok ? "OK" : diagnostic.checks?.photoTypes?.error || "Sem permissão"}</span>
              <span className={diagnostic.checks?.departments?.ok ? "ok" : "fail"}>Atendimento / departamentos: {diagnostic.checks?.departments?.ok ? "OK" : diagnostic.checks?.departments?.error || "Sem permissão"}</span>
              <span className={diagnostic.checks?.statuses?.ok ? "ok" : "fail"}>Atendimento / status: {diagnostic.checks?.statuses?.ok ? "OK" : diagnostic.checks?.statuses?.error || "Sem permissão"}</span>
              <span className={diagnostic.checks?.types?.ok ? "ok" : "fail"}>Atendimento / tipos: {diagnostic.checks?.types?.ok ? "OK" : diagnostic.checks?.types?.error || "Sem permissão"}</span>
            </div>

            {!diagnostic.checks?.photoTypes?.ok && (
              <div className="info-note sga-permission-note">
                Para anexar o PDF ao Evento, habilite também no token a permissão <strong>Vistoria → listar tipo foto</strong>. O SGA exige o código da classificação no upload do documento.
              </div>
            )}

            <div className="sga-catalog-grid sga-catalog-grid-v1398">
              <div><h3>Situações de Evento</h3>{eventSituations.map((item: any, i: number) => <span key={i}><strong>{item.codigo_eventosituacao ?? item.codigo ?? "—"}</strong>{item.descricao ?? item.nome ?? "—"}</span>)}</div>
              <div><h3>Tipos de documento</h3>{photoTypes.map((item: any, i: number) => <span key={i}><strong>{item.codigo_tipofoto ?? item.codigo ?? "—"}</strong>{item.descricao ?? item.nome ?? "—"}</span>)}</div>
              <div><h3>Departamentos</h3>{departments.map((item: any, i: number) => <span key={i}><strong>{item.codigo_departamento ?? item.codigo ?? "—"}</strong>{item.descricao ?? item.nome ?? "—"}</span>)}</div>
              <div><h3>Status Atendimento</h3>{statuses.map((item: any, i: number) => <span key={i}><strong>{item.codigo_statusatendimento ?? item.codigo ?? "—"}</strong>{item.descricao ?? "—"}</span>)}</div>
              <div><h3>Tipos Atendimento</h3>{types.map((item: any, i: number) => <span key={i}><strong>{item.codigo_tipoatendimento ?? item.codigo ?? "—"}</strong>{item.descricao ?? "—"}</span>)}</div>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><h2>Consulta de evento por placa</h2><small>Valida a ligação entre a placa do Portal e o evento correto no SGA.</small></div>
        </div>
        <div className="sga-search-row">
          <input className="input" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))} placeholder="GPV0000 ou ABC1D23" />
          <button className="btn" onClick={searchPlate} disabled={searching}><Search size={15} /> {searching ? "Consultando..." : "Consultar SGA"}</button>
        </div>
        <small className="field-help">Pode digitar com ou sem hífen. O Portal normaliza a placa e só aceita veículo/evento cuja placa retornada corresponda exatamente à consulta.</small>

        {error && Array.isArray(eventResolution?.trace) && eventResolution.trace.length > 0 && (
          <div className="info-note sga-resolution-note">
            <strong>Validação estrita:</strong>{" "}
            {eventResolution.trace.slice(-3).map((item: any, index: number) => (
              <span key={`${item.step}-${index}`}>
                {index > 0 ? " • " : ""}
                {item.ok ? "OK" : "descartado"}: {item.lookup}
                {Array.isArray(item.returnedPlates) && item.returnedPlates.length > 0 ? ` → ${item.returnedPlates.join(", ")}` : ""}
              </span>
            ))}
          </div>
        )}

        {eventResolution?.resolvedBy && (
          <div className="info-note sga-resolution-note">
            Placa normalizada: <strong>{eventResolution.normalizedPlate || plate}</strong>
            {eventResolution.vehicleCode ? <> • veículo SGA <strong>{eventResolution.vehicleCode}</strong></> : null}
            {eventResolution.resolvedBy === "vehicle_code_exact" ? " • evento confirmado pelo código do veículo" : " • evento confirmado diretamente pela placa"}.
          </div>
        )}

        {eventResult && events.length === 0 && <div className="empty compact-empty">Nenhum evento localizado para esta placa.</div>}
        {events.length > 0 && (
          <div className="sga-event-list">
            {events.map((event: any, index: number) => (
              <div className="sga-event-card sga-event-card-v1398" key={`${event.codigo_evento || event.protocolo || index}`}>
                <div><Plate value={event.placa || plate} compact /><strong>{event.nome_associado || "Associado"}</strong></div>
                <span><small>Protocolo</small><strong>{event.protocolo || "—"}</strong></span>
                <span><small>Situação</small><strong>{event.situacao_evento || "—"}</strong></span>
                <span><small>Motivo</small><strong>{event.descricao_motivo || "—"}</strong></span>
                <span><small>Código evento</small><strong>{event.codigo_evento || "—"}</strong></span>
                <span><small>Código veículo</small><strong>{event.codigo_veiculo || "—"}</strong></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="info-note">
        O envio real do PDF é feito dentro do próprio agendamento. Antes do envio, o operador escolhe explicitamente o evento/protocolo encontrado pela placa e a classificação do documento.
      </div>
    </div>
  );
}
