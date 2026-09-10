import { PRAXIS_BUILD } from "./buildInfo";
import { supabase } from "./supabase";

const MIN_CLIENT_MONITORED_MS = 500;
function pageName(): string { return typeof location === "undefined" ? "aplicação" : `${location.pathname}${location.hash}`.slice(0, 120); }

async function logSlowOperation(operation: string, durationMs: number): Promise<void> {
  if (!supabase || durationMs < MIN_CLIENT_MONITORED_MS) return;
  try {
    await supabase.rpc("log_performance_metric_v0102", {
      operation_name_value: operation.slice(0, 120), page_name_value: pageName(), duration_ms_value: Math.round(durationMs),
      app_version_value: PRAXIS_BUILD.version, build_commit_value: PRAXIS_BUILD.commit,
    });
  } catch { /* o monitoramento nunca deve interromper a aplicação */ }
}

type AsyncOperationName<T> = string | ((result: T) => string);

function schedulePostRenderMetric(operation: string, startedAt: number): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    const finished = typeof performance === "undefined" ? Date.now() : performance.now();
    void logSlowOperation(`${operation}.render`, finished - startedAt);
  });
}

export async function measureAsync<T>(operation: AsyncOperationName<T>, task: () => Promise<T>): Promise<T> {
  const started = typeof performance === "undefined" ? Date.now() : performance.now();
  let completed = false;
  let result: T | undefined;
  try {
    result = await task();
    completed = true;
    return result;
  } finally {
    const finished = typeof performance === "undefined" ? Date.now() : performance.now();
    const operationName = typeof operation === "function" && completed
      ? operation(result as T)
      : typeof operation === "string" ? operation : "operation.failed";
    const duration = finished - started;
    void logSlowOperation(operationName, duration);

    // 0.11.3-RC hardening:
    // a mudança de status já mede o caminho servidor/API como "movements.status".
    // Também registra explicitamente esse tempo como ".server" e mede o tempo
    // entre a conclusão da requisição e o próximo paint, que engloba a
    // atualização síncrona do estado local + render subsequente.
    // Não existe reload/fetch posterior no handler atual de status.
    if (operationName === "movements.status") {
      void logSlowOperation("movements.status.server", duration);
      schedulePostRenderMetric("movements.status", finished);
    }
  }
}

export function measureAsyncResult<T>(task: () => Promise<T>, operation: (result: NoInfer<T>) => string): Promise<T> {
  return measureAsync<T>(operation, task);
}

export function measureSync<T>(operation: string, task: () => T): T {
  const started = typeof performance === "undefined" ? Date.now() : performance.now();
  try { return task(); }
  finally {
    const finished = typeof performance === "undefined" ? Date.now() : performance.now();
    void logSlowOperation(operation, finished - started);
  }
}
