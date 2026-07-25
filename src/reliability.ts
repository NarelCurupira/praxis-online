export interface TechnicalErrorInput {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  page?: string | null;
  source?: string | null;
  userAgent?: string | null;
  buildVersion: string;
  buildCommit: string;
  occurredAt?: string;
}

export interface TechnicalErrorRecord extends TechnicalErrorInput {
  code: string;
  occurredAt: string;
}

const SENSITIVE_PATTERNS = [
  /(?:bearer|authorization|apikey|token|password|senha|secret|cookie)\s*[:=]\s*[^\s,;]+/gi,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
];

export function sanitizeTechnicalText(value: unknown, maxLength = 4000): string {
  let text = String(value ?? "");
  for (const pattern of SENSITIVE_PATTERNS) text = text.replace(pattern, "[conteúdo protegido]");
  return text.slice(0, maxLength);
}

export function createErrorCode(date = new Date(), random = Math.random()): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const suffix = Math.floor(Math.max(0, Math.min(.999999, random)) * 1_000_000).toString().padStart(6, "0");
  return `PRAXIS-${stamp}-${suffix}`;
}

export function normalizeTechnicalError(input: TechnicalErrorInput, now = new Date(), random = Math.random()): TechnicalErrorRecord {
  return {
    ...input,
    code: createErrorCode(now, random),
    message: sanitizeTechnicalText(input.message, 1000),
    stack: sanitizeTechnicalText(input.stack, 6000),
    componentStack: sanitizeTechnicalText(input.componentStack, 6000),
    page: sanitizeTechnicalText(input.page, 120),
    source: sanitizeTechnicalText(input.source, 120),
    userAgent: sanitizeTechnicalText(input.userAgent, 500),
    occurredAt: input.occurredAt || now.toISOString(),
  };
}

export function technicalDiagnosticText(error: TechnicalErrorRecord): string {
  return [
    `Código: ${error.code}`,
    `Versão: ${error.buildVersion}`,
    `Compilação: ${error.buildCommit}`,
    `Página: ${error.page || "não identificada"}`,
    `Origem: ${error.source || "aplicação"}`,
    `Horário: ${error.occurredAt}`,
    `Navegador: ${error.userAgent || "não identificado"}`,
    `Mensagem: ${error.message}`,
    error.stack ? `Pilha técnica:\n${error.stack}` : "",
    error.componentStack ? `Árvore de componentes:\n${error.componentStack}` : "",
  ].filter(Boolean).join("\n");
}
