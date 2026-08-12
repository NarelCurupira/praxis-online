import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { addBusinessDays, toLocalInput } from "../date";
import { withRequiredAppealClasses } from "../classOptions";
import type { CalendarExclusion, ClassSetting, Priority, ProceduralPriority, ProcessFormData, TeamMember } from "../types";
import { PROCEDURAL_PRIORITY_OPTIONS } from "../proceduralPriorities";
import { SpecialClassificationFields } from "./SpecialClassificationFields";
import { PasteButton } from "./PasteButton";

interface Props { classes: ClassSetting[]; exclusions: CalendarExclusion[]; members: TeamMember[]; currentUserId: string; isAdmin: boolean; offlineMode?: boolean; onClose: () => void; onSave: (data: ProcessFormData) => Promise<void>; }

export function ProcessModal({ classes, exclusions, members, currentUserId, isAdmin, offlineMode = false, onClose, onSave }: Props) {
  const now = useMemo(() => toLocalInput(), []);
  const selectableClasses = useMemo(
    () => withRequiredAppealClasses(classes.length ? classes : [{ name: "Apelação Cível", businessDays: 30 }]),
    [classes],
  );
  const initialClass = selectableClasses.find((item) => item.name === "Apelação Cível") ?? selectableClasses[0] ?? { name: "Outro", businessDays: 30 };
  const [form, setForm] = useState<ProcessFormData>({
    assignedTo: currentUserId,
    mpNumber: "", judicialNumber: "", className: initialClass.name, subject: "", receivedAt: now,
    deadlineAt: addBusinessDays(now, initialClass.businessDays, exclusions.map((item) => item.date)).slice(0, 10), actionType: "", notes: "", priority: "Normal", proceduralPriority: "Nenhuma", documentPath: "",
    sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "", fundamentalRight: "",
    affectedGroup: "", reach: "", territorialScope: "", impactType: "", socialResult: "", sdgs: [], complexityReason: "",
  });
  const [saving, setSaving] = useState(false);

  function change<K extends keyof ProcessFormData>(key: K, value: ProcessFormData[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "receivedAt" || key === "className") {
        const className = key === "className" ? String(value) : current.className;
        const receivedAt = key === "receivedAt" ? String(value) : current.receivedAt;
        const days = selectableClasses.find((item) => item.name === className)?.businessDays ?? 30;
        next.deadlineAt = addBusinessDays(receivedAt, days, exclusions.map((item) => item.date)).slice(0, 10);
      }
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit}>
      <div className="modal-head"><div><p className="eyebrow">Novo registro</p><h2>{offlineMode ? "Cadastrar em contingência" : "Cadastrar processo"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
      {offlineMode && <div className="info-box offline-form-note">O cadastro será salvo neste dispositivo e enviado ao Supabase automaticamente quando a conexão retornar. Enquanto estiver pendente, o registro é identificado apenas localmente.</div>}
      <div className="form-grid process-form-grid">
        <label>Número MP<div className="input-copy-row"><input required value={form.mpNumber} onChange={(e) => change("mpNumber", e.target.value)} placeholder="08.2026.00000000-0" /><PasteButton onPaste={(value) => change("mpNumber", value)} label="Colar número MP" /></div></label>
        <label>Número judicial<div className="input-copy-row"><input required value={form.judicialNumber} onChange={(e) => change("judicialNumber", e.target.value)} placeholder="0000000-00.2026.8.14.0000" /><PasteButton onPaste={(value) => change("judicialNumber", value)} label="Colar número judicial" /></div></label>
        <label>Classe<select value={form.className} onChange={(e) => change("className", e.target.value)}>{selectableClasses.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
        <label>Entrada<input type="datetime-local" required value={form.receivedAt} onChange={(e) => change("receivedAt", e.target.value)} /></label>
        <label className="field-with-help">Prazo<input type="date" value={form.deadlineAt} onChange={(e) => change("deadlineAt", e.target.value)} /><small>Calculado com fins de semana e exclusões cadastradas. Deixe vazio se não houver prazo aplicável.</small></label>
        <label>Urgência da fila<select value={form.priority} onChange={(e) => change("priority", e.target.value as Priority)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
        <label>Prioridade processual<select value={form.proceduralPriority} onChange={(e) => change("proceduralPriority", e.target.value as ProceduralPriority)}>{PROCEDURAL_PRIORITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {isAdmin ? <label>Responsável<select value={form.assignedTo} onChange={(e) => change("assignedTo", e.target.value)}>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select></label> : <div />}
        <label>Documento relacionado<input value={form.documentPath} onChange={(e) => change("documentPath", e.target.value)} placeholder="C:\\Processos\\manifestacao.docx" /></label>
        <label className="full">Assunto/observação da fila<textarea required rows={3} value={form.subject} onChange={(e) => change("subject", e.target.value)} placeholder="Descreva brevemente a controvérsia e a providência..." /></label>
        <label className="full">Observações internas<textarea rows={2} value={form.notes} onChange={(e) => change("notes", e.target.value)} /></label>
        <SpecialClassificationFields data={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />
      </div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando..." : "Cadastrar processo"}</button></div>
    </form>
  </div>;
}
