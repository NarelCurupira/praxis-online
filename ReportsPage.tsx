import { AlertTriangle, CheckCircle2, Pencil, Search, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate } from "../date";
import type { ProcessMovement, TeamMember } from "../types";

interface Props {
  records: ProcessMovement[];
  members: TeamMember[];
  isAdmin: boolean;
  onEdit: (record: ProcessMovement) => void;
  onBulkAssignment: (movementIds: number[], assignedTo: string) => Promise<void>;
}
type Severity = "Crítico" | "Atenção" | "Cadastro";
interface QualityIssue { id: string; severity: Severity; category: string; description: string; record: ProcessMovement; }

const cnjPattern = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

function inspect(records: ProcessMovement[]): QualityIssue[] {
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
    const received = new Date(record.receivedAt); const deadline = new Date(record.deadlineAt); const sent = record.sentAt ? new Date(record.sentAt) : null;
    if (!record.assignedTo) issues.push({ id: `assignee-${record.movementId}`, severity: "Cadastro", category: "Responsável", description: "O processo não possui usuário responsável e deve ser atribuído.", record });
    if (Number.isNaN(received.getTime())) issues.push({ id: `received-${record.movementId}`, severity: "Crítico", category: "Data de entrada", description: "A data de entrada não é válida.", record });
    if (Number.isNaN(deadline.getTime())) issues.push({ id: `deadline-invalid-${record.movementId}`, severity: "Crítico", category: "Prazo", description: "A data de prazo não é válida.", record });
    if (!Number.isNaN(received.getTime()) && !Number.isNaN(deadline.getTime()) && deadline < received) issues.push({ id: `deadline-${record.movementId}`, severity: "Crítico", category: "Prazo anterior à entrada", description: "O prazo informado é anterior à data de entrada.", record });
    if (record.workflowStatus === "Enviado" && !record.sentAt) issues.push({ id: `sent-${record.movementId}`, severity: "Atenção", category: "Envio sem data", description: "O registro está como enviado, mas não possui data de envio.", record });
    if (record.workflowStatus === "Enviado" && !record.actionType.trim()) issues.push({ id: `action-${record.movementId}`, severity: "Atenção", category: "Envio sem providência", description: "O registro está como enviado, mas não possui providência definida.", record });
    if (sent && !Number.isNaN(sent.getTime()) && !Number.isNaN(received.getTime()) && sent < received) issues.push({ id: `sent-before-${record.movementId}`, severity: "Crítico", category: "Envio anterior à entrada", description: "A data de envio é anterior à data de entrada.", record });
  });
  duplicates.forEach((items, key) => {
    if (items.length < 2) return;
    items.slice(1).forEach((record) => issues.push({ id: `duplicate-${key}-${record.movementId}`, severity: "Atenção", category: "Possível duplicidade", description: "Há outra movimentação do mesmo processo, na mesma data e com a mesma providência.", record }));
  });
  const rank: Record<Severity, number> = { "Crítico": 0, "Atenção": 1, "Cadastro": 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || b.record.receivedAt.localeCompare(a.record.receivedAt));
}

export function DataQualityPage({ records, members, isAdmin, onEdit, onBulkAssignment }: Props) {
  const issues = useMemo(() => inspect(records), [records]);
  const [severity, setSeverity] = useState("Todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const filtered = issues.filter((issue) => (severity === "Todos" || issue.severity === severity) && `${issue.category} ${issue.description} ${issue.record.judicialNumber} ${issue.record.mpNumber}`.toLowerCase().includes(query.toLowerCase()));
  const critical = issues.filter((item) => item.severity === "Crítico").length;
  const warnings = issues.filter((item) => item.severity === "Atenção").length;
  const registration = issues.filter((item) => item.severity === "Cadastro").length;
  const filteredMovementIds = [...new Set(filtered.map((issue) => issue.record.movementId))];

  function toggle(movementId: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(movementId)) next.delete(movementId); else next.add(movementId);
      return next;
    });
  }

  function toggleAll() {
    const allSelected = filteredMovementIds.length > 0 && filteredMovementIds.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      filteredMovementIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function applyBulkAssignment() {
    if (!bulkAssignee || !selected.size) return;
    setSaving(true); setMessage("");
    try {
      await onBulkAssignment([...selected], bulkAssignee);
      setMessage(`Responsável atualizado em ${selected.size} processo(s).`);
      setSelected(new Set()); setBulkAssignee("");
    } catch (error) { setMessage(`Não foi possível corrigir em bloco: ${String(error)}`); }
    finally { setSaving(false); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Confiabilidade</p><h1>Qualidade dos dados</h1><p>Identifique inconsistências que podem afetar filtros, prazos e relatórios.</p></div></div>
    <div className="quality-stats">
      <div className="quality-card critical"><AlertTriangle /><span><strong>{critical}</strong><small>Inconsistências críticas</small></span></div>
      <div className="quality-card warning"><ShieldCheck /><span><strong>{warnings}</strong><small>Pontos de atenção</small></span></div>
      <div className="quality-card registration"><Pencil /><span><strong>{registration}</strong><small>Cadastros incompletos</small></span></div>
      <div className="quality-card ok"><CheckCircle2 /><span><strong>{issues.length ? records.length - new Set(issues.map((item) => item.record.movementId)).size : records.length}</strong><small>Registros sem apontamento</small></span></div>
    </div>
    <section className="panel quality-panel">
      <div className="quality-toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar processo ou inconsistência..." /></div><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>Todos</option><option>Crítico</option><option>Atenção</option><option>Cadastro</option></select>{isAdmin && filtered.length > 0 && <label className="quality-select-all"><input type="checkbox" checked={filteredMovementIds.every((id) => selected.has(id))} onChange={toggleAll} />Selecionar resultados</label>}</div>
      {isAdmin && selected.size > 0 && <div className="quality-bulk"><UserRoundCheck size={19} /><strong>{selected.size} processo(s) selecionado(s)</strong><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Escolha o responsável...</option>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select><button className="button primary" disabled={!bulkAssignee || saving} onClick={applyBulkAssignment}>{saving ? "Aplicando..." : "Corrigir responsável em bloco"}</button></div>}
      {message && <div className="table-export-message">{message}</div>}
      {filtered.length > 0 && <div className="quality-list">{filtered.map((issue) => <div className="quality-row" key={issue.id}>{isAdmin ? <input className="quality-checkbox" type="checkbox" aria-label={`Selecionar ${issue.record.judicialNumber}`} checked={selected.has(issue.record.movementId)} onChange={() => toggle(issue.record.movementId)} /> : <span />}<span className={`quality-severity severity-${issue.severity.toLowerCase().replace("í", "i").replace("ç", "c").replace("ã", "a")}`}>{issue.severity}</span><div className="quality-description"><strong>{issue.category}</strong><p>{issue.description}</p></div><div className="quality-process"><strong>{issue.record.judicialNumber}</strong><small>{issue.record.className} · entrada em {formatDate(issue.record.receivedAt)}</small></div><button className="button secondary" onClick={() => onEdit(issue.record)}><Pencil size={15} />Corrigir</button></div>)}</div>}
      {!filtered.length && <div className="quality-empty"><CheckCircle2 size={32} /><strong>{issues.length ? "Nenhum apontamento com esses filtros" : "Nenhuma inconsistência encontrada"}</strong><span>{issues.length ? "Ajuste a pesquisa ou o tipo selecionado." : "Os registros passaram nas verificações disponíveis."}</span></div>}
      <div className="quality-foot">Registros enviados sem data recebem automaticamente a data de 10 dias corridos após a entrada. Os demais apontamentos dependem de conferência.</div>
    </section>
  </div>;
}
