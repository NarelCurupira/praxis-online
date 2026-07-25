import { PRAXIS_BUILD } from "./buildInfo";
import { supabase } from "./supabase";

export const SUPABASE_FREE_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;

export interface TechnicalErrorEntry {
  id: number; code: string; message: string; page: string; source: string;
  version: string; commit: string; browser: string; occurredAt: string; createdAt: string;
}
export interface PerformanceMetricEntry { id: number; operation: string; page: string; durationMs: number; occurredAt: string; }
export interface SystemDiagnostics {
  workspaceName: string; processes: number; movements: number; activeUsers: number;
  impreciseReceived: number; impreciseSent: number; technicalErrors: number;
  slowOperations: number; databaseBytes: number; databasePretty: string; checkedAt: string;
}

function requireClient() { if (!supabase) throw new Error("Supabase não configurado."); return supabase; }

export async function getSystemDiagnostics(): Promise<SystemDiagnostics> {
  const { data, error } = await requireClient().rpc("get_praxis_diagnostics_v0101");
  if (error) throw error;
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    workspaceName: String(value.workspace_name ?? "Práxis"),
    processes: Number(value.processes ?? 0), movements: Number(value.movements ?? 0), activeUsers: Number(value.active_users ?? 0),
    impreciseReceived: Number(value.imprecise_received ?? 0), impreciseSent: Number(value.imprecise_sent ?? 0),
    technicalErrors: Number(value.technical_errors ?? 0), slowOperations: Number(value.slow_operations ?? 0),
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

export async function listPerformanceMetrics(limit = 100): Promise<PerformanceMetricEntry[]> {
  const { data, error } = await requireClient().rpc("list_performance_metrics_v0101", { result_limit: limit });
  if (error) throw error;
  return (data ?? []).map((item: Record<string, unknown>) => ({ id:Number(item.id), operation:String(item.operation_name ?? ""), page:String(item.page_name ?? ""), durationMs:Number(item.duration_ms ?? 0), occurredAt:String(item.occurred_at ?? "") }));
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
    `Operações lentas registradas: ${value.slowOperations}`,
    `Banco: ${value.databasePretty} (${pct.toLocaleString("pt-BR",{maximumFractionDigits:1})}% da referência Free de 500 MB)`,
    `Verificado em: ${value.checkedAt}`,
  ].join("\n");
}
