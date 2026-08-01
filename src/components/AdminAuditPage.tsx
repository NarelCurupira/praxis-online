import { useEffect, useMemo, useState } from "react";
import { Activity, Archive, ClipboardCopy, ClipboardList, Database, Download, Gauge, RefreshCw, Save, ShieldAlert, Trash2, Users } from "lucide-react";
import { listAdminAudit } from "../api";
import {
  archivePerformanceMetrics,
  cleanupTechnicalTelemetry,
  databaseUsagePercentage,
  diagnosticsText,
  exportPerformanceText,
  getSystemDiagnostics,
  getTechnicalSettings,
  listPerformanceMetrics,
  listTechnicalErrors,
  saveTechnicalSettings,
  type PerformanceMetricEntry,
  type SystemDiagnostics,
  type TechnicalErrorEntry,
  type TechnicalSettings,
} from "../diagnosticsApi";
import type { AdminAuditEntry } from "../types";
import { PRAXIS_BUILD, shortCommit } from "../buildInfo";

const labels: Record<string, string> = {
  invite_created: "Convite criado", member_updated: "Acesso alterado", member_profile_updated: "Usuário atualizado",
  member_email_updated: "E-mail alterado", member_password_reset_requested: "Redefinição de senha solicitada",
  backup_created: "Backup criado", backup_restored: "Backup restaurado", database_cleared: "Banco limpo",
  class_setting_changed: "Regra de prazo alterada", calendar_changed: "Calendário alterado",
  workspace_settings_changed: "Configurações alteradas", period_closed: "Período fechado", period_reopened: "Período reaberto",
  performance_metrics_archived: "Operações lentas arquivadas", technical_settings_changed: "Monitoramento técnico alterado",
  import_batch_completed: "Importação por lote concluída", import_batch_reverted: "Lote de importação desfeito",
  technical_telemetry_cleanup: "Telemetria técnica limpa",
};
type Tab = "audit" | "diagnostics" | "errors";
function fmt(value: string): string { try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value)); } catch { return value; } }
function bytes(value: number): string { if (!value) return "Não disponível"; const units = ["B", "KB", "MB", "GB"]; let size = value, index = 0; while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; } return `${size.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[index]}`; }
async function copy(value: string): Promise<void> { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value); const area = document.createElement("textarea"); area.value = value; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); }

export function AdminAuditPage() {
  const [tab, setTab] = useState<Tab>("audit");
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [errors, setErrors] = useState<TechnicalErrorEntry[]>([]);
  const [performanceItems, setPerformanceItems] = useState<PerformanceMetricEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [technicalSettings, setTechnicalSettings] = useState<TechnicalSettings>({ slowOperationThresholdMs: 2000, performanceRetentionDays: 15 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  async function load() {
    setLoading(true); setMessage("");
    try {
      const [nextAudit, nextDiagnostics, nextErrors, nextPerformance, nextSettings] = await Promise.all([
        listAdminAudit(), getSystemDiagnostics(), listTechnicalErrors(100), listPerformanceMetrics(500), getTechnicalSettings(),
      ]);
      setAudit(nextAudit); setDiagnostics(nextDiagnostics); setErrors(nextErrors); setPerformanceItems(nextPerformance); setTechnicalSettings(nextSettings);
    } catch (error) { setMessage(`Não foi possível carregar Auditoria e diagnóstico: ${String(error)}`); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const eventTypes = useMemo(() => [...new Set(audit.map((item) => item.eventType))].sort(), [audit]);
  const filteredAudit = useMemo(() => audit.filter((item) => {
    if (eventFilter !== "all" && item.eventType !== eventFilter) return false;
    const haystack = `${labels[item.eventType] || item.eventType} ${item.actorName} ${item.actorEmail} ${JSON.stringify(item.details)}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(query.trim().toLocaleLowerCase("pt-BR"));
  }), [audit, eventFilter, query]);
  const usage = databaseUsagePercentage(diagnostics?.databaseBytes ?? 0);

  async function copyDiagnostic() { if (!diagnostics) return; await copy(diagnosticsText(diagnostics)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  async function saveMonitoringSettings() {
    setLoading(true); setMessage("");
    try { await saveTechnicalSettings(technicalSettings); setMessage("Configurações de monitoramento salvas."); }
    catch (error) { setMessage(`Não foi possível salvar: ${String(error)}`); }
    finally { setLoading(false); }
  }
  async function archiveVisibleOperations() {
    setLoading(true); setMessage("");
    try {
      const archived = await archivePerformanceMetrics();
      setPerformanceItems([]);
      setDiagnostics((current) => current ? { ...current, slowOperations: 0, archivedSlowOperations: current.archivedSlowOperations + archived } : current);
      setMessage(`${archived} operação(ões) arquivada(s). Os registros permanecem no banco e apenas deixam de aparecer na lista atual.`);
      setShowArchiveConfirm(false);
    } catch (error) { setMessage(`Não foi possível arquivar: ${String(error)}`); }
    finally { setLoading(false); }
  }
  async function cleanupTechnicalData() {
    setLoading(true); setMessage("");
    try {
      const result = await cleanupTechnicalTelemetry(15);
      setShowCleanupConfirm(false);
      await load();
      setMessage(`${result.deletedErrors} erro(s) técnico(s) e ${result.deletedPerformance} métrica(s) de desempenho com mais de 15 dias foram excluídos.`);
    } catch (error) { setMessage(`Não foi possível limpar os dados técnicos: ${String(error)}`); }
    finally { setLoading(false); }
  }

  return <div className="page-stack audit-diagnostics-page">
    <div className="page-heading"><div><p className="eyebrow">Segurança administrativa</p><h1>Auditoria e diagnóstico</h1><p>Rastreabilidade funcional, integridade técnica e saúde do Práxis.</p></div><button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={17} />{loading ? "Atualizando..." : "Atualizar"}</button></div>
    <div className="admin-tabs" role="tablist"><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ClipboardList size={17} />Auditoria</button><button className={tab === "diagnostics" ? "active" : ""} onClick={() => setTab("diagnostics")}><Gauge size={17} />Diagnóstico</button><button className={tab === "errors" ? "active" : ""} onClick={() => setTab("errors")}><ShieldAlert size={17} />Logs técnicos</button></div>
    {message && <div className="info-box">{message}</div>}

    {tab === "audit" && <section className="panel audit-panel"><div className="panel-title"><div><h2>Eventos administrativos</h2><p>Operações sensíveis registradas no espaço de trabalho.</p></div><ClipboardList size={21} /></div><div className="audit-filters"><input placeholder="Pesquisar usuário, evento ou detalhe..." value={query} onChange={(event) => setQuery(event.target.value)} /><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="all">Todos os eventos</option>{eventTypes.map((type) => <option key={type} value={type}>{labels[type] || type}</option>)}</select></div>{loading ? <div className="empty-state">Carregando auditoria...</div> : <div className="audit-list">{filteredAudit.map((item) => <div className="audit-row" key={item.id}><div><strong>{labels[item.eventType] || item.eventType}</strong><small>{fmt(item.createdAt)}</small></div><div><strong>{item.actorName || item.actorEmail || "Sistema"}</strong><small>{item.actorEmail}</small></div><code title={JSON.stringify(item.details, null, 2)}>{JSON.stringify(item.details)}</code></div>)}{!filteredAudit.length && <div className="empty-state">Nenhum evento corresponde aos filtros.</div>}</div>}</section>}

    {tab === "diagnostics" && <>{diagnostics ? <>
      <section className="diagnostic-grid"><div className="panel diagnostic-card"><Database /><span>Banco de dados</span><strong>{diagnostics.databasePretty || bytes(diagnostics.databaseBytes)}</strong><small>{usage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da referência Free de 500 MB</small></div><div className="panel diagnostic-card"><ClipboardList /><span>Registros</span><strong>{diagnostics.processes} processos</strong><small>{diagnostics.movements} movimentações</small></div><div className="panel diagnostic-card"><Users /><span>Usuários ativos</span><strong>{diagnostics.activeUsers}</strong><small>{diagnostics.workspaceName}</small></div><div className="panel diagnostic-card"><ShieldAlert /><span>Precisão histórica</span><strong>{diagnostics.impreciseReceived + diagnostics.impreciseSent}</strong><small>campos de data sem horário preciso</small></div></section>
      <section className="panel"><div className="panel-title"><div><h2>Saúde do sistema</h2><p>Informações técnicas sem conteúdo processual sensível.</p></div><div className="button-row"><button className="button secondary" onClick={copyDiagnostic}><ClipboardCopy size={17} />{copied ? "Diagnóstico copiado" : "Copiar diagnóstico"}</button><button className="button secondary" onClick={() => setShowCleanupConfirm(true)} disabled={loading}><Trash2 size={17} />Limpar dados técnicos</button></div></div><dl className="diagnostic-list"><div><dt>Versão</dt><dd>{PRAXIS_BUILD.version}</dd></div><div><dt>Compilação</dt><dd>{shortCommit()}</dd></div><div><dt>Publicação</dt><dd>{fmt(PRAXIS_BUILD.publishedAt)}</dd></div><div><dt>Erros técnicos</dt><dd>{diagnostics.technicalErrors}</dd></div><div><dt>Operações lentas visíveis</dt><dd>{diagnostics.slowOperations}</dd></div><div><dt>Operações lentas arquivadas</dt><dd>{diagnostics.archivedSlowOperations}</dd></div><div><dt>Lotes de importação</dt><dd>{diagnostics.importBatches}</dd></div><div><dt>Última verificação</dt><dd>{fmt(diagnostics.checkedAt)}</dd></div></dl><div className="database-usage"><span style={{ width: `${Math.min(100, usage)}%` }} /><b>{usage < 70 ? "Uso confortável" : usage < 85 ? "Atenção ao crescimento" : usage < 95 ? "Uso elevado" : "Limite próximo"}</b></div></section>
      <section className="panel technical-settings-panel"><div className="panel-title"><div><h2>Monitoramento de desempenho</h2><p>Define o que será registrado e por quanto tempo ficará visível antes do arquivamento automático.</p></div><Save size={20} /></div><div className="technical-settings-grid"><label>Registrar como lenta após<select value={technicalSettings.slowOperationThresholdMs} onChange={(event) => setTechnicalSettings((current) => ({ ...current, slowOperationThresholdMs: Number(event.target.value) }))}><option value={1000}>1 segundo</option><option value={1500}>1,5 segundo</option><option value={2000}>2 segundos</option><option value={3000}>3 segundos</option><option value={5000}>5 segundos</option></select></label><label>Arquivar automaticamente após<select value={technicalSettings.performanceRetentionDays} onChange={(event) => setTechnicalSettings((current) => ({ ...current, performanceRetentionDays: Number(event.target.value) }))}><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option></select></label><button className="button primary" disabled={loading} onClick={saveMonitoringSettings}><Save size={17} />Salvar monitoramento</button></div></section>
      <section className="panel"><div className="panel-title performance-title"><div><h2>Operações lentas recentes</h2><p>O arquivamento não exclui dados: apenas retira os registros desta visualização.</p></div><div className="button-row"><button className="button secondary" disabled={!performanceItems.length} onClick={() => exportPerformanceText(performanceItems, technicalSettings)}><Download size={17} />Exportar TXT</button><button className="button secondary" disabled={!performanceItems.length} onClick={() => setShowArchiveConfirm(true)}><Archive size={17} />Arquivar</button></div></div><div className="performance-list">{performanceItems.map((item) => <div key={item.id}><strong>{item.operation}</strong><span>{item.page || "Aplicação"}</span><b>{(item.durationMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s</b><small>{fmt(item.occurredAt)}</small></div>)}{!performanceItems.length && <div className="empty-state">Nenhuma operação lenta visível. Os registros arquivados permanecem preservados no banco.</div>}</div></section>
    </> : <div className="empty-state">Diagnóstico indisponível.</div>}</>}

    {tab === "errors" && <section className="panel"><div className="panel-title"><div><h2>Erros técnicos recentes</h2><p>Mensagens sanitizadas, sem dados processuais, tokens ou senhas.</p></div><ShieldAlert size={21} /></div><div className="technical-error-list">{errors.map((item) => <details key={item.id}><summary><span><strong>{item.code}</strong><small>{item.page || item.source || "Aplicação"}</small></span><span><b>{item.version || "—"}</b><small>{fmt(item.occurredAt)}</small></span></summary><div><p>{item.message}</p><dl><div><dt>Origem</dt><dd>{item.source || "—"}</dd></div><div><dt>Compilação</dt><dd>{item.commit || "—"}</dd></div><div><dt>Navegador</dt><dd>{item.browser || "—"}</dd></div></dl></div></details>)}{!errors.length && <div className="empty-state">Nenhum erro técnico registrado.</div>}</div></section>}

    {showCleanupConfirm && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowCleanupConfirm(false)}><div className="confirm-dialog"><div className="modal-head"><div><p className="eyebrow">Retenção técnica</p><h2>Excluir dados técnicos antigos?</h2></div></div><div className="confirm-body"><p>Serão excluídos somente erros técnicos e métricas de desempenho criados há mais de 15 dias no espaço de trabalho atual.</p><p>A auditoria administrativa, o histórico dos processos e os dados funcionais não serão alterados.</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setShowCleanupConfirm(false)}>Cancelar</button><button className="button primary" disabled={loading} onClick={cleanupTechnicalData}><Trash2 size={17} />Excluir dados com mais de 15 dias</button></div></div></div>}

    {showArchiveConfirm && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowArchiveConfirm(false)}><div className="confirm-dialog"><div className="modal-head"><div><p className="eyebrow">Organização do diagnóstico</p><h2>Arquivar operações lentas?</h2></div></div><div className="confirm-body"><p>Os registros não serão excluídos do banco. Eles apenas deixarão de aparecer na lista atual e permanecerão contabilizados como arquivados.</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setShowArchiveConfirm(false)}>Cancelar</button><button className="button primary" disabled={loading} onClick={archiveVisibleOperations}><Archive size={17} />Arquivar registros visíveis</button></div></div></div>}
  </div>;
}
