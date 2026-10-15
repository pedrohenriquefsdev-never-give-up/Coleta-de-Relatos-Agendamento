"use client";

import { Database, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { useSession } from "./AuthGate";
import { isPortalDeveloperUid } from "@/lib/access-control";
import Plate from "./Plate";

function localReferenceDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

export default function SGAPage() {
  const { user } = useSession();
  const developer = isPortalDeveloperUid(user?.uid);

  const [checking, setChecking] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [connectionError, setConnectionError] = useState("");

  const [plate, setPlate] = useState("");
  const [searching, setSearching] = useState(false);
  const [eventResult, setEventResult] = useState<any>(null);
  const [eventResolution, setEventResolution] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  const [directDiagnostic, setDirectDiagnostic] = useState<any>(null);
  const [directChecking, setDirectChecking] = useState(false);
  const [directError, setDirectError] = useState("");

  async function token() {
    return user?.getIdToken();
  }

  async function testConnection() {
    setChecking(true);
    setConnectionError("");
    setDiagnostic(null);
    try {
      const t = await token();
      const res = await fetch(`/api/sga/diagnostics?referenceDate=${encodeURIComponent(localReferenceDate())}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${data.error || "Falha ao testar o SGA."}${data.technical ? ` — ${data.technical}` : ""}`);
      setDiagnostic(data);
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : "Falha ao testar o SGA.");
    } finally {
      setChecking(false);
    }
  }

  async function searchPlate() {
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cleaned) return setSearchError("Informe uma placa para consultar.");

    setSearching(true);
    setSearchError("");
    setEventResult(null);
    setEventResolution(null);

    try {
      const t = await token();
      const params = new URLSearchParams({ plate: cleaned, t: String(Date.now()) });
      const res = await fetch(`/api/sga/event?${params.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      setEventResolution(data.resolution || null);
      if (!res.ok) throw new Error(`${data.error || "Falha ao consultar o SGA."}${data.technical && data.technical !== data.error ? ` — ${data.technical}` : ""}`);
      setEventResult(data.data);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Falha ao consultar o SGA.");
    } finally {
      setSearching(false);
    }
  }

  async function runDirectDiagnostic() {
    const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalizedPlate) return setDirectError("Informe a placa no campo acima para executar o diagnóstico.");

    setDirectChecking(true);
    setDirectError("");
    setDirectDiagnostic(null);
    try {
      const t = await token();
      const params = new URLSearchParams({ plate: normalizedPlate, t: String(Date.now()) });
      const res = await fetch(`/api/sga/direct-diagnostic?${params.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${data.error || "Falha no diagnóstico direto do SGA."}${data.technical ? ` — ${data.technical}` : ""}`);
      setDirectDiagnostic(data);
    } catch (e) {
      setDirectError(e instanceof Error ? e.message : "Falha no diagnóstico direto do SGA.");
    } finally {
      setDirectChecking(false);
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

        {connectionError && <div className="error">{connectionError}</div>}

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
              <span className={diagnostic.checks?.generalEvents?.ok ? "ok" : "fail"}>Evento / listar (teste mínimo): {diagnostic.checks?.generalEvents?.ok ? "OK" : diagnostic.checks?.generalEvents?.error || "Falhou"}</span>
            </div>

            {!diagnostic.checks?.photoTypes?.ok && (
              <div className="info-note sga-permission-note">
                Para anexar o PDF ao Evento, habilite também no token a permissão <strong>Vistoria → listar tipo foto</strong>. O SGA exige o código da classificação no upload do documento.
              </div>
            )}

            {!diagnostic.checks?.generalEvents?.ok && (
              <div className="info-note sga-permission-note">
                A credencial autenticou, mas a chamada mínima de <strong>Evento → Listar</strong> falhou. Isso pode indicar instabilidade do SGA ou indisponibilidade temporária desse endpoint.
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
          <div>
            <h2>Consulta de evento por placa</h2>
            <small>Fluxo direto: placa → veículo → código interno → eventos do veículo.</small>
          </div>
        </div>

        <div className="sga-search-row">
          <input
            className="input"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))}
            placeholder="ABC1D23"
          />
          <button className="btn" onClick={searchPlate} disabled={searching}>
            <Search size={15} /> {searching ? "Consultando..." : "Consultar SGA"}
          </button>
        </div>
        <small className="field-help">Não é necessário informar data ou protocolo. O Portal localiza o veículo pela placa, consulta o código interno e valida novamente a placa dos eventos retornados.</small>

        {searchError && <div className="error" style={{ marginTop: 10 }}>{searchError}</div>}

        {eventResolution?.trace && Array.isArray(eventResolution.trace) && eventResolution.trace.length > 0 && (searchError || developer) && (
          <div className="info-note sga-resolution-note">
            <strong>Validação:</strong>{" "}
            {eventResolution.trace.slice(-4).map((item: any, index: number) => (
              <span key={`${item.step}-${index}`}>
                {index > 0 ? " • " : ""}
                {item.ok ? "OK" : "descartado"}: {item.lookup}
                {item.status ? ` (HTTP ${item.status})` : ""}
                {item.message ? ` — ${item.message}` : ""}
                {Array.isArray(item.returnedPlates) && item.returnedPlates.length > 0 ? ` → ${item.returnedPlates.join(", ")}` : ""}
              </span>
            ))}
          </div>
        )}

        {eventResolution?.failure && developer && (
          <div className="info-note sga-resolution-note">
            <strong>Falha técnica:</strong> {eventResolution.failure.stage || "etapa não identificada"}
            {eventResolution.failure.endpoint ? ` • ${eventResolution.failure.endpoint}` : ""}
            {eventResolution.failure.status ? ` • HTTP ${eventResolution.failure.status}` : ""}
            {eventResolution.failure.message ? ` • ${eventResolution.failure.message}` : ""}
          </div>
        )}

        {events.length > 0 && eventResolution?.resolvedBy && (
          <div className="info-note sga-resolution-note">
            Placa <strong>{eventResolution.normalizedPlate || plate}</strong>
            {eventResolution.vehicleCode ? <> • veículo SGA <strong>{eventResolution.vehicleCode}</strong></> : null}
            {eventResolution.resolvedBy === "vehicle_code_exact"
              ? " • evento confirmado pelo código interno do veículo."
              : " • evento confirmado diretamente pela placa."}
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

        {developer && (
          <details className="sga-debug-panel" style={{ marginTop: 12 }}>
            <summary>Diagnóstico direto V1.39.22 — fluxo real</summary>
            <div className="sga-debug-structure">
              <span>Teste curto, sem data e sem varredura histórica. Executa somente as chamadas diretas usadas para validar uma placa normal do sistema.</span>
              <div className="sga-search-row">
                <button className="btn" onClick={runDirectDiagnostic} disabled={directChecking}>
                  <Search size={15} /> {directChecking ? "Testando endpoints..." : "Executar diagnóstico direto"}
                </button>
              </div>
              <small>Placa usada no diagnóstico: <b>{plate || "não informada"}</b>.</small>

              {directError && <div className="error">{directError}</div>}

              {directDiagnostic && (
                <>
                  <div className="sga-debug-summary">
                    <span>Veículo busca comum <strong>{directDiagnostic.vehicleVisibleCommon ? "VISÍVEL" : "NÃO"}</strong></span>
                    <span>Veículo por permissão <strong>{directDiagnostic.vehicleVisibleByPermission ? "VISÍVEL" : "NÃO"}</strong></span>
                    <span>Código veículo <strong>{directDiagnostic.targetVehicleCode || "—"}</strong></span>
                    <span>Evento encontrado <strong>{directDiagnostic.eventVisibleAnywhere ? "SIM" : "NÃO"}</strong></span>
                  </div>

                  <div className="sga-debug-structure" style={{ marginTop: 8 }}>
                    <strong>Chamadas executadas</strong>
                    {(Array.isArray(directDiagnostic.tests) ? directDiagnostic.tests : []).map((test: any, index: number) => (
                      <span key={`direct-test-${test.id || index}`}>
                        <b>{index + 1}. {test.label || test.id}</b> • {test.method} {test.path} • {test.accepted ? "ACEITA" : "REJEITADA"}
                        {test.status ? ` • HTTP ${test.status}` : ""}
                        {test.responseShape ? ` • Retorno: ${test.responseShape}` : ""}
                        {` • Registros: ${test.rawCount ?? 0}`}
                        {` • Placa exata: ${test.exactPlateCount ?? 0}`}
                        {typeof test.exactVehicleCodeCount === "number" ? ` • Cód. veículo alvo: ${test.exactVehicleCodeCount}` : ""}
                        {test.message ? ` • ${test.message}` : ""}
                        {Array.isArray(test.returnedPlateSamples) && test.returnedPlateSamples.length ? ` • Placas retornadas: ${test.returnedPlateSamples.join(", ")}` : ""}
                        {Array.isArray(test.returnedVehicleCodeSamples) && test.returnedVehicleCodeSamples.length ? ` • Códigos retornados: ${test.returnedVehicleCodeSamples.join(", ")}` : ""}
                      </span>
                    ))}
                  </div>

                  {(Array.isArray(directDiagnostic.tests) ? directDiagnostic.tests : []).some((test: any) => Array.isArray(test.vehicles) && test.vehicles.length > 0) && (
                    <div className="sga-debug-table-wrap" style={{ marginTop: 8 }}>
                      <table className="sga-debug-table">
                        <thead><tr><th>Teste de veículo</th><th>Código</th><th>Placa</th><th>Regional</th><th>Cooperativa</th><th>Situação</th></tr></thead>
                        <tbody>
                          {(Array.isArray(directDiagnostic.tests) ? directDiagnostic.tests : []).flatMap((test: any) =>
                            (Array.isArray(test.vehicles) ? test.vehicles : []).map((item: any, index: number) => (
                              <tr key={`vehicle-row-${test.id}-${index}`}>
                                <td>{test.label}</td><td>{item.codigo_veiculo || "—"}</td><td>{item.placa || "—"}</td><td>{item.codigo_regional || "—"}</td><td>{item.codigo_cooperativa || "—"}</td><td>{item.situacao || "—"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(Array.isArray(directDiagnostic.tests) ? directDiagnostic.tests : []).some((test: any) => Array.isArray(test.events) && test.events.length > 0) && (
                    <div className="sga-debug-table-wrap" style={{ marginTop: 8 }}>
                      <table className="sga-debug-table">
                        <thead><tr><th>Teste de evento</th><th>Evento</th><th>Protocolo</th><th>Veículo</th><th>Placa</th><th>Situação</th><th>Cadastro</th><th>Regional</th><th>Cooperativa</th></tr></thead>
                        <tbody>
                          {(Array.isArray(directDiagnostic.tests) ? directDiagnostic.tests : []).flatMap((test: any) =>
                            (Array.isArray(test.events) ? test.events : []).map((item: any, index: number) => (
                              <tr key={`event-row-${test.id}-${item.codigo_evento || index}-${index}`} className={item.placa && item.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") === directDiagnostic.targetPlate ? "debug-hit" : ""}>
                                <td>{test.label}</td><td>{item.codigo_evento || "—"}</td><td>{item.protocolo || "—"}</td><td>{item.codigo_veiculo || "—"}</td><td>{item.placa || "—"}</td><td>{item.situacao_evento || "—"}</td><td>{item.data_cadastro || "—"}</td><td>{item.regional || "—"}</td><td>{item.cooperativa || "—"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <span><b>Conclusão automática:</b> {directDiagnostic.eventVisibleAnywhere
                    ? `a placa ${directDiagnostic.targetPlate} apareceu em pelo menos uma chamada direta (${(directDiagnostic.eventVisibleIn || []).join("; ")}).`
                    : `nenhuma chamada direta devolveu evento com a placa exata ${directDiagnostic.targetPlate}.`}</span>
                </>
              )}
            </div>
          </details>
        )}
      </div>

      <div className="info-note">
        O envio real do PDF é feito dentro do próprio agendamento. O Portal localiza os eventos pela placa e pelo código interno do veículo; antes do envio, o operador escolhe o evento/protocolo e a classificação do documento.
      </div>
    </div>
  );
}
