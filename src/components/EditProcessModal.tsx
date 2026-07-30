import { useEffect, useMemo, useState } from "react";
import { History, LockKeyhole, X } from "lucide-react";
import { listChangeHistory } from "../api";
import { formatDate, toLocalInput } from "../date";
import { actionLabel } from "../labels";
import { withRequiredAppealClasses } from "../classOptions";
import type { ChangeHistory, ClassSetting, Priority, ProcessEditData, ProcessMovement, ProcessPermissions, TeamMember } from "../types";
import { SpecialClassificationFields } from "./SpecialClassificationFields";
import { CopyButton } from "./CopyButton";
import { getMovementProvenance, type MovementProvenance } from "../intelligentImportApi";

interface Props { record: ProcessMovement; classes: ClassSetting[]; members: TeamMember[]; permissions: ProcessPermissions; onClose: () => void; onSave: (movementId: number, data: ProcessEditData) => Promise<void>; }
const standardActions = ["Manifestação", "DI", "Diligência", "Prevenção", "Suspeição", "Ciência", "CTRZ", "Recurso", "Sobrestamento", "Ratifico"];

function historyValue(fieldName: string, value: string, members: TeamMember[]): string {
  if (!value) return "(vazio)";
  if (fieldName === "Responsável") {
    return members.find((member) => member.userId === value)?.fullName || value;
  }
  if (fieldName === "Entrada" || fieldName === "Data de envio") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return formatDate(parsed.toISOString(), true);
  }
  if (value === "true") return "Sim";
  if (value === "false") return "Não";
  return value;
}

export function EditProcessModal({ record, classes, members, permissions, onClose, onSave }: Props) {
  const [form, setForm] = useState<ProcessEditData>({ assignedTo: record.assignedTo, receivedAt: toLocalInput(new Date(record.receivedAt)), receivedTimePrecise: Boolean(record.receivedTimePrecise), sentAt: record.sentAt ? toLocalInput(new Date(record.sentAt)) : null, sentTimePrecise: Boolean(record.sentTimePrecise), className: record.className, subject: record.subject, deadlineAt: record.deadlineAt.slice(0, 10), actionType: record.actionType, notes: record.notes, priority: record.priority, documentPath: record.documentPath, sociallyRelevant: record.sociallyRelevant, extremelyComplex: record.extremelyComplex, socialTheme: record.socialTheme, relevanceReason: record.relevanceReason, fundamentalRight: record.fundamentalRight, affectedGroup: record.affectedGroup, reach: record.reach, territorialScope: record.territorialScope, impactType: record.impactType, socialResult: record.socialResult, sdgs: record.sdgs, complexityReason: record.complexityReason, sensitiveChangeReason: "" });
  const [saving, setSaving] = useState(false); const [history, setHistory] = useState<ChangeHistory[]>([]); const [showHistory, setShowHistory] = useState(false); const [provenance, setProvenance] = useState<MovementProvenance | null>(null);
  const classNames = useMemo(() => [...new Set([record.className, ...withRequiredAppealClasses(classes).map((item) => item.name)])], [classes, record.className]);
  const actions = useMemo(() => [...new Set([record.actionType, ...standardActions].filter(Boolean))], [record.actionType]);
  useEffect(() => { listChangeHistory(record.movementId).then(setHistory).catch(() => setHistory([])); getMovementProvenance(record.movementId).then(setProvenance).catch(() => setProvenance(null)); }, [record.movementId]);
  function change<K extends keyof ProcessEditData>(key: K, value: ProcessEditData[K]) { setForm((current) => { const next = { ...current, [key]: value }; if (key === "receivedAt") next.receivedTimePrecise = true; if (key === "sentAt") next.sentTimePrecise = Boolean(value); return next; }); }
  const receivedChanged = form.receivedAt !== toLocalInput(new Date(record.receivedAt));
  async function submit(event: React.FormEvent) { event.preventDefault(); if (receivedChanged && permissions.canChangeReceivedAt && !form.sensitiveChangeReason?.trim()) return; setSaving(true); try { await onSave(record.movementId, form); } finally { setSaving(false); } }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">Editar registro</p><h2>Dados do processo</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
    <div className="locked-fields"><div><LockKeyhole size={15} /><span><small>Número MP</small><strong>{record.mpNumber}</strong></span><CopyButton value={record.mpNumber} label="Copiar número MP" /></div><div><LockKeyhole size={15} /><span><small>Número Judicial</small><strong>{record.judicialNumber}</strong></span><CopyButton value={record.judicialNumber} label="Copiar número judicial" /></div></div>
    <div className="form-grid process-form-grid">
      <label className="field-with-help">Data e hora de entrada<input required type="datetime-local" disabled={!permissions.canChangeReceivedAt} value={form.receivedAt} onChange={(event) => change("receivedAt", event.target.value)} /><small>{form.receivedTimePrecise ? "Horário confirmado para os cálculos de eficiência." : "Registro histórico sem horário confirmado. Altere o campo para confirmar a hora correta."}</small></label>
      <label>Classe<select disabled={!permissions.canEditFull} value={form.className} onChange={(event) => change("className", event.target.value)}>{classNames.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Providência<select disabled={!permissions.canEditWorkflow} required={record.workflowStatus === "Enviado"} value={form.actionType} onChange={(event) => change("actionType", event.target.value)}><option value="">Ainda não definida</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></label>
      <label className="field-with-help">{record.workflowStatus === "Enviado" ? "Prazo (histórico)" : "Prazo"}<input type="date" disabled={!permissions.canEditFull} value={form.deadlineAt} onChange={(event) => change("deadlineAt", event.target.value)} /><small>Deixe vazio quando não houver prazo aplicável.</small></label>
      {record.workflowStatus === "Enviado" ? <label className="field-with-help">Data e hora de envio<input required type="datetime-local" disabled={!permissions.canChangeSentAt} value={form.sentAt ?? ""} onChange={(event) => change("sentAt", event.target.value || null)} /><small>{form.sentTimePrecise ? "Horário confirmado para os cálculos de eficiência." : "Informe o horário real para habilitar as métricas em horas."}</small></label> : <div />}
      <label>Prioridade<select disabled={!permissions.canEditFull} value={form.priority} onChange={(event) => change("priority", event.target.value as Priority)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
      {permissions.canChangeAssignment ? <label>Responsável<select value={form.assignedTo} onChange={(event) => change("assignedTo", event.target.value)}>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select></label> : <label>Responsável<input value={record.assignedName || "Não identificado"} disabled /></label>}
      <label>Documento relacionado<input disabled={!permissions.canEditFull} value={form.documentPath} onChange={(event) => change("documentPath", event.target.value)} placeholder="C:\\Processos\\manifestacao.docx" /></label>
      <label className="full">Assunto/observação da fila<textarea required rows={3} disabled={!permissions.canEditFull} value={form.subject} onChange={(event) => change("subject", event.target.value)} /></label>
      <label className="full">Observações internas<textarea rows={2} disabled={!permissions.canEditNotes} value={form.notes} onChange={(event) => change("notes", event.target.value)} /></label>
      {permissions.canEditFull && <SpecialClassificationFields data={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />}
      <p className="edit-scope-note full">A classe e o assunto pertencem ao processo e serão atualizados também nos retornos vinculados ao mesmo número judicial.</p>
    </div>
    {provenance && provenance.dataOrigin !== "manual" && <div className="data-provenance-note"><strong>Origem dos dados</strong><span>Importado{provenance.sourceFileName ? ` de ${provenance.sourceFileName}` : ""}{provenance.batchCode ? ` · ${provenance.batchCode}` : ""}.</span><small>Entrada: {provenance.receivedOrigin === "imported_confirmed" ? "horário confirmado na planilha" : provenance.receivedOrigin === "imported_date_only" ? "somente data disponível" : provenance.receivedOrigin}. Envio: {provenance.sentOrigin === "system_estimated" ? "estimado pelo sistema" : provenance.sentOrigin === "imported_confirmed" ? "horário confirmado na planilha" : provenance.sentOrigin}.</small></div>}
    {permissions.canChangeReceivedAt && receivedChanged && <div className="sensitive-change-box"><strong>Alteração sensível</strong><p>A mudança da entrada afeta prazos, eficiência e relatórios. Informe a justificativa para a auditoria.</p><textarea required rows={2} value={form.sensitiveChangeReason ?? ""} onChange={(event) => change("sensitiveChangeReason", event.target.value)} placeholder="Justificativa obrigatória" /></div>}
    <div className="history-section"><button type="button" className="history-toggle" onClick={() => setShowHistory(!showHistory)}><History size={17} /><span><strong>Histórico do processo</strong><small>{history.length ? `${history.length} alteração(ões) registrada(s) neste processo` : "Nenhuma alteração registrada"}</small></span><b>{showHistory ? "Ocultar" : "Exibir"}</b></button>{showHistory && <div className="history-list process-history-list">{history.map((item) => <article className="history-item process-history-item" key={item.id}><header><div><strong>{item.actionName}</strong><small>{formatDate(item.changedAt, true)}</small></div><span>{item.actorName}</span></header><div className="history-change"><b>{item.fieldName}</b><p><span>{historyValue(item.fieldName, item.oldValue, members)}</span><i aria-hidden="true">→</i><span>{historyValue(item.fieldName, item.newValue, members)}</span></p></div></article>)}{!history.length && <div className="empty-state">O histórico próprio deste processo começará a ser registrado após a instalação da versão 0.10.7.</div>}</div>}</div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving || (receivedChanged && permissions.canChangeReceivedAt && !form.sensitiveChangeReason?.trim())}>{saving ? "Salvando..." : "Salvar alterações"}</button></div>
  </form></div>;
}
