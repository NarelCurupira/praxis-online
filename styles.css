import { useMemo, useState } from "react";
import { CalendarDays, Database, FolderOpen, HardDrive, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { chooseStorageDirectory } from "../api";
import type { CalendarExclusion, CalendarExclusionRange, ClassSetting, StorageDirectoryKind, StorageSettings } from "../types";

interface Props {
  info: string;
  classes: ClassSetting[];
  exclusions: CalendarExclusion[];
  storage: StorageSettings;
  onSaveClass: (setting: ClassSetting) => Promise<void>;
  onDeleteClass: (name: string) => Promise<void>;
  onSaveExclusion: (data: CalendarExclusionRange) => Promise<void>;
  onDeleteExclusion: (date: string) => Promise<void>;
  onSaveStorage: (kind: StorageDirectoryKind, path: string | null) => Promise<void>;
}

interface ExclusionGroup { startDate: string; endDate: string; label: string; dates: string[]; }

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string): string { return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)); }

function groupExclusions(items: CalendarExclusion[]): ExclusionGroup[] {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const groups: ExclusionGroup[] = [];
  sorted.forEach((item) => {
    const last = groups.at(-1);
    const previous = last ? new Date(`${last.endDate}T12:00:00`) : null;
    if (previous) previous.setDate(previous.getDate() + 1);
    const expected = previous ? `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}` : "";
    if (last && last.label === item.label && expected === item.date && last.startDate.slice(0, 4) === item.date.slice(0, 4)) {
      last.endDate = item.date; last.dates.push(item.date);
    } else groups.push({ startDate: item.date, endDate: item.date, label: item.label, dates: [item.date] });
  });
  return groups.reverse();
}

export function SettingsPage({ info, classes, exclusions, storage, onSaveClass, onDeleteClass, onSaveExclusion, onDeleteExclusion, onSaveStorage }: Props) {
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const grouped = useMemo(() => groupExclusions(exclusions), [exclusions]);

  async function addClass(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    await onSaveClass({ name: name.trim(), businessDays: days });
    setName(""); setDays(30); setMessage("Classe incluída."); setBusy(false);
  }

  async function updateDays(item: ClassSetting, businessDays: number) {
    setBusy(true); await onSaveClass({ ...item, businessDays });
    setMessage(`Prazo de ${item.name} atualizado.`); setBusy(false);
  }

  async function addExclusion(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await onSaveExclusion({ startDate, endDate, label: label.trim() });
      setLabel(""); setMessage(startDate === endDate ? "Feriado ou dia sem expediente incluído." : "Período de recesso incluído.");
    } catch (error) { setMessage(`Não foi possível incluir: ${String(error)}`); }
    finally { setBusy(false); }
  }

  async function removeGroup(group: ExclusionGroup) {
    const description = group.startDate === group.endDate ? displayDate(group.startDate) : `${displayDate(group.startDate)} a ${displayDate(group.endDate)}`;
    if (!confirm(`Excluir “${group.label}” (${description}) do calendário?`)) return;
    setBusy(true);
    for (const date of group.dates) await onDeleteExclusion(date);
    setMessage("Exclusão removida do calendário."); setBusy(false);
  }

  async function selectFolder(kind: StorageDirectoryKind, current: string) {
    const selected = await chooseStorageDirectory(current);
    if (!selected) return;
    setBusy(true); setStorageMessage("");
    try { await onSaveStorage(kind, selected); setStorageMessage("Pasta de armazenamento atualizada."); }
    catch (error) { setStorageMessage(`Não foi possível usar a pasta selecionada: ${String(error)}`); }
    finally { setBusy(false); }
  }

  async function resetFolder(kind: StorageDirectoryKind) {
    setBusy(true); setStorageMessage("");
    try { await onSaveStorage(kind, null); setStorageMessage("Pasta padrão restaurada."); }
    catch (error) { setStorageMessage(`Não foi possível restaurar a pasta padrão: ${String(error)}`); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Aplicativo local</p><h1>Configurações</h1><p>Preferências, classes e regras de prazo.</p></div></div>
    <section className="panel settings-list">
      <div><Database /><span><strong>Banco de dados</strong><small>{info}</small></span></div>
      <div><HardDrive /><span><strong>Regra geral de prazo</strong><small>Dias úteis a partir da entrada, descontando fins de semana e datas cadastradas.</small></span><b>Configurável</b></div>
      <div><ShieldCheck /><span><strong>Proteção</strong><small>Aplicativo individual, protegido pela conta do Windows</small></span><b>Local</b></div>
    </section>
    <section className="panel storage-settings">
      <div className="panel-title"><div><h2>Armazenamento</h2><p>Use pastas locais ou sincronizadas pelo Google Drive, OneDrive e serviços semelhantes.</p></div><FolderOpen size={22} /></div>
      <div className="storage-list">
        <StorageRow title="Backups do banco" path={storage.backupDirectory} custom={storage.backupCustom} disabled={busy} onChoose={() => selectFolder("backup", storage.backupDirectory)} onReset={() => resetFolder("backup")} />
        <StorageRow title="Exportações em Excel" path={storage.exportDirectory} custom={storage.exportCustom} disabled={busy} onChoose={() => selectFolder("export", storage.exportDirectory)} onReset={() => resetFolder("export")} />
        <StorageRow title="Relatórios em PDF" path={storage.reportDirectory} custom={storage.reportCustom} disabled={busy} onChoose={() => selectFolder("report", storage.reportDirectory)} onReset={() => resetFolder("report")} />
      </div>
      <p className="settings-note">O banco principal permanece local para evitar conflitos de sincronização. Se uma pasta compartilhada ficar indisponível, o Práxis salvará o arquivo na pasta local padrão.</p>
      {storageMessage && <div className="info-box">{storageMessage}</div>}
    </section>
    <section className="panel">
      <div className="panel-title"><div><h2>Classes e prazos</h2><p>O prazo é aplicado automaticamente em novos cadastros e continua editável.</p></div></div>
      <form className="class-form" onSubmit={addClass}>
        <label>Nova classe<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Ação Rescisória" /></label>
        <label>Dias úteis<input required type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
        <button className="button primary" disabled={busy || !name.trim()}><Plus size={17} />Incluir classe</button>
      </form>
      <div className="class-list">
        {classes.map((item) => <ClassRow key={item.name} item={item} disabled={busy} onSave={updateDays} onDelete={async () => {
          if (!confirm(`Excluir a classe “${item.name}” das configurações? Os processos existentes não serão alterados.`)) return;
          setBusy(true); await onDeleteClass(item.name); setMessage("Classe removida das configurações."); setBusy(false);
        }} />)}
      </div>
    </section>
    <section className="panel calendar-settings">
      <div className="panel-title"><div><h2>Feriados, recessos e dias sem expediente</h2><p>Cadastre as datas de cada ano. Elas serão consideradas somente nos novos cálculos de prazo.</p></div><CalendarDays size={22} /></div>
      <form className="calendar-form" onSubmit={addExclusion}>
        <label>Descrição<input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Recesso forense 2026" /></label>
        <label>Data inicial<input required type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (endDate < event.target.value) setEndDate(event.target.value); }} /></label>
        <label>Data final<input required type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <button className="button primary" disabled={busy || !label.trim() || !startDate || !endDate || endDate < startDate}><Plus size={17} />Incluir</button>
      </form>
      <p className="settings-note">Os feriados e recessos mudam a cada ano e não são incluídos automaticamente. Os prazos já cadastrados e os importados não serão recalculados.</p>
      <div className="calendar-list">
        {grouped.map((group) => <div className="calendar-row" key={`${group.startDate}-${group.endDate}-${group.label}`}><span><strong>{group.label}</strong><small>{group.startDate === group.endDate ? displayDate(group.startDate) : `${displayDate(group.startDate)} a ${displayDate(group.endDate)} · ${group.dates.length} dias`}</small></span><b>{group.startDate.slice(0, 4)}</b><button className="icon-button danger" title="Excluir do calendário" disabled={busy} onClick={() => removeGroup(group)}><Trash2 size={17} /></button></div>)}
        {!grouped.length && <div className="empty-state">Nenhum feriado ou recesso cadastrado.</div>}
      </div>
      {message && <div className="info-box">{message}</div>}
    </section>
  </div>;
}

function StorageRow({ title, path, custom, disabled, onChoose, onReset }: { title: string; path: string; custom: boolean; disabled: boolean; onChoose: () => void; onReset: () => void }) {
  return <div className="storage-row"><span><strong>{title}</strong><small title={path}>{path}</small></span><b>{custom ? "Personalizada" : "Padrão"}</b><button className="button secondary" disabled={disabled} onClick={onChoose}><FolderOpen size={16} />Escolher pasta</button>{custom && <button className="icon-button" disabled={disabled} title="Restaurar pasta padrão" onClick={onReset}><RotateCcw size={16} /></button>}</div>;
}

function ClassRow({ item, disabled, onSave, onDelete }: { item: ClassSetting; disabled: boolean; onSave: (item: ClassSetting, days: number) => Promise<void>; onDelete: () => Promise<void> }) {
  const [days, setDays] = useState(item.businessDays);
  return <div className="class-row">
    <strong>{item.name}</strong>
    <label><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /> dias úteis</label>
    <button className="icon-button" title="Salvar prazo" disabled={disabled || days === item.businessDays} onClick={() => onSave(item, days)}><Save size={17} /></button>
    <button className="icon-button danger" title="Excluir classe" disabled={disabled} onClick={onDelete}><Trash2 size={17} /></button>
  </div>;
}
