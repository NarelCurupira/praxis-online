import { AlertTriangle, CheckCircle2, Pencil, Search, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate } from "../date";
import { inspectDataQuality } from "../dataQuality";
import type { ProcessMovement, TeamMember } from "../types";
import { CopyButton } from "./CopyButton";

interface Props { records: ProcessMovement[]; members: TeamMember[]; isAdmin: boolean; onEdit: (record: ProcessMovement) => void; onBulkAssignment: (movementIds: number[], assignedTo: string) => Promise<void>; }
type QualityDensity = "compact" | "comfortable" | "spacious";
function initialDensity(): QualityDensity { try { const value = localStorage.getItem("praxis-quality-density"); return value === "compact" || value === "spacious" ? value : "comfortable"; } catch { return "comfortable"; } }

export function DataQualityPage({ records, members, isAdmin, onEdit, onBulkAssignment }: Props) {
  const issues = useMemo(() => inspectDataQuality(records), [records]);
  const [severity, setSeverity] = useState("Todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [density, setDensity] = useState<QualityDensity>(initialDensity);
  const filtered = issues.filter((issue) => (severity === "Todos" || issue.severity === severity) && `${issue.category} ${issue.description} ${issue.record.judicialNumber} ${issue.record.mpNumber}`.toLowerCase().includes(query.toLowerCase()));
  const critical = issues.filter((item) => item.severity === "Crítico").length;
  const warnings = issues.filter((item) => item.severity === "Atenção").length;
  const registration = issues.filter((item) => item.severity === "Cadastro").length;
  const filteredMovementIds = [...new Set(filtered.map((issue) => issue.record.movementId))];

  function saveDensity(value: QualityDensity) { setDensity(value); try { localStorage.setItem("praxis-quality-density", value); } catch { /* Preferência não persistente. */ } }
  function toggle(movementId: number) { setSelected((current) => { const next = new Set(current); if (next.has(movementId)) next.delete(movementId); else next.add(movementId); return next; }); }
  function toggleAll() { const allSelected = filteredMovementIds.length > 0 && filteredMovementIds.every((id) => selected.has(id)); setSelected((current) => { const next = new Set(current); filteredMovementIds.forEach((id) => allSelected ? next.delete(id) : next.add(id)); return next; }); }
  async function applyBulkAssignment() { if (!bulkAssignee || !selected.size) return; setSaving(true); setMessage(""); try { await onBulkAssignment([...selected], bulkAssignee); setMessage(`Responsável atualizado em ${selected.size} processo(s).`); setSelected(new Set()); setBulkAssignee(""); } catch (error) { setMessage(`Não foi possível corrigir em bloco: ${String(error)}`); } finally { setSaving(false); } }

  return <div className="page-stack quality-page-v0102"><div className="page-heading"><div><p className="eyebrow">Confiabilidade</p><h1>Qualidade dos dados</h1><p>Identifique inconsistências que podem afetar filtros, prazos e relatórios.</p></div></div>
    <div className="quality-stats"><div className="quality-card critical"><AlertTriangle /><span><strong>{critical}</strong><small>Inconsistências críticas</small></span></div><div className="quality-card warning"><ShieldCheck /><span><strong>{warnings}</strong><small>Pontos de atenção</small></span></div><div className="quality-card registration"><Pencil /><span><strong>{registration}</strong><small>Cadastros incompletos</small></span></div><div className="quality-card ok"><CheckCircle2 /><span><strong>{issues.length ? records.length - new Set(issues.map((item) => item.record.movementId)).size : records.length}</strong><small>Registros sem apontamento</small></span></div></div>
    <section className={`panel quality-panel quality-density-${density}`}><div className="quality-display-controls"><div className="display-control-group"><span>Densidade</span><div role="group" aria-label="Densidade da lista"><button type="button" title="Compacta" className={density === "compact" ? "active" : ""} onClick={() => saveDensity("compact")}>≡</button><button type="button" title="Confortável" className={density === "comfortable" ? "active" : ""} onClick={() => saveDensity("comfortable")}>☰</button><button type="button" title="Espaçosa" className={density === "spacious" ? "active" : ""} onClick={() => saveDensity("spacious")}>☷</button></div></div></div>
      <div className="quality-toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar processo ou inconsistência..." /></div><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>Todos</option><option>Crítico</option><option>Atenção</option><option>Cadastro</option></select>{isAdmin && filtered.length > 0 && <label className="quality-select-all"><input type="checkbox" checked={filteredMovementIds.every((id) => selected.has(id))} onChange={toggleAll} />Selecionar resultados</label>}</div>
      {isAdmin && selected.size > 0 && <div className="quality-bulk"><UserRoundCheck size={19} /><strong>{selected.size} processo(s) selecionado(s)</strong><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Escolha o responsável...</option>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select><button className="button primary" disabled={!bulkAssignee || saving} onClick={applyBulkAssignment}>{saving ? "Aplicando..." : "Corrigir responsável em bloco"}</button></div>}
      {message && <div className="table-export-message">{message}</div>}
      {filtered.length > 0 && <div className="quality-list">{filtered.map((issue) => <div className="quality-row" key={issue.id}>{isAdmin ? <input className="quality-checkbox" type="checkbox" aria-label={`Selecionar ${issue.record.judicialNumber}`} checked={selected.has(issue.record.movementId)} onChange={() => toggle(issue.record.movementId)} /> : <span />}<span className={`quality-severity severity-${issue.severity.toLowerCase().replace("í", "i").replace("ç", "c").replace("ã", "a")}`}>{issue.severity}</span><div className="quality-description"><strong>{issue.category}</strong><p>{issue.description}</p></div><div className="quality-process"><div className="number-copy-line"><strong>{issue.record.judicialNumber}</strong><CopyButton value={issue.record.judicialNumber} label="Copiar número judicial" /></div><div className="number-copy-line secondary-number"><small>{issue.record.mpNumber}</small><CopyButton value={issue.record.mpNumber} label="Copiar número MP" /></div><small>{issue.record.className} · entrada em {formatDate(issue.record.receivedAt)}</small></div><button className="button secondary" onClick={() => onEdit(issue.record)}><Pencil size={15} />Corrigir</button></div>)}</div>}
      {!filtered.length && <div className="quality-empty"><CheckCircle2 size={32} /><strong>{issues.length ? "Nenhum apontamento com esses filtros" : "Nenhuma inconsistência encontrada"}</strong><span>{issues.length ? "Ajuste a pesquisa ou o tipo selecionado." : "Os registros passaram nas verificações disponíveis."}</span></div>}
      <div className="quality-foot">Registros enviados sem data podem receber estimativa durante importações históricas. A origem e a precisão permanecem registradas para conferência.</div>
    </section>
  </div>;
}
