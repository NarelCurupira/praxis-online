import { localDatePart } from "./date";
import type { ProcessMovement } from "./types";

export type QualitySeverity = "Crítico" | "Atenção" | "Cadastro";

export interface QualityIssue {
  id: string;
  severity: QualitySeverity;
  category: string;
  description: string;
  record: ProcessMovement;
}

const cnjPattern = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

function storedDatePart(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

/**
 * Registros sem horário preciso representam uma data civil, não um instante
 * exato. Nesses casos, deve-se preservar a data gravada no timestamp em vez
 * de convertê-la para America/Belem, pois timestamps históricos à meia-noite
 * UTC podem aparecer artificialmente como 21h do dia anterior.
 */
function semanticDatePart(
  value: string | null | undefined,
  timePrecise: boolean | null | undefined,
): string {
  if (!value) return "";
  return timePrecise === false
    ? storedDatePart(value)
    : localDatePart(value);
}

function isValidTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function sentBeforeReceived(record: ProcessMovement): boolean {
  if (!record.sentAt || !isValidTimestamp(record.receivedAt) || !isValidTimestamp(record.sentAt)) {
    return false;
  }

  const receivedPrecise = record.receivedTimePrecise === true;
  const sentPrecise = record.sentTimePrecise === true;

  // Somente horários confirmados dos dois lados permitem comparar instantes.
  if (receivedPrecise && sentPrecise) {
    return new Date(record.sentAt).getTime() < new Date(record.receivedAt).getTime();
  }

  // Com pelo menos um horário impreciso, compara-se apenas a data civil.
  const receivedDate = semanticDatePart(record.receivedAt, record.receivedTimePrecise);
  const sentDate = semanticDatePart(record.sentAt, record.sentTimePrecise);
  return Boolean(receivedDate && sentDate && sentDate < receivedDate);
}

/**
 * Fonte única das verificações de qualidade usadas pela tela e pelos relatórios.
 * Um prazo vazio significa "sem prazo aplicável" e não é uma inconsistência.
 */
export function inspectDataQuality(records: ProcessMovement[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const cases = new Map<number, ProcessMovement>();
  records.forEach((record) => { if (!cases.has(record.caseId)) cases.set(record.caseId, record); });

  for (const record of cases.values()) {
    if (!record.mpNumber.trim()) issues.push({ id: `mp-${record.caseId}`, severity: "Crítico", category: "Número MP ausente", description: "O processo não possui Número MP.", record });
    if (!cnjPattern.test(record.judicialNumber.trim())) issues.push({ id: `cnj-${record.caseId}`, severity: "Atenção", category: "Número judicial", description: "O número judicial está fora do formato CNJ esperado.", record });
    if (!record.className.trim() || record.className === "Não identificada") issues.push({ id: `class-${record.caseId}`, severity: "Cadastro", category: "Classe", description: "A classe não foi identificada ou está vazia.", record });
    if (!record.subject.trim()) issues.push({ id: `subject-${record.caseId}`, severity: "Cadastro", category: "Assunto", description: "O assunto ou observação da fila está vazio.", record });
    if (record.sociallyRelevant && !record.relevanceReason.trim()) issues.push({ id: `social-${record.caseId}`, severity: "Cadastro", category: "Relevância social", description: "Marcado como socialmente relevante, mas sem justificativa.", record });
    if (record.extremelyComplex && !record.complexityReason.trim()) issues.push({ id: `complex-${record.caseId}`, severity: "Cadastro", category: "Alta complexidade", description: "Marcado como altamente complexo, mas sem justificativa.", record });
  }

  const duplicates = new Map<string, ProcessMovement[]>();
  records.forEach((record) => {
    const receivedDate = semanticDatePart(record.receivedAt, record.receivedTimePrecise);
    const duplicateKey = `${record.caseId}|${receivedDate || record.receivedAt}|${record.actionType.toLowerCase()}`;
    duplicates.set(duplicateKey, [...(duplicates.get(duplicateKey) ?? []), record]);

    const receivedValid = isValidTimestamp(record.receivedAt);
    const deadlineDate = storedDatePart(record.deadlineAt);
    const receivedDateForDeadline = semanticDatePart(record.receivedAt, record.receivedTimePrecise);

    if (!record.assignedTo) issues.push({ id: `assignee-${record.movementId}`, severity: "Cadastro", category: "Responsável", description: "O processo não possui usuário responsável e deve ser atribuído.", record });
    if (!receivedValid) issues.push({ id: `received-${record.movementId}`, severity: "Crítico", category: "Data de entrada", description: "A data de entrada não é válida.", record });
    if (record.deadlineAt && !deadlineDate) issues.push({ id: `deadline-invalid-${record.movementId}`, severity: "Crítico", category: "Prazo", description: "A data de prazo não é válida.", record });

    // Prazo é uma data civil, portanto nunca deve ser comparado com a hora do recebimento.
    if (receivedValid && deadlineDate && receivedDateForDeadline && deadlineDate < receivedDateForDeadline) {
      issues.push({ id: `deadline-${record.movementId}`, severity: "Crítico", category: "Prazo anterior à entrada", description: "A data de prazo é anterior à data de entrada.", record });
    }

    if (record.workflowStatus === "Enviado" && !record.sentAt) issues.push({ id: `sent-${record.movementId}`, severity: "Atenção", category: "Envio sem data", description: "O registro está como enviado, mas não possui data de envio.", record });
    if (record.workflowStatus === "Enviado" && !record.actionType.trim()) issues.push({ id: `action-${record.movementId}`, severity: "Atenção", category: "Envio sem providência", description: "O registro está como enviado, mas não possui providência definida.", record });

    if (sentBeforeReceived(record)) {
      issues.push({
        id: `sent-before-${record.movementId}`,
        severity: "Crítico",
        category: "Envio anterior à entrada",
        description: record.receivedTimePrecise && record.sentTimePrecise
          ? "A data e a hora de envio são anteriores à data e à hora de entrada."
          : "A data de envio é anterior à data de entrada.",
        record,
      });
    }
  });

  duplicates.forEach((items, key) => {
    if (items.length < 2) return;
    items.slice(1).forEach((record) => issues.push({ id: `duplicate-${key}-${record.movementId}`, severity: "Atenção", category: "Possível duplicidade", description: "Há outra movimentação do mesmo processo, na mesma data e com a mesma providência.", record }));
  });

  const rank: Record<QualitySeverity, number> = { "Crítico": 0, "Atenção": 1, "Cadastro": 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || b.record.receivedAt.localeCompare(a.record.receivedAt));
}
