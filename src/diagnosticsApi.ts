import { PRAXIS_BUILD } from "./buildInfo";
import { supabase } from "./supabase";

export const SUPABASE_FREE_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;

export interface TechnicalErrorEntry {
  id: number; code: string; message: string; page: string; source: string;
  version: string; commit: string; browser: string; occurredAt: string; createdAt: string;
}
export interface PerformanceMetricEntry {
  id: number; operation: string; page: string; durationMs: number; occurredAt: string; archivedAt: string | null;
}
export interface TechnicalSettings { slowOperationThresholdMs: number; performanceRetentionDays: number; }
export interface TechnicalTelemetryCleanupResult { deletedErrors: number; deletedPerformance: number; cutoffAt: string; }
export interface SystemDiagnostics {
  workspaceName: string; processes: number; movements: number; activeUsers: number;
  impreciseReceived: number; impreciseSent: number; technicalErrors: number;
  slowOperations: number; archivedSlowOperations: number; importBatches: number;
  databaseBytes: number; databasePretty: string; checkedAt: string;
}

function requireClient() { if (!supabase) throw new Error("Supabase não configurado."); return supabase; }

export async function getSystemDiagnostics(): Promise<SystemDiagnostics> {
  const client = requireClient();
  let response = await client.rpc("get_praxis_diagnostics_v0102");
  if (response.error && /does not exist|not found/i.test(response.error.message)) response = await client.rpc("get_praxis_diagnostics_v0101");
  if (response.error) throw response.error;
  const value = (response.data ?? {}) as Record<string, unknown>;
  return {
    workspaceName: String(value.workspace_name ?? "Práxis"),
    processes: Number(value.processes ?? 0), movements: Number(value.movements ?? 0), activeUsers: Number(value.active_users ?? 0),
    impreciseReceived: Number(value.imprecise_received ?? 0), impreciseSent: Number(value.imprecise_sent ?? 0),
    technicalErrors: Number(value.technical_errors ?? 0), slowOperations: Number(value.slow_operations ?? 0),
    archivedSlowOperations: Number(value.archived_slow_operations ?? 0), importBatches: Number(value.import_batches ?? 0),
    databaseBytes: Number(value.database_bytes ?? 0), databasePretty: String(value.database_pretty ?? "Não disponível"),
    checkedAt: String(value.checked_at ?? new Date().toISOString()),
  };
}

export async function listTechnicalErrors(limit = 100): Promise<TechnicalErrorEntry[]> {
  const { data, error } = await requireClient().rpc("list_technical_errors_v0101", { result_limit: limit });
  if (error) throw error;
  return (data ?? []).map((item: Record<string, unknown>) => ({
    id: Number(item.id), code: String(item.error_code ?? ""), message: String(item.error_message ?? ""),
    page: String(item.page_name ?? ""), source: String(item.error_source ?? ""), version: String(item.app_version ?? ""),
    commit: String(item.build_commit ?? ""), browser: String(item.browser_info ?? ""), occurredAt: String(item.occurred_at ?? ""), createdAt: String(item.created_at ?? ""),
  }));
}

export async function listPerformanceMetrics(limit = 100, includeArchived = false): Promise<PerformanceMetricEntry[]> {
  const client = requireClient();
  let response = await client.rpc("list_performance_metrics_v0102", { result_limit: limit, include_archived: includeArchived });
  if (response.error && /does not exist|not found/i.test(response.error.message)) response = await client.rpc("list_performance_metrics_v0101", { result_limit: limit });
  if (response.error) throw response.error;
  return (response.data ?? []).map((item: Record<string, unknown>) => ({
    id: Number(item.id), operation: String(item.operation_name ?? ""), page: String(item.page_name ?? ""),
    durationMs: Number(item.duration_ms ?? 0), occurredAt: String(item.occurred_at ?? ""), archivedAt: item.archived_at ? String(item.archived_at) : null,
  }));
}

export async function archivePerformanceMetrics(): Promise<number> {
  const { data, error } = await requireClient().rpc("archive_performance_metrics_v0102");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function cleanupTechnicalTelemetry(retentionDays = 15): Promise<TechnicalTelemetryCleanupResult> {
  const { data, error } = await requireClient().rpc("cleanup_technical_telemetry_v0108", { retention_days: retentionDays });
  if (error) throw error;
  const value = Array.isArray(data) ? (data[0] ?? {}) : (data ?? {});
  return {
    deletedErrors: Number((value as Record<string, unknown>).deleted_errors ?? 0),
    deletedPerformance: Number((value as Record<string, unknown>).deleted_performance ?? 0),
    cutoffAt: String((value as Record<string, unknown>).cutoff_at ?? ""),
  };
}

export async function getTechnicalSettings(): Promise<TechnicalSettings> {
  const { data, error } = await requireClient().rpc("get_technical_settings_v0102");
  if (error) return { slowOperationThresholdMs: 2000, performanceRetentionDays: 15 };
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    slowOperationThresholdMs: Number(value.slow_operation_threshold_ms ?? 2000),
    performanceRetentionDays: Number(value.performance_retention_days ?? 15),
  };
}

export async function saveTechnicalSettings(value: TechnicalSettings): Promise<void> {
  const { error } = await requireClient().rpc("save_technical_settings_v0102", {
    threshold_ms_value: value.slowOperationThresholdMs,
    retention_days_value: value.performanceRetentionDays,
  });
  if (error) throw error;
  try { localStorage.setItem("praxis-slow-threshold-ms", String(value.slowOperationThresholdMs)); } catch { /* preferência não persistente */ }
}

export function exportPerformanceText(items: PerformanceMetricEntry[], settings: TechnicalSettings): void {
  const generatedAt = new Date();
  const lines = [
    "PRÁXIS — RELATÓRIO DE OPERAÇÕES LENTAS",
    `Versão: ${PRAXIS_BUILD.version}`,
    `Compilação: ${PRAXIS_BUILD.commit}`,
    `Gerado em: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(generatedAt)}`,
    "",
    `Limite considerado: ${(settings.slowOperationThresholdMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} segundo(s)`,
    `Total de ocorrências exibidas: ${items.length}`,
    "",
    ...items.flatMap((item, index) => [
      `${index + 1}. ${item.operation}`,
      `Página: ${item.page || "Aplicação"}`,
      `Duração: ${(item.durationMs / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`,
      `Data: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.occurredAt))}`,
      item.archivedAt ? `Arquivado em: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.archivedAt))}` : "",
      "",
    ].filter(Boolean)),
    "Este relatório contém apenas métricas técnicas e não inclui conteúdo processual.",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `praxis-operacoes-lentas-${generatedAt.toISOString().slice(0, 10)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function databaseUsagePercentage(bytes: number): number { return bytes > 0 ? bytes / SUPABASE_FREE_DATABASE_LIMIT_BYTES * 100 : 0; }
export function diagnosticsText(value: SystemDiagnostics): string {
  const pct = databaseUsagePercentage(value.databaseBytes);
  return [
    `Práxis ${PRAXIS_BUILD.version}`,
    `Compilação: ${PRAXIS_BUILD.commit}`,
    `Espaço de trabalho: ${value.workspaceName}`,
    `Processos: ${value.processes}`,
    `Movimentações: ${value.movements}`,
    `Usuários ativos: ${value.activeUsers}`,
    `Entradas sem horário preciso: ${value.impreciseReceived}`,
    `Envios sem horário preciso: ${value.impreciseSent}`,
    `Erros técnicos registrados: ${value.technicalErrors}`,
    `Operações lentas visíveis: ${value.slowOperations}`,
    `Operações lentas arquivadas: ${value.archivedSlowOperations}`,
    `Lotes de importação: ${value.importBatches}`,
    `Banco: ${value.databasePretty} (${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da referência Free de 500 MB)`,
    `Verificado em: ${value.checkedAt}`,
  ].join("\n");
}
