import { PRAXIS_BUILD } from "./buildInfo";
import { normalizeTechnicalError, technicalDiagnosticText, type TechnicalErrorRecord } from "./reliability";
import { supabase } from "./supabase";

const STORAGE_KEY = "praxis-last-technical-error";
let lastError: TechnicalErrorRecord | null = null;

function currentPage(): string {
  if (typeof location === "undefined") return "desconhecida";
  return `${location.pathname}${location.hash}`.slice(0, 120);
}

function persistLocally(record: TechnicalErrorRecord): void {
  lastError = record;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* armazenamento indisponível */ }
}

async function persistRemotely(record: TechnicalErrorRecord): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("log_technical_error_v010", {
      error_code: record.code,
      error_message: record.message,
      error_stack: record.stack || "",
      component_stack: record.componentStack || "",
      page_name: record.page || "",
      error_source: record.source || "aplicação",
      app_version: record.buildVersion,
      build_commit: record.buildCommit,
      browser_info: record.userAgent || "",
      occurred_at_value: record.occurredAt,
    });
  } catch {
    // Falha no próprio registro técnico não deve causar um segundo erro na interface.
  }
}

export function reportTechnicalError(error: unknown, options: { source?: string; componentStack?: string | null; page?: string } = {}): TechnicalErrorRecord {
  const candidate = error instanceof Error ? error : new Error(String(error));
  const record = normalizeTechnicalError({
    message: candidate.message || "Erro inesperado",
    stack: candidate.stack,
    componentStack: options.componentStack,
    page: options.page || currentPage(),
    source: options.source || "aplicação",
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    buildVersion: PRAXIS_BUILD.version,
    buildCommit: PRAXIS_BUILD.commit,
  });
  persistLocally(record);
  void persistRemotely(record);
  return record;
}

export function getLastTechnicalError(): TechnicalErrorRecord | null {
  if (lastError) return lastError;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    lastError = raw ? JSON.parse(raw) as TechnicalErrorRecord : null;
  } catch { lastError = null; }
  return lastError;
}

export function copyTechnicalDiagnostic(record: TechnicalErrorRecord): Promise<void> {
  const text = technicalDiagnosticText(record);
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
  document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
  return Promise.resolve();
}

export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => { reportTechnicalError(event.error || event.message, { source: "window.error" }); };
  const onRejection = (event: PromiseRejectionEvent) => { reportTechnicalError(event.reason, { source: "unhandledrejection" }); };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
}
