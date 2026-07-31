import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Gavel,
  Maximize2,
  Minimize2,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { daysUntil, localDatePart } from "../date";
import { actionLabel } from "../labels";
import { hapticFeedback } from "../mobileInteractions";
import type { MovementSortField, ProcessListPreset, ProcessMovement, ProcessPermissions, TeamMember, WorkflowStatus } from "../types";
import { CopyButton } from "./CopyButton";

interface Props {
  records: ProcessMovement[];
  queueOnly?: boolean;
  currentUserId?: string;
  members?: TeamMember[];
  permissions: ProcessPermissions;
  focusMode?: boolean;
  preset?: ProcessListPreset | null;
  onClearPreset?: () => void;
  onToggleFocusMode?: () => void;
  onStatus: (id: number, status: WorkflowStatus, actionType?: string) => Promise<void>;
  onAction: (id: number, actionType: string) => Promise<void>;
  onAssignment: (id: number, assignedTo: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onBulkAssignment: (ids: number[], assignedTo: string) => Promise<void>;
  onBulkAction: (ids: number[], actionType: string) => Promise<void>;
  onBulkArchive: (ids: number[]) => Promise<void>;
  onBulkDelete: (ids: number[]) => Promise<void>;
  onEdit: (record: ProcessMovement) => void;
  onExport: (bytes: number[]) => Promise<string>;
}

type TableDensity = "compact" | "comfortable" | "spacious";
type HighlightFilter = "Todos" | "Relevância social" | "Alta complexidade" | "Ambos";
type OptionalColumn = "subject" | "assignee" | "receivedAt" | "deadlineAt" | "action" | "status";

const statuses: WorkflowStatus[] = ["Recebido", "Em análise", "Minutado", "Enviado", "Sobrestado"];
const actions = ["Manifestação", "DI", "Diligência", "Prevenção", "Suspeição", "Ciência", "CTRZ", "Recurso", "Sobrestamento", "Ratifico"];
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
const optionalColumnOptions: Array<{ key: OptionalColumn; label: string; queue: boolean }> = [
  { key: "subject", label: "Classe e assunto", queue: true },
  { key: "assignee", label: "Responsável", queue: false },
  { key: "receivedAt", label: "Entrada", queue: true },
  { key: "deadlineAt", label: "Prazo", queue: true },
  { key: "action", label: "Providência", queue: true },
  { key: "status", label: "Status", queue: true },
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

function highlightLabel(value: HighlightFilter): string {
  if (value === "Ambos") return "Ambas as classificações";
  return value;
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
    "Prioridade processual": record.proceduralPriority ?? "Nenhuma",
    "Observações internas": record.notes,
    "Relevância social": record.sociallyRelevant ? "Sim" : "Não",
    "Alta complexidade": record.extremelyComplex ? "Sim" : "Não",
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

function readColumnPreference(key: string, allowed: OptionalColumn[]): OptionalColumn[] {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    if (!Array.isArray(stored)) return allowed;
    const selected = stored.filter((item): item is OptionalColumn => typeof item === "string" && allowed.includes(item as OptionalColumn));
    return [...new Set(selected)];
  } catch {
    return allowed;
  }
}

export function ProcessTable({
  records,
  queueOnly = false,
  currentUserId = "",
  members = [],
  permissions,
  focusMode = false,
  preset = null,
  onClearPreset,
  onToggleFocusMode,
  onStatus,
  onAction,
  onAssignment,
  onDelete,
  onBulkAssignment,
  onBulkAction,
  onBulkArchive,
  onBulkDelete,
  onEdit,
  onExport,
}: Props) {
  const preferencePrefix = `praxis-table-${currentUserId || "anonymous"}`;
  const columnPreferenceKey = `${preferencePrefix}-${queueOnly ? "queue" : "processes"}-columns`;
  const allowedColumns = useMemo(() => optionalColumnOptions.filter((column) => !queueOnly || column.queue).map((column) => column.key), [queueOnly]);
  const [density, setDensity] = useState<TableDensity>(() => readPreference(`${preferencePrefix}-density`, ["compact", "comfortable", "spacious"] as const, "comfortable"));
  const [visibleColumns, setVisibleColumns] = useState<OptionalColumn[]>(() => readColumnPreference(columnPreferenceKey, allowedColumns));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [year, setYear] = useState("Todos");
  const [assignedTo, setAssignedTo] = useState("Todos");
  const [highlight, setHighlight] = useState<HighlightFilter>("Todos");
  const [sortField, setSortField] = useState<MovementSortField>(queueOnly ? "deadlineAt" : "receivedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(queueOnly ? "asc" : "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [message, setMessage] = useState("");
  const [pendingSend, setPendingSend] = useState<ProcessMovement | null>(null);
  const [sendAction, setSendAction] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const memberById = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  const years = useMemo(() => [...new Set(records.map((record) => Number(localDatePart(record.receivedAt).slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a), [records]);
  const showColumn = (column: OptionalColumn) => visibleColumns.includes(column) && (!queueOnly || column !== "assignee");
  const canSelect = permissions.canChangeAssignment || permissions.canEditWorkflow || permissions.canExport || permissions.canDelete;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    const selected = records.filter((record) => {
      if (queueOnly && (record.workflowStatus === "Enviado" || record.assignedTo !== currentUserId || record.archivedAt)) return false;
      if (!queueOnly && status === "Arquivados" && !record.archivedAt) return false;
      if (!queueOnly && status !== "Arquivados" && record.archivedAt) return false;
      if (status === "Em andamento" && record.workflowStatus === "Enviado") return false;
      if (status !== "Todos" && status !== "Em andamento" && status !== "Arquivados" && record.workflowStatus !== status) return false;
      if (!queueOnly && year !== "Todos" && localDatePart(record.receivedAt).slice(0, 4) !== year) return false;
      if (!queueOnly && assignedTo !== "Todos" && record.assignedTo !== assignedTo) return false;
      if (!queueOnly && highlight === "Relevância social" && !record.sociallyRelevant) return false;
      if (!queueOnly && highlight === "Alta complexidade" && !record.extremelyComplex) return false;
      if (!queueOnly && highlight === "Ambos" && !(record.sociallyRelevant && record.extremelyComplex)) return false;
      if (preset?.assignedTo && record.assignedTo !== preset.assignedTo) return false;
      if (preset?.kind === "pending" && record.workflowStatus === "Enviado") return false;
      if (preset?.kind === "overdue" && (record.workflowStatus === "Enviado" || !record.deadlineAt || daysUntil(record.deadlineAt) >= 0)) return false;
      if (preset?.kind === "sent-today" && (!record.sentAt || localDatePart(record.sentAt) !== localDatePart(new Date().toISOString()))) return false;
      if (preset?.kind === "sent-week") {
        if (!record.sentAt) return false;
        const today = new Date();
        const weekStart = new Date(today);
        const weekday = (today.getDay() + 6) % 7;
        weekStart.setDate(today.getDate() - weekday);
        weekStart.setHours(0, 0, 0, 0);
        if (new Date(record.sentAt) < weekStart) return false;
      }
      if (preset?.kind === "month") {
        const received = new Date(record.receivedAt);
        if (received.getFullYear() !== preset.year || received.getMonth() !== preset.month) return false;
      }
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
  }, [records, queueOnly, currentUserId, status, year, assignedTo, highlight, query, sortField, sortDirection, preset]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayed = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasActiveFilters = Boolean(
    query.trim()
    || status !== "Todos"
    || (!queueOnly && year !== "Todos")
    || (!queueOnly && assignedTo !== "Todos")
    || (!queueOnly && highlight !== "Todos")
    || preset
  );
  const isDefaultEmptyQueue = queueOnly && !hasActiveFilters;
  const columnCount = 2 + allowedColumns.filter(showColumn).length + (canSelect ? 1 : 0);
  const selectedRecords = useMemo(() => records.filter((record) => selected.has(record.movementId)), [records, selected]);
  const displayedIds = displayed.map((record) => record.movementId);
  const displayedSelected = displayedIds.length > 0 && displayedIds.every((id) => selected.has(id));

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [preset]);

  useEffect(() => {
    const available = new Set(records.map((record) => record.movementId));
    setSelected((current) => new Set([...current].filter((id) => available.has(id))));
  }, [records]);

  function saveDensity(value: TableDensity) {
    setDensity(value);
    try { localStorage.setItem(`${preferencePrefix}-density`, value); } catch { /* Preferência não persistente. */ }
  }

  function toggleColumn(column: OptionalColumn) {
    setVisibleColumns((current) => {
      const next = current.includes(column) ? current.filter((item) => item !== column) : [...current, column];
      try { localStorage.setItem(columnPreferenceKey, JSON.stringify(next)); } catch { /* Preferência não persistente. */ }
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setStatus("Todos");
    setYear("Todos");
    setAssignedTo("Todos");
    setHighlight("Todos");
    setPage(1);
    onClearPreset?.();
  }

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleDisplayed() {
    setSelected((current) => {
      const next = new Set(current);
      displayedIds.forEach((id) => displayedSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function exportSelection() {
    if (!permissions.canExport || !selectedRecords.length) return;
    setBulkBusy(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(excelRows(selectedRecords)), "Processos selecionados");
      const bytes = Array.from(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
      setMessage(await onExport(bytes));
      hapticFeedback("success");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulk(kind: "assignment" | "action", value: string) {
    if (!value || !selected.size) return;
    setBulkBusy(true);
    try {
      if (kind === "assignment") await onBulkAssignment([...selected], value);
      else await onBulkAction([...selected], value);
      setMessage(`${selected.size} processo(s) atualizado(s).`);
      setSelected(new Set());
      hapticFeedback("success");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyDestructive(kind: "archive" | "delete") {
    if (!selected.size) return;
    const verb = kind === "archive" ? "arquivar" : "mover para a lixeira";
    if (!confirm(`Deseja ${verb} ${selected.size} processo(s) selecionado(s)?`)) return;
    setBulkBusy(true);
    try {
      if (kind === "archive") await onBulkArchive([...selected]);
      else await onBulkDelete([...selected]);
      setMessage(`${selected.size} processo(s) ${kind === "archive" ? "arquivado(s)" : "movido(s) para a lixeira"}.`);
      setSelected(new Set());
      hapticFeedback("success");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBulkBusy(false);
    }
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
      const XLSX = await import("xlsx");
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

  return <section className={`panel table-panel table-panel-v091 table-panel-v092 table-density-${density} ${queueOnly ? "queue-table-panel" : "processes-table-panel"}`}>
    <div className="table-display-controls table-display-controls-v092">
      <div className="table-display-preferences">
        <div className="display-control-group"><span>Densidade</span><div role="group" aria-label="Densidade das linhas"><button type="button" title="Compacta" className={density === "compact" ? "active" : ""} onClick={() => saveDensity("compact")}>≡</button><button type="button" title="Confortável" className={density === "comfortable" ? "active" : ""} onClick={() => saveDensity("comfortable")}>☰</button><button type="button" title="Espaçosa" className={density === "spacious" ? "active" : ""} onClick={() => saveDensity("spacious")}>☷</button></div></div>
      </div>
      <div className="table-view-actions">
        <details className="column-picker"><summary><SlidersHorizontal size={16} />Colunas</summary><div>{optionalColumnOptions.filter((column) => !queueOnly || column.queue).map((column) => <label key={column.key}><input type="checkbox" checked={showColumn(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}</div></details>
        {onToggleFocusMode && <button type="button" className="button secondary focus-mode-button" onClick={onToggleFocusMode}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{focusMode ? "Sair do foco" : "Expandir tabela"}</button>}
      </div>
    </div>

    {!queueOnly && <div className="table-quick-views" role="group" aria-label="Atalhos de visualização"><span>Visualização rápida</span><button type="button" className={status === "Em andamento" ? "active" : ""} onClick={() => { setStatus("Em andamento"); setPage(1); }}>Em andamento</button><button type="button" className={status === "Enviado" ? "active" : ""} onClick={() => { setStatus("Enviado"); setPage(1); }}>Enviados</button><button type="button" className={status === "Todos" ? "active" : ""} onClick={() => { setStatus("Todos"); setPage(1); }}>Todos</button></div>}

    <div className="table-toolbar table-toolbar-v091 table-toolbar-v092">
      <div className="table-toolbar-row table-filter-row">
        <label className="filter-field search-filter"><span>Pesquisar</span><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Número, assunto, classe ou providência..." /></div></label>
        {!queueOnly && <label className="filter-field filter-compact"><span>Ano</span><select value={year} onChange={(event) => { setYear(event.target.value); setPage(1); }}><option value="Todos">Todos</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        {!queueOnly && <label className="filter-field responsible-filter"><span>Responsável</span><select value={assignedTo} onChange={(event) => { setAssignedTo(event.target.value); setPage(1); }}><option value="Todos">Todos</option>{members.map((member) => <option key={member.userId} value={member.userId}>{shortMemberName(member)}</option>)}</select></label>}
        <label className="filter-field filter-compact status-filter"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="Todos">Todos</option><option value="Em andamento">Em andamento</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}{!queueOnly && <option value="Arquivados">Arquivados</option>}</select></label>
        {!queueOnly && <label className="filter-field highlight-filter"><span>Destacados</span><select value={highlight} onChange={(event) => { setHighlight(event.target.value as HighlightFilter); setPage(1); }}><option value="Todos">Todos</option><option value="Relevância social">Relevância social</option><option value="Alta complexidade">Alta complexidade</option><option value="Ambos">Ambas as classificações</option></select></label>}
      </div>
      <div className="table-toolbar-row table-sort-row">
        <span className="toolbar-section-label">Organização</span>
        <label className="filter-field sort-filter"><span>Ordenar por</span><select value={sortField} onChange={(event) => changeSortField(event.target.value as MovementSortField)}>{sortOptions.filter((option) => !queueOnly || option.value !== "assignedName").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="filter-field order-filter"><span>Ordem</span><select value={sortDirection} onChange={(event) => { setSortDirection(event.target.value as "asc" | "desc"); setPage(1); }}>{directionLabels(sortField).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div className="toolbar-actions"><button type="button" className="button secondary clear-filters-button" disabled={!hasActiveFilters} onClick={clearFilters}>Limpar filtros</button>{permissions.canExport && <button type="button" className="button secondary" disabled={!filtered.length} onClick={exportFiltered}><Download size={16} />Exportar</button>}</div>
      </div>
    </div>

    {hasActiveFilters && <div className="active-filter-chips" aria-label="Filtros ativos">
      {preset && <button type="button" onClick={onClearPreset}>Atalho: {preset.label}<X size={13} /></button>}
      {!queueOnly && year !== "Todos" && <button type="button" onClick={() => { setYear("Todos"); setPage(1); }}>Ano: {year}<X size={13} /></button>}
      {status !== "Todos" && <button type="button" onClick={() => { setStatus("Todos"); setPage(1); }}>Status: {status}<X size={13} /></button>}
      {!queueOnly && assignedTo !== "Todos" && <button type="button" onClick={() => { setAssignedTo("Todos"); setPage(1); }}>Responsável: {shortMemberName(memberById.get(assignedTo))}<X size={13} /></button>}
      {!queueOnly && highlight !== "Todos" && <button type="button" onClick={() => { setHighlight("Todos"); setPage(1); }}>Destacados: {highlightLabel(highlight)}<X size={13} /></button>}
      {query.trim() && <button type="button" onClick={() => { setQuery(""); setPage(1); }}>Pesquisa: “{query.trim()}”<X size={13} /></button>}
      <button type="button" className="clear-all-chip" onClick={clearFilters}>Limpar todos</button>
    </div>}

    {message && <div className="table-export-message">{message}</div>}

    <div className="table-scroll table-scroll-v091 table-scroll-v092"><table className={`process-data-table ${queueOnly ? "queue-data-table" : "all-processes-data-table"}`}>
      <thead><tr>{canSelect && <th className="col-select"><input type="checkbox" aria-label="Selecionar processos desta página" checked={displayedSelected} onChange={toggleDisplayed} /></th>}<th className="col-process">Processo</th>{showColumn("subject") && <th className="col-subject">Classe/assunto</th>}{showColumn("assignee") && <th className="col-assignee">Responsável</th>}{showColumn("receivedAt") && <th className="col-date">Entrada</th>}{showColumn("deadlineAt") && <th className="col-deadline">Prazo</th>}{showColumn("action") && <th className="col-action">Providência</th>}{showColumn("status") && <th className="col-status">Status</th>}<th className="col-actions" /></tr></thead>
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
        return <tr key={record.movementId} className={selected.has(record.movementId) ? "selected-row" : ""}>
          {canSelect && <td className="col-select"><input type="checkbox" aria-label={`Selecionar ${record.judicialNumber}`} checked={selected.has(record.movementId)} onChange={() => toggleSelected(record.movementId)} /></td>}
          <td className="col-process"><div className="number-copy-line"><strong>{record.judicialNumber}</strong><CopyButton value={record.judicialNumber} label="Copiar número judicial" /></div><div className="number-copy-line secondary-number"><span>{record.mpNumber}</span><CopyButton value={record.mpNumber} label="Copiar número MP" /></div></td>
          {showColumn("subject") && <td className="subject-cell col-subject"><strong>{record.className}</strong><span title={record.subject}>{record.subject}</span>{(record.sociallyRelevant || record.extremelyComplex) && <div className="classification-badges">{record.sociallyRelevant && <b className="classification-badge social">Relevância social</b>}{record.extremelyComplex && <b className="classification-badge complex">Alta complexidade</b>}</div>}</td>}
          {showColumn("assignee") && <td className="col-assignee">{permissions.canChangeAssignment ? <select className="assignee-select table-inline-select" aria-label={`Responsável por ${record.judicialNumber}`} title={assignedMember?.fullName || record.assignedName} value={record.assignedTo} onChange={(event) => onAssignment(record.movementId, event.target.value)}>{members.filter((member) => member.active || member.userId === record.assignedTo).map((member) => <option key={member.userId} value={member.userId}>{shortMemberName(member)}</option>)}</select> : <strong className="assignee-display" title={assignedMember?.fullName || record.assignedName}>{assigneeLabel}</strong>}</td>}
          {showColumn("receivedAt") && <td className="compact-date col-date" title={fullDateTitle(record.receivedAt, Boolean(record.receivedTimePrecise))}>{compactDate(record.receivedAt)}</td>}
          {showColumn("deadlineAt") && <td className="col-deadline"><strong className={remaining < 5 && record.workflowStatus !== "Enviado" ? "deadline-urgent" : ""} title={fullDateTitle(record.deadlineAt)}>{record.deadlineAt ? compactDate(record.deadlineAt) : "Sem prazo"}</strong><span className={remaining < 0 && record.workflowStatus !== "Enviado" ? "deadline-detail overdue" : "deadline-detail"}>{deadlineDetail}</span></td>}
          {showColumn("action") && <td className="col-action"><select disabled={!permissions.canEditWorkflow} className="action-select table-inline-select table-pill-select" aria-label="Providência" title={actionLabel(record.actionType)} value={record.actionType} onChange={(event) => onAction(record.movementId, event.target.value)}><option value="">Definir...</option>{actionOptions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></td>}
          {showColumn("status") && <td className="col-status"><select disabled={!permissions.canEditWorkflow} className={`status-select table-inline-select table-pill-select status-${record.workflowStatus.toLowerCase().replace(" ", "-")}`} value={record.workflowStatus} onChange={(event) => changeStatus(record, event.target.value as WorkflowStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></td>}
          <td className="col-actions"><div className="row-actions">{(permissions.canEditFull || permissions.canEditNotes) && <button type="button" className="icon-button" title="Editar registro" onClick={() => onEdit(record)}><Pencil size={16} /></button>}{permissions.canDelete && <button type="button" className="icon-button danger" title="Mover para a lixeira" onClick={() => confirm("Mover este registro para a lixeira?") && onDelete(record.movementId)}><Trash2 size={16} /></button>}</div></td>
        </tr>;
      }) : <tr><td colSpan={columnCount}><div className="table-empty-state"><Search size={28} /><strong>{isDefaultEmptyQueue ? "Sua fila está em dia" : "Nenhum processo encontrado"}</strong><span>{isDefaultEmptyQueue ? "Não há processos pendentes atribuídos a você." : "Revise ou limpe os filtros para ampliar a pesquisa."}</span>{hasActiveFilters && <button type="button" className="button secondary" onClick={clearFilters}>Limpar filtros</button>}</div></td></tr>}</tbody>
    </table></div>

    {filtered.length > 0 && <div className="table-pagination table-pagination-v091">
      <span className="pagination-summary">{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} de {filtered.length.toLocaleString("pt-BR")} registros</span>
      <div className="pagination-controls"><label>Por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={30}>30</option><option value={50}>50</option><option value={100}>100</option></select></label><div className="pagination-buttons"><button type="button" className="icon-button" title="Primeira página" disabled={safePage <= 1} onClick={() => setPage(1)}><ChevronsLeft size={18} /></button><button type="button" className="icon-button" title="Página anterior" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={18} /></button><span>Página <strong>{safePage}</strong> de <strong>{totalPages}</strong></span><button type="button" className="icon-button" title="Próxima página" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight size={18} /></button><button type="button" className="icon-button" title="Última página" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight size={18} /></button></div></div>
    </div>}

    {selected.size > 0 && <div className="bulk-action-bar" role="region" aria-label="Ações para processos selecionados">
      <strong className="bulk-selection-count">{selected.size}<span> selecionado(s)</span></strong>
      {permissions.canChangeAssignment && <label className="bulk-action-select"><UserRound size={18} /><span>Responsável</span><select aria-label="Alterar responsável dos selecionados" defaultValue="" disabled={bulkBusy} onChange={(event) => { const value = event.target.value; event.currentTarget.value = ""; void applyBulk("assignment", value); }}><option value="">Escolher...</option>{members.filter((member) => member.active).map((member) => <option key={member.userId} value={member.userId}>{shortMemberName(member)}</option>)}</select></label>}
      {permissions.canEditWorkflow && <label className="bulk-action-select"><Gavel size={18} /><span>Intervenção</span><select aria-label="Alterar intervenção dos selecionados" defaultValue="" disabled={bulkBusy} onChange={(event) => { const value = event.target.value; event.currentTarget.value = ""; void applyBulk("action", value); }}><option value="">Escolher...</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></label>}
      {permissions.canExport && <button type="button" disabled={bulkBusy} onClick={exportSelection}><Download size={18} /><span>Exportar</span></button>}
      {permissions.canDelete && <button type="button" disabled={bulkBusy} onClick={() => applyDestructive("archive")}><Archive size={18} /><span>Arquivar</span></button>}
      {permissions.canDelete && <button type="button" className="danger" disabled={bulkBusy} onClick={() => applyDestructive("delete")}><Trash2 size={18} /><span>Excluir</span></button>}
      <button type="button" className="bulk-close" aria-label="Limpar seleção" onClick={() => setSelected(new Set())}><X size={18} /></button>
    </div>}

    {pendingSend && <div className="modal-backdrop"><div className="modal send-action-modal"><div className="modal-head"><div><p className="eyebrow">Providência obrigatória</p><h2>Defina antes de enviar</h2></div><button type="button" className="icon-button" onClick={() => setPendingSend(null)}><X size={18} /></button></div><label>Providência<select value={sendAction} onChange={(event) => setSendAction(event.target.value)}><option value="">Escolha...</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setPendingSend(null)}>Cancelar</button><button type="button" className="button primary" disabled={!sendAction} onClick={confirmSend}>Confirmar envio</button></div></div></div>}
  </section>;
}
