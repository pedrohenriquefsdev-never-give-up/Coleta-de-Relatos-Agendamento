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
  const [error, setError] = useState("");
  const [plate, setPlate] = useState("");
  const [searching, setSearching] = useState(false);
  const [eventResult, setEventResult] = useState<any>(null);
  const [eventResolution, setEventResolution] = useState<any>(null);
  const [protocolDiagnostic, setProtocolDiagnostic] = useState<any>(null);
  const [protocolChecking, setProtocolChecking] = useState(false);
  const [protocolError, setProtocolError] = useState("");
  const [diagnosticProtocol, setDiagnosticProtocol] = useState("20265469");

  async function token() { return user?.getIdToken(); }

  async function testConnection() {
    setChecking(true);
    setError("");
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
      setError(e instanceof Error ? e.message : "Falha ao testar o SGA.");
    } finally {
      setChecking(false);
    }
  }

  async function runProtocolDiagnostic() {
    const protocol = diagnosticProtocol.trim();
    if (!protocol) return setProtocolError("Informe um protocolo para o diagnóstico.");
    setProtocolChecking(true);
    setProtocolError("");
    setProtocolDiagnostic(null);
    try {
      const t = await token();
      const params = new URLSearchParams({
        protocol,
        plate: plate.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        t: String(Date.now()),
      });
      const res = await fetch(`/api/sga/protocol-diagnostic?${params.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${data.error || "Falha no diagnóstico por protocolo."}${data.technical ? ` — ${data.technical}` : ""}`);
      setProtocolDiagnostic(data);
    } catch (e) {
      setProtocolError(e instanceof Error ? e.message : "Falha no diagnóstico por protocolo.");
    } finally {
      setProtocolChecking(false);
    }
  }

  async function searchPlate() {
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cleaned) return setError("Informe uma placa para consultar.");
    setSearching(true);
    setError("");
    setEventResult(null);
    setEventResolution(null);

    const mergeResolution = (previous: any, current: any, chunk: number) => {
      if (!previous) {
        return {
          ...current,
          searchChunks: chunk,
          developerDebug: current?.developerDebug ? {
            ...current.developerDebug,
            chunks: chunk,
          } : null,
        };
      }
      const previousDebug = previous?.developerDebug;
      const currentDebug = current?.developerDebug;
      return {
        ...previous,
        ...current,
        trace: [...(Array.isArray(previous?.trace) ? previous.trace : []), ...(Array.isArray(current?.trace) ? current.trace : [])].slice(-120),
        windowsSearched: Number(previous?.windowsSearched || 0) + Number(current?.windowsSearched || 0),
        searchChunks: chunk,
        developerDebug: previousDebug || currentDebug ? {
          ...(previousDebug || {}),
          ...(currentDebug || {}),
          pages: [...(Array.isArray(previousDebug?.pages) ? previousDebug.pages : []), ...(Array.isArray(currentDebug?.pages) ? currentDebug.pages : [])].slice(-120),
          attempts: [...(Array.isArray(previousDebug?.attempts) ? previousDebug.attempts : []), ...(Array.isArray(currentDebug?.attempts) ? currentDebug.attempts : [])].slice(-160),
          requestCount: Number(previousDebug?.requestCount || 0) + Number(currentDebug?.requestCount || 0),
          elapsedMs: Number(previousDebug?.elapsedMs || 0) + Number(currentDebug?.elapsedMs || 0),
          chunks: chunk,
        } : null,
      };
    };

    try {
      const t = await token();
      const referenceDate = localReferenceDate();
      let cursorEnd = "";
      let combinedResolution: any = null;

      // O usuário clica uma única vez. Se o histórico for antigo, o navegador
      // continua a busca em blocos curtos para não estourar o tempo da Vercel.
      for (let chunk = 1; chunk <= 40; chunk += 1) {
        const params = new URLSearchParams({
          plate: cleaned,
          referenceDate,
          t: String(Date.now()),
        });
        if (cursorEnd) params.set("cursorEnd", cursorEnd);

        const res = await fetch(`/api/sga/event?${params.toString()}`, {
          headers: { Authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        combinedResolution = mergeResolution(combinedResolution, data.resolution || null, chunk);
        setEventResolution(combinedResolution);

        if (!res.ok) {
          throw new Error(`${data.error || "Falha ao consultar o SGA."}${data.technical && data.technical !== data.error ? ` — ${data.technical}` : ""}`);
        }

        if (!data.pending) {
          setEventResult(data.data);
          return;
        }

        const nextCursor = String(data?.resolution?.nextCursorDate || "").trim();
        if (!nextCursor || nextCursor === cursorEnd) {
          throw new Error("A busca histórica foi interrompida porque o SGA não informou um próximo período válido.");
        }
        cursorEnd = nextCursor;
      }

      throw new Error("A busca histórica atingiu o limite de segurança do Portal. Consulte o diagnóstico técnico.");
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
              <span className={diagnostic.checks?.generalEvents?.ok ? "ok" : "fail"}>Evento / listar (1): {diagnostic.checks?.generalEvents?.ok ? "OK" : diagnostic.checks?.generalEvents?.error || "Falhou"}</span>
              <span className={diagnostic.checks?.generalEvents100?.ok ? "ok" : "fail"}>Evento / listar (100): {diagnostic.checks?.generalEvents100?.ok ? "OK" : diagnostic.checks?.generalEvents100?.error || "Falhou"}</span>
            </div>

            {!diagnostic.checks?.photoTypes?.ok && (
              <div className="info-note sga-permission-note">
                Para anexar o PDF ao Evento, habilite também no token a permissão <strong>Vistoria → listar tipo foto</strong>. O SGA exige o código da classificação no upload do documento.
              </div>
            )}

            {!diagnostic.checks?.generalEvents?.ok && (
              <div className="info-note sga-permission-note">
                A credencial autenticou, mas até a chamada mínima do endpoint geral falhou. Confira no SGA a permissão <strong>Evento → Listar</strong> e o retorno técnico do provedor.
              </div>
            )}
            {diagnostic.checks?.generalEvents?.ok && !diagnostic.checks?.generalEvents100?.ok && (
              <div className="info-note sga-permission-note">
                O endpoint <strong>Evento → Listar</strong> aceita a chamada mínima, mas recusou 100 registros. A busca por placa reduzirá automaticamente o tamanho da página e a janela até encontrar uma combinação aceita pelo SGA.
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

        {developer && (
          <div className="sga-debug-panel" style={{ marginTop: 12 }}>
            <div className="sga-debug-structure">
              <strong>Diagnóstico direto V1.39.19 — protocolo conhecido</strong>
              <span>Teste temporário exclusivo do Desenvolvedor. Ele não muda o fluxo do operador: serve apenas para verificar se a API consegue enxergar diretamente o evento de teste pelo protocolo.</span>
              <div className="sga-search-row">
                <input
                  className="input"
                  value={diagnosticProtocol}
                  onChange={(e) => setDiagnosticProtocol(e.target.value.replace(/[^0-9]/g, "").slice(0, 20))}
                  placeholder="Protocolo do evento"
                />
                <button className="btn" onClick={runProtocolDiagnostic} disabled={protocolChecking}>
                  <Search size={15} /> {protocolChecking ? "Testando..." : "Testar protocolo"}
                </button>
              </div>
              <small>Placa usada na validação: <b>{plate || "nenhuma informada"}</b>. Para o teste atual, deixe <b>GPV0000</b> no campo de placa acima.</small>
              {protocolError && <div className="error">{protocolError}</div>}
              {protocolDiagnostic && (
                <>
                  <div className="sga-debug-summary">
                    <span>Protocolo visível <strong>{protocolDiagnostic.protocolVisible ? "SIM" : "NÃO"}</strong></span>
                    <span>Placa exata visível <strong>{protocolDiagnostic.exactPlateVisible ? "SIM" : "NÃO"}</strong></span>
                    <span>Registros retornados <strong>{protocolDiagnostic.rawCount ?? 0}</strong></span>
                    <span>Correspondências do protocolo <strong>{protocolDiagnostic.protocolMatchCount ?? 0}</strong></span>
                  </div>
                  {Array.isArray(protocolDiagnostic.events) && protocolDiagnostic.events.length > 0 ? protocolDiagnostic.events.map((item: any, index: number) => (
                    <span key={`protocol-${item.codigo_evento || index}`}>
                      <b>Evento:</b> {item.codigo_evento || "—"} • <b>Protocolo:</b> {item.protocolo || "—"} • <b>Placa:</b> {item.placa || "—"} • <b>Veículo:</b> {item.codigo_veiculo || "—"} • <b>Situação:</b> {item.situacao_evento || "—"} • <b>Motivo:</b> {item.motivo || "—"} • <b>Cooperativa:</b> {item.cooperativa?.nome || item.cooperativa?.codigo || "—"} • <b>Regional:</b> {item.regional?.nome || item.regional?.codigo || "—"}
                    </span>
                  )) : <span><b>Resultado:</b> o SGA respondeu, mas não devolveu o protocolo informado para este usuário/token da API.</span>}
                </>
              )}
            </div>
          </div>
        )}

        {error && Array.isArray(eventResolution?.trace) && eventResolution.trace.length > 0 && (
          <div className="info-note sga-resolution-note">
            <strong>Validação estrita:</strong>{" "}
            {eventResolution.trace.slice(-3).map((item: any, index: number) => (
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

        {eventResolution?.failure && (
          <div className="info-note sga-resolution-note">
            <strong>Falha técnica capturada:</strong> {eventResolution.failure.stage || "etapa não identificada"}
            {eventResolution.failure.endpoint ? ` • ${eventResolution.failure.endpoint}` : ""}
            {eventResolution.failure.status ? ` • HTTP ${eventResolution.failure.status}` : ""}
            {eventResolution.failure.message ? ` • ${eventResolution.failure.message}` : ""}
          </div>
        )}

        {eventResolution?.developerDebug && (
          <details className="sga-debug-panel" open>
            <summary>Diagnóstico técnico V1.39.19 — somente Desenvolvedor</summary>
            <div className="sga-debug-summary">
              <span>Placa alvo <strong>{eventResolution.developerDebug.targetPlate || plate}</strong></span>
              <span>Veículo alvo <strong>{eventResolution.developerDebug.targetVehicleCode || "—"}</strong></span>
              <span>Página efetiva <strong>{eventResolution.developerDebug.effectivePageSize || "—"}</strong></span>
              <span>Janela efetiva <strong>{eventResolution.developerDebug.effectiveWindowDays ? `${eventResolution.developerDebug.effectiveWindowDays} dia(s)` : "—"}</strong></span>
              <span>Páginas capturadas <strong>{Array.isArray(eventResolution.developerDebug.pages) ? eventResolution.developerDebug.pages.length : 0}</strong></span>
              <span>Falhas capturadas <strong>{Array.isArray(eventResolution.developerDebug.attempts) ? eventResolution.developerDebug.attempts.filter((item: any) => !item.ok).length : 0}</strong></span>
              <span>Blocos automáticos <strong>{eventResolution.developerDebug.chunks || eventResolution.searchChunks || 1}</strong></span>
              <span>Chamadas SGA <strong>{eventResolution.developerDebug.requestCount || 0}</strong></span>
              <span>Tempo acumulado <strong>{eventResolution.developerDebug.elapsedMs ? `${(eventResolution.developerDebug.elapsedMs / 1000).toFixed(1)}s` : "—"}</strong></span>
              <span>Última parada <strong>{eventResolution.developerDebug.stoppedReason || "—"}</strong></span>
            </div>

            {Array.isArray(eventResolution.developerDebug.attempts) && eventResolution.developerDebug.attempts.some((item: any) => !item.ok) && (
              <div className="sga-debug-table-wrap">
                <table className="sga-debug-table">
                  <thead><tr><th>Tentativa recusada</th><th>Janela</th><th>Pág.</th><th>Registros</th><th>HTTP</th><th>Mensagem SGA</th></tr></thead>
                  <tbody>
                    {eventResolution.developerDebug.attempts.filter((item: any) => !item.ok).slice(0, 30).map((item: any, index: number) => (
                      <tr key={`attempt-${item.window}-${item.pageSize}-${item.page}-${index}`}>
                        <td>{item.windowDays} dia(s)</td>
                        <td>{item.window}</td>
                        <td>{item.page}</td>
                        <td>{item.pageSize}</td>
                        <td>{item.status || "—"}</td>
                        <td>{item.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="sga-debug-table-wrap">
              <table className="sga-debug-table">
                <thead>
                  <tr><th>Janela</th><th>Dias</th><th>Registros</th><th>Pág.</th><th>Retorno</th><th>Placa conhecida</th><th>Qualquer campo placa</th><th>Cód. veículo</th><th>Formato</th></tr>
                </thead>
                <tbody>
                  {(Array.isArray(eventResolution.developerDebug.pages) ? eventResolution.developerDebug.pages : []).slice(0, 40).map((item: any, index: number) => (
                    <tr key={`${item.window}-${item.page}-${item.pageSize}-${index}`} className={item.anyPlateFieldExactMatches > 0 || item.exactVehicleCodeMatches > 0 ? "debug-hit" : ""}>
                      <td>{item.window}</td>
                      <td>{item.windowDays}</td>
                      <td>{item.pageSize}</td>
                      <td>{item.page}</td>
                      <td>{item.rawCount}</td>
                      <td>{item.knownExactPlateMatches}</td>
                      <td>{item.anyPlateFieldExactMatches}</td>
                      <td>{item.exactVehicleCodeMatches}</td>
                      <td>{item.responseShape}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const pages = Array.isArray(eventResolution.developerDebug.pages) ? eventResolution.developerDebug.pages : [];
              const structure = pages.find((item: any) => item.anyPlateFieldExactMatches > 0 || item.exactVehicleCodeMatches > 0) || pages.find((item: any) => item.rawCount > 0) || pages[0];
              if (!structure) {
                const failed = Array.isArray(eventResolution.developerDebug.attempts) ? eventResolution.developerDebug.attempts.filter((item: any) => !item.ok) : [];
                const last = failed.at(-1);
                return <div className="sga-debug-structure">Nenhuma página foi aceita pelo SGA.{last ? <> Último retorno: {last.status ? `HTTP ${last.status} — ` : ""}{last.message}</> : null}</div>;
              }
              return (
                <div className="sga-debug-structure">
                  <strong>Estrutura observada em {structure.window} / página {structure.page} / {structure.pageSize} registros</strong>
                  <span><b>Chaves do evento:</b> {Array.isArray(structure.eventKeys) && structure.eventKeys.length ? structure.eventKeys.join(", ") : "—"}</span>
                  <span><b>Chaves de veiculo:</b> {Array.isArray(structure.vehicleKeys) && structure.vehicleKeys.length ? structure.vehicleKeys.join(", ") : "—"}</span>
                  <span><b>Caminhos contendo placa:</b> {Array.isArray(structure.detectedPlatePaths) && structure.detectedPlatePaths.length ? structure.detectedPlatePaths.join(", ") : "nenhum"}</span>
                  <span><b>Amostras de placas:</b> {Array.isArray(structure.returnedPlateSamples) && structure.returnedPlateSamples.length ? structure.returnedPlateSamples.join(", ") : "nenhuma"}</span>
                  <span><b>Códigos de veículo observados:</b> {Array.isArray(structure.vehicleCodeSamples) && structure.vehicleCodeSamples.length ? structure.vehicleCodeSamples.join(", ") : "nenhum"}</span>
                  {structure.pagination ? <span><b>Paginação informada pelo SGA:</b> total {structure.pagination.total ?? "—"}, páginas {structure.pagination.numberPages ?? "—"}, página atual {structure.pagination.currentPage ?? "—"}, mostrando {structure.pagination.showing ?? "—"}</span> : <span><b>Paginação informada pelo SGA:</b> não veio no retorno.</span>}
                </div>
              );
            })()}
            {eventResolution.developerDebug.capped && <small>O diagnóstico foi limitado para evitar resposta excessiva do servidor.</small>}
          </details>
        )}

        {events.length > 0 && eventResolution?.resolvedBy && (
          <div className="info-note sga-resolution-note">
            Placa normalizada: <strong>{eventResolution.normalizedPlate || plate}</strong>
            {eventResolution.vehicleCode ? <> • veículo SGA <strong>{eventResolution.vehicleCode}</strong></> : null}
            {eventResolution.referenceDate ? <> • referência <strong>{eventResolution.referenceDate.split("-").reverse().join("/")}</strong></> : null}
            {eventResolution.vehicleContractDate ? <> • contrato <strong>{eventResolution.vehicleContractDate.split("-").reverse().join("/")}</strong></> : null}
            {eventResolution.windowsSearched ? <> • <strong>{eventResolution.windowsSearched}</strong> janela(s) pesquisada(s)</> : null}
            {eventResolution.resolvedBy === "vehicle_code_exact"
              ? " • evento confirmado pelo código do veículo"
              : eventResolution.resolvedBy === "event_list_exact_plate"
                ? " • evento localizado automaticamente na listagem geral do SGA"
                : eventResolution.resolvedBy === "plate_exact_legacy_mask"
                  ? ` • evento confirmado diretamente pela placa no formato ${eventResolution.directPlateLookup || "ABC-1234"}`
                  : " • evento confirmado diretamente pela placa"}.
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
