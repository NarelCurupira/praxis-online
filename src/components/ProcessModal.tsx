import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { addBusinessDays, toLocalInput } from "../date";
import type { CalendarExclusion, ClassSetting, Priority, ProcessFormData, TeamMember } from "../types";
import { SpecialClassificationFields } from "./SpecialClassificationFields";

interface Props { classes: ClassSetting[]; exclusions: CalendarExclusion[]; members: TeamMember[]; currentUserId: string; isAdmin: boolean; onClose: () => void; onSave: (data: ProcessFormData) => Promise<void>; }

export function ProcessModal({ classes, exclusions, members, currentUserId, isAdmin, onClose, onSave }: Props) {
  const now = useMemo(() => toLocalInput(), []);
  const initialClass = classes.find((item) => item.name === "Apelação Cível") ?? classes[0] ?? { name: "Outro", businessDays: 30 };
  const selectableClasses = classes.length ? classes : [initialClass];
  const [form, setForm] = useState<ProcessFormData>({
    assignedTo: currentUserId,
    mpNumber: "", judicialNumber: "", className: initialClass.name, subject: "", receivedAt: now,
    deadlineAt: addBusinessDays(now, initialClass.businessDays, exclusions.map((item) => item.date)).slice(0, 10), actionType: "", notes: "", priority: "Normal", documentPath: "",
    sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "", fundamentalRight: "",
    affectedGroup: "", reach: "", territorialScope: "", impactType: "", socialResult: "", complexityReason: "",
  });
  const [saving, setSaving] = useState(false);

  function change<K extends keyof ProcessFormData>(key: K, value: ProcessFormData[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "receivedAt" || key === "className") {
        const className = key === "className" ? String(value) : current.className;
        const receivedAt = key === "receivedAt" ? String(value) : current.receivedAt;
        const days = classes.find((item) => item.name === className)?.businessDays ?? 30;
        next.deadlineAt = addBusinessDays(receivedAt, days, exclusions.map((item) => item.date)).slice(0, 10);
      }
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head"><div><p className="eyebrow">Novo registro</p><h2>Cadastrar processo</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <div className="form-grid">
          <label>Número MP<input required value={form.mpNumber} onChange={(e) => change("mpNumber", e.target.value)} placeholder="08.2026.00000000-0" /></label>
          <label>Número judicial<input required value={form.judicialNumber} onChange={(e) => change("judicialNumber", e.target.value)} placeholder="0000000-00.2026.8.14.0000" /></label>
          <label>Classe<select value={form.className} onChange={(e) => change("className", e.target.value)}>{selectableClasses.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
          <label>Entrada<input type="datetime-local" required value={form.receivedAt} onChange={(e) => change("receivedAt", e.target.value)} /></label>
          <label>Prazo<input type="date" required value={form.deadlineAt} onChange={(e) => change("deadlineAt", e.target.value)} /><small>Calculado com sábados, domingos e as exclusões cadastradas nas Configurações.</small></label>
          <label>Prioridade<select value={form.priority} onChange={(e) => change("priority", e.target.value as Priority)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
          {isAdmin && <label>Responsável<select value={form.assignedTo} onChange={(e) => change("assignedTo", e.target.value)}>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select></label>}
          <label>Documento relacionado<input value={form.documentPath} onChange={(e) => change("documentPath", e.target.value)} placeholder="C:\\Processos\\manifestacao.docx" /></label>
          <label className="full">Assunto/observação da fila<textarea required rows={3} value={form.subject} onChange={(e) => change("subject", e.target.value)} placeholder="Descreva brevemente a controvérsia e a providência..." /></label>
          <label className="full">Observações internas<textarea rows={2} value={form.notes} onChange={(e) => change("notes", e.target.value)} /></label>
          <SpecialClassificationFields data={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />
        </div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando..." : "Cadastrar processo"}</button></div>
      </form>
    </div>
  );
}
