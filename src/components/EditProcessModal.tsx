import { useEffect, useMemo, useState } from "react";
import { History, LockKeyhole, X } from "lucide-react";
import { listChangeHistory } from "../api";
import { formatDate, toLocalInput } from "../date";
import { actionLabel } from "../labels";
import type { ChangeHistory, ClassSetting, Priority, ProcessEditData, ProcessMovement, TeamMember } from "../types";
import { SpecialClassificationFields } from "./SpecialClassificationFields";

interface Props {
  record: ProcessMovement;
  classes: ClassSetting[];
  members: TeamMember[];
  isAdmin: boolean;
  onClose: () => void;
  onSave: (movementId: number, data: ProcessEditData) => Promise<void>;
}

const standardActions = ["Manifestação", "DI", "Diligência", "Prevenção", "Ciência", "CTRZ", "Recurso", "Sobrestamento", "Ratifico"];

export function EditProcessModal({ record, classes, members, isAdmin, onClose, onSave }: Props) {
  const [form, setForm] = useState<ProcessEditData>({
    assignedTo: record.assignedTo,
    sentAt: record.sentAt ? toLocalInput(new Date(record.sentAt)) : null,
    className: record.className,
    subject: record.subject,
    deadlineAt: record.deadlineAt.slice(0, 16),
    actionType: record.actionType,
    notes: record.notes,
    priority: record.priority,
    documentPath: record.documentPath,
    sociallyRelevant: record.sociallyRelevant,
    extremelyComplex: record.extremelyComplex,
    socialTheme: record.socialTheme,
    relevanceReason: record.relevanceReason,
    fundamentalRight: record.fundamentalRight,
    affectedGroup: record.affectedGroup,
    reach: record.reach,
    territorialScope: record.territorialScope,
    impactType: record.impactType,
    socialResult: record.socialResult,
    complexityReason: record.complexityReason,
  });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ChangeHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const classNames = useMemo(() => [...new Set([record.className, ...classes.map((item) => item.name)])], [classes, record.className]);
  const actions = useMemo(() => [...new Set([record.actionType, ...standardActions].filter(Boolean))], [record.actionType]);
  useEffect(() => { listChangeHistory(record.movementId).then(setHistory).catch(() => setHistory([])); }, [record.movementId]);

  function change<K extends keyof ProcessEditData>(key: K, value: ProcessEditData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave(record.movementId, form);
    setSaving(false);
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit}>
      <div className="modal-head"><div><p className="eyebrow">Editar registro</p><h2>Dados do processo</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
      <div className="locked-fields">
        <div><LockKeyhole size={15} /><span><small>Número MP</small><strong>{record.mpNumber}</strong></span></div>
        <div><LockKeyhole size={15} /><span><small>Número Judicial</small><strong>{record.judicialNumber}</strong></span></div>
        <div><LockKeyhole size={15} /><span><small>Entrada</small><strong>{formatDate(record.receivedAt, true)}</strong></span></div>
      </div>
      <div className="form-grid">
        <label>Classe<select value={form.className} onChange={(event) => change("className", event.target.value)}>{classNames.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Providência<select required={record.workflowStatus === "Enviado"} value={form.actionType} onChange={(event) => change("actionType", event.target.value)}><option value="">Ainda não definida</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></label>
        <label>Prazo<input required type="datetime-local" value={form.deadlineAt} onChange={(event) => change("deadlineAt", event.target.value)} /></label>
        {record.workflowStatus === "Enviado" && <label>Data de envio<input required type="datetime-local" value={form.sentAt ?? ""} onChange={(event) => change("sentAt", event.target.value || null)} /><small>Quando ausente, o sistema sugere 10 dias corridos após a entrada.</small></label>}
        <label>Prioridade<select value={form.priority} onChange={(event) => change("priority", event.target.value as Priority)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
        {isAdmin ? <label>Responsável<select value={form.assignedTo} onChange={(event) => change("assignedTo", event.target.value)}>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select></label> : <label>Responsável<input value={record.assignedName || "Não identificado"} disabled /></label>}
        <label className="full">Assunto/observação da fila<textarea required rows={3} value={form.subject} onChange={(event) => change("subject", event.target.value)} /></label>
        <label className="full">Observações internas<textarea rows={2} value={form.notes} onChange={(event) => change("notes", event.target.value)} /></label>
        <label className="full">Documento relacionado<input value={form.documentPath} onChange={(event) => change("documentPath", event.target.value)} placeholder="C:\\Processos\\manifestacao.docx" /></label>
        <SpecialClassificationFields data={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />
        <p className="edit-scope-note full">A classe e o assunto pertencem ao processo e serão atualizados também nos retornos vinculados ao mesmo número judicial.</p>
      </div>
      <div className="history-section">
        <button type="button" className="history-toggle" onClick={() => setShowHistory(!showHistory)}><History size={17} /><span><strong>Histórico de alterações</strong><small>{history.length ? `${history.length} alteração(ões) registrada(s) neste processo` : "Nenhuma alteração registrada"}</small></span><b>{showHistory ? "Ocultar" : "Exibir"}</b></button>
        {showHistory && <div className="history-list">{history.map((item) => <div className="history-item" key={item.id}><div><strong>{item.fieldName}</strong><small>{formatDate(item.changedAt, true)} · registro #{item.movementId}</small></div><p><span>{item.oldValue || "(vazio)"}</span><b>→</b><span>{item.newValue || "(vazio)"}</span></p></div>)}{!history.length && <div className="empty-state">O histórico começará a ser registrado a partir desta versão.</div>}</div>}
      </div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button></div>
    </form>
  </div>;
}
