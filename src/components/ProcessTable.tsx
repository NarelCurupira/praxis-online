import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { daysUntil, localDatePart } from "../date";
import { actionLabel } from "../labels";
import type { MovementSortField, ProcessMovement, ProcessPermissions, TeamMember, WorkflowStatus } from "../types";

interface Props {
  records: ProcessMovement[];
  queueOnly?: boolean;
  currentUserId?: string;
  members?: TeamMember[];
  permissions: ProcessPermissions;
  onStatus: (id: number, status: WorkflowStatus, actionType?: string) => Promise<void>;
  onAction: (id: number, actionType: string) => Promise<void>;
  onAssignment: (id: number, assignedTo: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEdit: (record: ProcessMovement) => void;
  onExport: (bytes: number[]) => Promise<string>;
}

type TableFontSize = "small" | "normal" | "large";
type TableDensity = "compact" | "comfortable" | "spacious";

const statuses: WorkflowStatus[] = ["Recebido", "Em análise", "Minutado", "Enviado", "Sobrestado"];
const actions = ["Manifestação", "DI", "Diligência", "Prevenção", "Ciência", "CTRZ", "Recurso", "Sobrestamento", "Ratifico"];
const sortOptions: { value: MovementSortField; label: string }[] = [
  { value: "receivedAt", label: "Data de entrada" },
  { value: "deadlineAt", label: "Prazo" },
  { value: "judicialNumber", label: "Número judicial" },
  { value: "mpNumber", label: "Número MP" },
  { value: "className", label: "Classe" },
  { value: "actionType", label: "Providência" },
  { value: "workflowStatus", label: "Status" },
  { value: "assignedName", label: "Responsável" },
];

const FULL_DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "long", year: "numeric" });
const FULL_DATE_TIME = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function compactDate(value: string | null | undefined): string {
  const key = localDatePart(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "—";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function fullDateTitle(value: string | null | undefined, precise?: boolean): string {
  if (!value) return "Sem data informada";
  if (precise) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return FULL_DATE_TIME.format(date);
  }
  const key = localDatePart(value);
  if (!key) return String(value);
  const date = new Date(`${key}T12:00:00-03:00`);
  return `${FULL_DATE.format(date)}${precise === false ? " · horário não confirmado" : ""}`;
}

function shortMemberName(member: TeamMember | undefined): string {
  if (!member) return "Não atribuído";
  if (member.displayName?.trim()) return member.displayName.trim();
  const words = member.fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return member.email;
  if (words.length === 1) return words[0];
  return `${words[0]} ${words.at(-1)}`;
}

function defaultDirection(field: MovementSortField): "asc" | "desc" {
  if (field === "deadlineAt") return "asc";
  if (field === "receivedAt") return "desc";
  return "asc";
}

function directionLabels(field: MovementSortField): Array<{ value: "asc" | "desc"; label: string }> {
  if (field === "deadlineAt") return [
    { value: "asc", label: "Mais próximo primeiro" },
    { value: "desc", label: "Mais distante primeiro" },
  ];
  if (field === "receivedAt") return [
    { value: "desc", label: "Mais recentes primeiro" },
    { value: "asc", label: "Mais antigas primeiro" },
  ];
  return [
    { value: "asc", label: "A–Z / menor primeiro" },
    { value: "desc", label: "Z–A / maior primeiro" },
  ];
}

function excelRows(records: ProcessMovement[]) {
  return records.map((record) => ({
    "Nº MP": record.mpNumber,
    "Nº Judicial": record.judicialNumber,
    Classe: record.className,
    Assunto: record.subject,
    Entrada: record.receivedAt,
    Prazo: record.deadlineAt,
    Status: record.workflowStatus,
    Envio: record.sentAt ?? "",
    Providência: actionLabel(record.actionType),
    Prioridade: record.priority,
    "Observações internas": record.notes,
    Responsável: record.assignedName,
  }));
}

function readPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function ProcessTable({
  records,
  queueOnly = false,
  currentUserId = "",
  members = [],
  permissions,
  onStatus,
  onAction,
  onAssignment,
  onDelete,
  onEdit,
  onExport,
}: Props) {
  const preferencePrefix = `praxis-table-${currentUserId || "anonymous"}`;
  const [fontSize, setFontSize] = useState<TableFontSize>(() => readPreference(`${preferencePrefix}-font`, ["small", "normal", "large"] as const, "normal"));
  const [density, setDensity] = useState<TableDensity>(() => readPreference(`${preferencePrefix}-density`, ["compact", "comfortable", "spacious"] as const, "comfortable"));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [year, setYear] = useState("Todos");
  const [assignedTo, setAssignedTo] = useState("Todos");
  const [sortField, setSortField] = useState<MovementSortField>(queueOnly ? "deadlineAt" : "receivedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(queueOnly ? "asc" : "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [message, setMessage] = useState("");
  const [pendingSend, setPendingSend] = useState<ProcessMovement | null>(null);
  const [sendAction, setSendAction] = useState("");

  const memberById = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  const years = useMemo(() => [...new Set(records.map((record) => Number(localDatePart(record.receivedAt).slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a), [records]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    const selected = records.filter((record) => {
      if (queueOnly && (record.workflowStatus === "Enviado" || record.assignedTo !== currentUserId)) return false;
      if (status !== "Todos" && record.workflowStatus !== status) return false;
      if (year !== "Todos" && localDatePart(record.receivedAt).slice(0, 4) !== year) return false;
      if (!queueOnly && assignedTo !== "Todos" && record.assignedTo !== assignedTo) return false;
      return !normalizedQuery || `${record.mpNumber} ${record.judicialNumber} ${record.className} ${record.subject} ${record.actionType}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery);
    });

    return selected.sort((left, right) => {
      const leftValue = left[sortField];
      const rightValue = right[sortField];
      let comparison = 0;

      if (sortField === "receivedAt" || sortField === "deadlineAt") {
        const leftDate = String(leftValue ?? "");
        const rightDate = String(rightValue ?? "");
        if (!leftDate && rightDate) return 1;
        if (leftDate && !rightDate) return -1;
        comparison = new Date(leftDate).getTime() - new Date(rightDate).getTime();
      } else {
        comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
      }

      if (comparison === 0) comparison = left.movementId - right.movementId;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [records, queueOnly, currentUserId, status, year, assignedTo, query, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayed = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasActiveFilters = Boolean(query.trim() || status !== "Todos" || year !== "Todos" || (!queueOnly && assignedTo !== "Todos"));
  const isDefaultEmptyQueue = queueOnly && !hasActiveFilters;
  const columnCount = queueOnly ? 7 : 8;

  function saveFontSize(value: TableFontSize) {
    setFontSize(value);
    try { localStorage.setItem(`${preferencePrefix}-font`, value); } catch { /* Preferência não persistente. */ }
  }

  function saveDensity(value: TableDensity) {
    setDensity(value);
    try { localStorage.setItem(`${preferencePrefix}-density`, value); } catch { /* Preferência não persistente. */ }
  }

  function clearFilters() {
    setQuery("");
    setStatus("Todos");
    setYear("Todos");
    setAssignedTo("Todos");
    setPage(1);
  }

  function changeSortField(value: MovementSortField) {
    setSortField(value);
    setSortDirection(defaultDirection(value));
    setPage(1);
  }

  async function exportFiltered() {
    if (!permissions.canExport) return;
    setMessage("");
    try {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(excelRows(filtered)), "Processos filtrados");
      const bytes = Array.from(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
      setMessage(await onExport(bytes));
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function changeStatus(record: ProcessMovement, next: WorkflowStatus) {
    if (next === "Enviado" && !record.actionType.trim()) {
      setPendingSend(record);
      setSendAction("");
      return;
    }
    try { await onStatus(record.movementId, next); }
    catch (error) { setMessage(String(error)); }
  }

  async function confirmSend() {
    if (!pendingSend || !sendAction) return;
    try {
      await onStatus(pendingSend.movementId, "Enviado", sendAction);
      setPendingSend(null);
      setSendAction("");
    } catch (error) {
      setMessage(String(error));
    }
  }

  return <section className={`panel table-panel table-panel-v091 table-font-${fontSize} table-density-${density} ${queueOnly ? "queue-table-panel" : "processes-table-panel"}`}>
    <div className="table-display-controls">
      <div className="display-control-group"><span>Tamanho da letra</span><div role="group" aria-label="Tamanho da letra da tabela"><button type="button" className={fontSize === "small" ? "active" : ""} onClick={() => saveFontSize("small")}>A−</button><button type="button" className={fontSize === "normal" ? "active" : ""} onClick={() => saveFontSize("normal")}>A</button><button type="button" className={fontSize === "large" ? "active" : ""} onClick={() => saveFontSize("large")}>A+</button></div></div>
      <div className="display-control-group"><span>Densidade</span><div role="group" aria-label="Densidade das linhas"><button type="button" title="Compacta" className={density === "compact" ? "active" : ""} onClick={() => saveDensity("compact")}>≡</button><button type="button" title="Confortável" className={density === "comfortable" ? "active" : ""} onClick={() => saveDensity("comfortable")}>☰</button><button type="button" title="Espaçosa" className={density === "spacious" ? "active" : ""} onClick={() => saveDensity("spacious")}>☷</button></div></div>
    </div>

    <div className="table-toolbar table-toolbar-v091">
      <label className="filter-field search-filter"><span>Pesquisar</span><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Número, assunto, classe ou providência..." /></div></label>
      <label className="filter-field filter-compact"><span>Ano</span><select value={year} onChange={(event) => { setYear(event.target.value); setPage(1); }}><option value="Todos">Todos</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="filter-field filter-compact"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="Todos">Todos</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      {!queueOnly && <label className="filter-field responsible-filter"><span>Responsável</span><select value={assignedTo} onChange={(event) => { setAssignedTo(event.target.value); setPage(1); }}><option value="Todos">Todos</option>{members.map((member) => <option key={member.userId} value={member.userId}>{shortMemberName(member)}</option>)}</select></label>}
      <span className="toolbar-divider" aria-hidden="true" />
      <label className="filter-field sort-filter"><span>Ordenar por</span><select value={sortField} onChange={(event) => changeSortField(event.target.value as MovementSortField)}>{sortOptions.filter((option) => !queueOnly || option.value !== "assignedName").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="filter-field order-filter"><span>Ordem</span><select value={sortDirection} onChange={(event) => { setSortDirection(event.target.value as "asc" | "desc"); setPage(1); }}>{directionLabels(sortField).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <div className="toolbar-actions"><button type="button" className="button secondary clear-filters-button" disabled={!hasActiveFilters} onClick={clearFilters}>Limpar filtros</button>{permissions.canExport && <button type="button" className="button secondary" disabled={!filtered.length} onClick={exportFiltered}><Download size={16} />Exportar</button>}</div>
    </div>

    {hasActiveFilters && <div className="active-filter-chips" aria-label="Filtros ativos">
      {year !== "Todos" && <button type="button" onClick={() => { setYear("Todos"); setPage(1); }}>Ano: {year}<X size={13} /></button>}
      {status !== "Todos" && <button type="button" onClick={() => { setStatus("Todos"); setPage(1); }}>Status: {status}<X size={13} /></button>}
      {!queueOnly && assignedTo !== "Todos" && <button type="button" onClick={() => { setAssignedTo("Todos"); setPage(1); }}>Responsável: {shortMemberName(memberById.get(assignedTo))}<X size={13} /></button>}
      {query.trim() && <button type="button" onClick={() => { setQuery(""); setPage(1); }}>Pesquisa: “{query.trim()}”<X size={13} /></button>}
      <button type="button" className="clear-all-chip" onClick={clearFilters}>Limpar todos</button>
    </div>}

    {message && <div className="table-export-message">{message}</div>}

    <div className="table-scroll table-scroll-v091"><table className={`process-data-table ${queueOnly ? "queue-data-table" : "all-processes-data-table"}`}>
      <thead><tr><th className="col-process">Processo</th><th className="col-subject">Classe/assunto</th>{!queueOnly && <th className="col-assignee">Responsável</th>}<th className="col-date">Entrada</th><th className="col-deadline">Prazo</th><th className="col-action">Providência</th><th className="col-status">Status</th><th className="col-actions" /></tr></thead>
      <tbody>{displayed.length ? displayed.map((record) => {
        const remaining = daysUntil(record.deadlineAt);
        const actionOptions = [...new Set([record.actionType, ...actions].filter(Boolean))];
        const assignedMember = memberById.get(record.assignedTo);
        const assigneeLabel = assignedMember ? shortMemberName(assignedMember) : (record.assignedName || "Não atribuído");
        const deadlineDetail = record.workflowStatus === "Enviado"
          ? "concluído"
          : !record.deadlineAt
            ? "não aplicável"
            : remaining < 0
              ? `${Math.abs(remaining)} ${Math.abs(remaining) === 1 ? "dia vencido" : "dias vencidos"}`
              : remaining === 0
                ? "vence hoje"
                : `${remaining} ${remaining === 1 ? "dia" : "dias"}`;
        return <tr key={record.movementId}>
          <td className="col-process"><strong>{record.judicialNumber}</strong><span>{record.mpNumber}</span></td>
          <td className="subject-cell col-subject"><strong>{record.className}</strong><span title={record.subject}>{record.subject}</span></td>
          {!queueOnly && <td className="col-assignee">{permissions.canChangeAssignment ? <select className="assignee-select table-inline-select" aria-label={`Responsável por ${record.judicialNumber}`} title={assignedMember?.fullName || record.assignedName} value={record.assignedTo} onChange={(event) => onAssignment(record.movementId, event.target.value)}>{members.filter((member) => member.active || member.userId === record.assignedTo).map((member) => <option key={member.userId} value={member.userId}>{shortMemberName(member)}</option>)}</select> : <strong className="assignee-display" title={assignedMember?.fullName || record.assignedName}>{assigneeLabel}</strong>}</td>}
          <td className="compact-date col-date" title={fullDateTitle(record.receivedAt, Boolean(record.receivedTimePrecise))}>{compactDate(record.receivedAt)}</td>
          <td className="col-deadline"><strong className={remaining <= 3 && record.workflowStatus !== "Enviado" ? "danger-text" : ""} title={fullDateTitle(record.deadlineAt)}>{record.deadlineAt ? compactDate(record.deadlineAt) : "Sem prazo"}</strong><span className={remaining < 0 && record.workflowStatus !== "Enviado" ? "deadline-detail overdue" : "deadline-detail"}>{deadlineDetail}</span></td>
          <td className="col-action"><select disabled={!permissions.canEditWorkflow} className="action-select table-inline-select" aria-label="Providência" value={record.actionType} onChange={(event) => onAction(record.movementId, event.target.value)}><option value="">Definir...</option>{actionOptions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></td>
          <td className="col-status"><select disabled={!permissions.canEditWorkflow} className={`status-select table-inline-select status-${record.workflowStatus.toLowerCase().replace(" ", "-")}`} value={record.workflowStatus} onChange={(event) => changeStatus(record, event.target.value as WorkflowStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></td>
          <td className="col-actions"><div className="row-actions">{(permissions.canEditFull || permissions.canEditNotes) && <button type="button" className="icon-button" title="Editar registro" onClick={() => onEdit(record)}><Pencil size={16} /></button>}{permissions.canDelete && <button type="button" className="icon-button danger" title="Mover para a lixeira" onClick={() => confirm("Mover este registro para a lixeira?") && onDelete(record.movementId)}><Trash2 size={16} /></button>}</div></td>
        </tr>;
      }) : <tr><td colSpan={columnCount}><div className="table-empty-state"><Search size={28} /><strong>{isDefaultEmptyQueue ? "Sua fila está em dia" : "Nenhum processo encontrado"}</strong><span>{isDefaultEmptyQueue ? "Não há processos pendentes atribuídos a você." : "Revise ou limpe os filtros para ampliar a pesquisa."}</span>{hasActiveFilters && <button type="button" className="button secondary" onClick={clearFilters}>Limpar filtros</button>}</div></td></tr>}</tbody>
    </table></div>

    {filtered.length > 0 && <div className="table-pagination table-pagination-v091">
      <span className="pagination-summary">{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} de {filtered.length.toLocaleString("pt-BR")} registros</span>
      <div className="pagination-controls"><label>Por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={30}>30</option><option value={50}>50</option><option value={100}>100</option></select></label><div className="pagination-buttons"><button type="button" className="icon-button" title="Primeira página" disabled={safePage <= 1} onClick={() => setPage(1)}><ChevronsLeft size={18} /></button><button type="button" className="icon-button" title="Página anterior" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={18} /></button><span>Página <strong>{safePage}</strong> de <strong>{totalPages}</strong></span><button type="button" className="icon-button" title="Próxima página" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight size={18} /></button><button type="button" className="icon-button" title="Última página" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight size={18} /></button></div></div>
    </div>}

    {pendingSend && <div className="modal-backdrop"><div className="modal send-action-modal"><div className="modal-head"><div><p className="eyebrow">Providência obrigatória</p><h2>Defina antes de enviar</h2></div><button type="button" className="icon-button" onClick={() => setPendingSend(null)}><X size={18} /></button></div><label>Providência<select value={sendAction} onChange={(event) => setSendAction(event.target.value)}><option value="">Escolha...</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setPendingSend(null)}>Cancelar</button><button type="button" className="button primary" disabled={!sendAction} onClick={confirmSend}>Confirmar envio</button></div></div></div>}
  </section>;
}
