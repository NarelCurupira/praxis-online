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
    const key = `${record.caseId}|${record.receivedAt}|${record.actionType.toLowerCase()}`;
    duplicates.set(key, [...(duplicates.get(key) ?? []), record]);
    const received = new Date(record.receivedAt);
    const deadline = record.deadlineAt ? new Date(`${record.deadlineAt.slice(0, 10)}T12:00:00`) : null;
    const sent = record.sentAt ? new Date(record.sentAt) : null;
    if (!record.assignedTo) issues.push({ id: `assignee-${record.movementId}`, severity: "Cadastro", category: "Responsável", description: "O processo não possui usuário responsável e deve ser atribuído.", record });
    if (Number.isNaN(received.getTime())) issues.push({ id: `received-${record.movementId}`, severity: "Crítico", category: "Data de entrada", description: "A data de entrada não é válida.", record });
    if (deadline && Number.isNaN(deadline.getTime())) issues.push({ id: `deadline-invalid-${record.movementId}`, severity: "Crítico", category: "Prazo", description: "A data de prazo não é válida.", record });
    if (!Number.isNaN(received.getTime()) && deadline && !Number.isNaN(deadline.getTime()) && deadline < received) issues.push({ id: `deadline-${record.movementId}`, severity: "Crítico", category: "Prazo anterior à entrada", description: "O prazo informado é anterior à data de entrada.", record });
    if (record.workflowStatus === "Enviado" && !record.sentAt) issues.push({ id: `sent-${record.movementId}`, severity: "Atenção", category: "Envio sem data", description: "O registro está como enviado, mas não possui data de envio.", record });
    if (record.workflowStatus === "Enviado" && !record.actionType.trim()) issues.push({ id: `action-${record.movementId}`, severity: "Atenção", category: "Envio sem providência", description: "O registro está como enviado, mas não possui providência definida.", record });
    if (sent && !Number.isNaN(sent.getTime()) && !Number.isNaN(received.getTime()) && sent < received) issues.push({ id: `sent-before-${record.movementId}`, severity: "Crítico", category: "Envio anterior à entrada", description: "A data de envio é anterior à data de entrada.", record });
  });

  duplicates.forEach((items, key) => {
    if (items.length < 2) return;
    items.slice(1).forEach((record) => issues.push({ id: `duplicate-${key}-${record.movementId}`, severity: "Atenção", category: "Possível duplicidade", description: "Há outra movimentação do mesmo processo, na mesma data e com a mesma providência.", record }));
  });
  const rank: Record<QualitySeverity, number> = { "Crítico": 0, "Atenção": 1, "Cadastro": 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || b.record.receivedAt.localeCompare(a.record.receivedAt));
}
