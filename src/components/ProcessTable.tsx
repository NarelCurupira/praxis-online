import { ChevronLeft, ChevronRight, Download, Pencil, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { listFilteredMovements, listMovementPage } from "../api";
import { daysUntil, formatDate } from "../date";
import { actionLabel } from "../labels";
import type { MovementQuery, MovementSortField, ProcessMovement, TeamMember, WorkflowStatus } from "../types";

interface Props {
  records: ProcessMovement[];
  queueOnly?: boolean;
  serverPagination?: boolean;
  refreshKey?: number;
  currentUserId?: string;
  members?: TeamMember[];
  canWrite?: boolean;
  onStatus: (id: number, status: WorkflowStatus, actionType?: string) => Promise<void>;
  onAction: (id: number, actionType: string) => Promise<void>;
  onAssignment: (id: number, assignedTo: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEdit: (record: ProcessMovement) => void;
  onExport: (bytes: number[]) => Promise<string>;
}

const statuses: WorkflowStatus[] = ["Recebido", "Em análise", "Minutado", "Enviado", "Sobrestado"];
const actions = ["Manifestação", "DI", "Diligência", "Prevenção", "Ciência", "CTRZ", "Recurso", "Sobrestamento", "Ratifico"];
const sortOptions: { value: MovementSortField; label: string }[] = [
  { value: "receivedAt", label: "Data de entrada" }, { value: "deadlineAt", label: "Prazo" },
  { value: "judicialNumber", label: "Número judicial" }, { value: "mpNumber", label: "Número MP" },
  { value: "className", label: "Classe" }, { value: "actionType", label: "Providência" },
  { value: "workflowStatus", label: "Status" },
  { value: "assignedName", label: "Responsável" },
];

function localFiltered(records: ProcessMovement[], filters: MovementQuery, currentUserId = ""): ProcessMovement[] {
  return records.filter((record) => {
    if (filters.queueOnly && (record.workflowStatus === "Enviado" || record.assignedTo !== currentUserId)) return false;
    if (filters.status !== "Todos" && record.workflowStatus !== filters.status) return false;
    if (filters.year !== "Todos" && new Date(record.receivedAt).getFullYear() !== Number(filters.year)) return false;
    if (filters.classification === "Relevância social" && !record.sociallyRelevant) return false;
    if (filters.classification === "Alta complexidade" && !record.extremelyComplex) return false;
    if (filters.classification === "Ambos" && !(record.sociallyRelevant && record.extremelyComplex)) return false;
    if (filters.assignedTo === "Sem responsável" && record.assignedTo) return false;
    if (filters.assignedTo && filters.assignedTo !== "Todos" && filters.assignedTo !== "Sem responsável" && record.assignedTo !== filters.assignedTo) return false;
    const haystack = `${record.mpNumber} ${record.judicialNumber} ${record.className} ${record.subject} ${record.actionType} ${actionLabel(record.actionType)}`.toLowerCase();
    return haystack.includes(filters.query.toLowerCase());
  }).sort((a, b) => {
    const field = filters.sortField;
    let comparison = field === "receivedAt" || field === "deadlineAt"
      ? new Date(a[field]).getTime() - new Date(b[field]).getTime()
      : String(a[field]).localeCompare(String(b[field]), "pt-BR", { numeric: true, sensitivity: "base" });
    if (comparison === 0) comparison = a.movementId - b.movementId;
    return filters.sortDirection === "asc" ? comparison : -comparison;
  });
}

function excelRows(records: ProcessMovement[]) {
  return records.map((record) => ({
    "Nº MP": record.mpNumber, "Nº Judicial": record.judicialNumber, "Classe": record.className,
    "Assunto": record.subject, "Entrada": record.receivedAt, "Prazo": record.deadlineAt,
    "Minuta": record.draftStatus, "Status": record.workflowStatus, "Envio": record.sentAt ?? "",
    "Providência": actionLabel(record.actionType), "Prioridade": record.priority, "Observações": record.notes,
    "Documento": record.documentPath, "Relevância social": record.sociallyRelevant ? "Sim" : "Não",
    "Alta complexidade": record.extremelyComplex ? "Sim" : "Não", "Tema social": record.socialTheme,
    "Justificativa da relevância": record.relevanceReason, "Direito fundamental": record.fundamentalRight,
    "Grupo afetado": record.affectedGroup, "Alcance": record.reach, "Abrangência territorial": record.territorialScope,
    "Tipo de impacto": record.impactType, "Impacto social esperado": record.socialResult,
    "ODS da ONU": record.sdgs.join("; "),
    "Justificativa da complexidade": record.complexityReason,
    "Responsável": record.assignedName,
  }));
}

export function ProcessTable({ records, queueOnly = false, serverPagination = false, refreshKey = 0, currentUserId = "", members = [], canWrite = true, onStatus, onAction, onAssignment, onDelete, onEdit, onExport }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [year, setYear] = useState("Todos");
  const [classification, setClassification] = useState("Todos");
  const [assignedTo, setAssignedTo] = useState("Todos");
  const [sortField, setSortField] = useState<MovementSortField>(queueOnly ? "deadlineAt" : "receivedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(queueOnly ? "asc" : "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [pagedRecords, setPagedRecords] = useState<ProcessMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [serverYears, setServerYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingSend, setPendingSend] = useState<ProcessMovement | null>(null);
  const [sendAction, setSendAction] = useState("");
  const filters = useMemo<MovementQuery>(() => ({ page, pageSize, query, status, year, classification, assignedTo, sortField, sortDirection, queueOnly }), [page, pageSize, query, status, year, classification, assignedTo, sortField, sortDirection, queueOnly]);
  const filtered = useMemo(() => serverPagination ? [] : localFiltered(records, filters, currentUserId), [serverPagination, records, filters, currentUserId]);
  const localYears = useMemo(() => [...new Set(records.map((record) => new Date(record.receivedAt).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a), [records]);
  const years = serverPagination ? serverYears : localYears;
  const displayed = serverPagination ? pagedRecords : filtered.slice((page - 1) * pageSize, page * pageSize);
  const resultTotal = serverPagination ? total : filtered.length;
  const totalPages = Math.max(1, Math.ceil(resultTotal / pageSize));

  useEffect(() => {
    if (!serverPagination) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true); setMessage("");
      try {
        const result = await listMovementPage(filters);
        if (cancelled) return;
        setPagedRecords(result.records); setTotal(result.total); setServerYears(result.years);
        const pages = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > pages) setPage(pages);
      } catch (error) { if (!cancelled) setMessage(`Não foi possível carregar os processos: ${String(error)}`); }
      finally { if (!cancelled) setLoading(false); }
    }, query ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [serverPagination, filters, refreshKey, page, pageSize, query]);

  useEffect(() => {
    if (!serverPagination && page > totalPages) setPage(totalPages);
  }, [serverPagination, page, totalPages]);

  function resetPage() { setPage(1); }

  async function exportFiltered() {
    setExporting(true); setMessage("");
    try {
      const selected = serverPagination ? await listFilteredMovements({ ...filters, page: 1 }) : filtered;
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(excelRows(selected)), "Processos filtrados");
      const bytes = Array.from(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
      setMessage(await onExport(bytes));
    } catch (error) { setMessage(`Não foi possível exportar: ${String(error)}`); }
    finally { setExporting(false); }
  }

  async function changeAction(record: ProcessMovement, actionType: string) {
    setMessage("");
    try { await onAction(record.movementId, actionType); }
    catch (error) { setMessage(String(error)); }
  }

  async function changeAssignment(record: ProcessMovement, userId: string) {
    setMessage("");
    try { await onAssignment(record.movementId, userId); }
    catch (error) { setMessage(`Não foi possível alterar o responsável: ${String(error)}`); }
  }

  async function changeStatus(record: ProcessMovement, next: WorkflowStatus) {
    if (next === "Enviado" && record.assignedTo && record.assignedTo !== currentUserId && !confirm(`Este processo está atribuído a ${record.assignedName || "outro usuário"}. Confirma o envio mesmo assim?`)) return;
    if (next === "Enviado" && !record.actionType.trim()) { setPendingSend(record); setSendAction(""); return; }
    setMessage("");
    try { await onStatus(record.movementId, next); }
    catch (error) { setMessage(String(error)); }
  }

  async function confirmSend() {
    if (!pendingSend || !sendAction) return;
    setMessage("");
    try { await onStatus(pendingSend.movementId, "Enviado", sendAction); setPendingSend(null); setSendAction(""); }
    catch (error) { setMessage(String(error)); }
  }

  const start = resultTotal ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, resultTotal);

  return <section className="panel table-panel">
    <div className="table-toolbar">
      <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} placeholder="Pesquisar número, assunto ou classe..." /></div>
      <select value={year} onChange={(e) => { setYear(e.target.value); resetPage(); }}><option>Todos</option>{years.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}><option>Todos</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Classificação especial" value={classification} onChange={(e) => { setClassification(e.target.value); resetPage(); }}><option>Todos</option><option>Relevância social</option><option>Alta complexidade</option><option>Ambos</option></select>
      {!queueOnly && <select aria-label="Filtrar por responsável" value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); resetPage(); }}><option value="Todos">Todos os responsáveis</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}{member.active ? "" : " (inativo)"}</option>)}<option value="Sem responsável">Sem responsável</option></select>}
      <select aria-label="Ordenar por" value={sortField} onChange={(e) => { setSortField(e.target.value as MovementSortField); resetPage(); }}>{sortOptions.map((item) => <option key={item.value} value={item.value}>Ordenar: {item.label}</option>)}</select>
      <select aria-label="Direção da ordenação" value={sortDirection} onChange={(e) => { setSortDirection(e.target.value as "asc" | "desc"); resetPage(); }}><option value="desc">Decrescente</option><option value="asc">Crescente</option></select>
      <button className="button secondary filtered-export" disabled={exporting || !resultTotal} onClick={exportFiltered}><Download size={16} />{exporting ? "Exportando..." : "Exportar filtrados"}</button>
    </div>
    {message && <div className="table-export-message">{message}</div>}
    <div className="table-scroll"><table>
      <thead><tr><th>Processo</th><th>Classe/assunto</th><th>Responsável</th><th>Entrada</th><th>Prazo</th><th>Providência</th><th>Status</th><th /></tr></thead>
      <tbody>{displayed.map((record) => {
        const remaining = daysUntil(record.deadlineAt);
        const actionOptions = [...new Set([record.actionType, ...actions].filter(Boolean))];
        return <tr key={record.movementId}>
          <td><strong>{record.judicialNumber}</strong><span>{record.mpNumber}</span></td>
          <td className="subject-cell"><strong>{record.className}</strong><span title={record.subject}>{record.subject}</span>{(record.sociallyRelevant || record.extremelyComplex) && <div className="classification-badges">{record.sociallyRelevant && <b className="classification-badge social">Relevância social</b>}{record.extremelyComplex && <b className="classification-badge complex">Alta complexidade</b>}</div>}</td>
          <td>{!queueOnly && canWrite ? <select className="assignee-select" aria-label={`Responsável por ${record.judicialNumber}`} value={record.assignedTo} onChange={(event) => changeAssignment(record, event.target.value)}><option value="" disabled>Não atribuído</option>{members.filter((member) => member.active || member.userId === record.assignedTo).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select> : <strong>{record.assignedName || "Não atribuído"}</strong>}</td>
          <td>{formatDate(record.receivedAt)}</td>
          <td><strong className={remaining <= 3 && record.workflowStatus !== "Enviado" ? "danger-text" : ""}>{formatDate(record.deadlineAt)}</strong><span>{record.workflowStatus === "Enviado" ? "concluído" : `${remaining} dias`}</span></td>
          <td><select disabled={!canWrite} className="action-select" aria-label="Providência" value={record.actionType} onChange={(event) => changeAction(record, event.target.value)}><option value="">Definir...</option>{actionOptions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></td>
          <td><select disabled={!canWrite} className={`status-select status-${record.workflowStatus.toLowerCase().replace(" ", "-")}`} value={record.workflowStatus} onChange={(e) => changeStatus(record, e.target.value as WorkflowStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></td>
          <td>{canWrite && <div className="row-actions"><button className="icon-button" title="Editar registro" onClick={() => onEdit(record)}><Pencil size={16} /></button><button className="icon-button danger" title="Mover para a lixeira" onClick={() => confirm("Mover este registro para a lixeira? Ele poderá ser recuperado por 30 dias.") && onDelete(record.movementId)}><Trash2 size={17} /></button></div>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {loading && <div className="table-loading">Carregando processos...</div>}
    {!loading && !displayed.length && <div className="empty-state">Nenhum processo encontrado.</div>}
    <div className="table-footer pagination-footer"><span>{start}–{end} de {resultTotal} registro(s)</span><label>Por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option>30</option><option>50</option><option>100</option></select></label><div className="pagination-buttons"><button className="icon-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /></button><b>Página {page} de {totalPages}</b><button className="icon-button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div></div>
    {pendingSend && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPendingSend(null)}><div className="confirm-dialog"><div className="modal-head"><div><p className="eyebrow">Conclusão do fluxo</p><h2>Definir providência</h2></div><button className="icon-button" onClick={() => setPendingSend(null)}><X size={20} /></button></div><div className="confirm-body"><p>Para marcar o processo como enviado, informe a providência efetivamente adotada.</p><label>Providência<select autoFocus value={sendAction} onChange={(event) => setSendAction(event.target.value)}><option value="">Selecione...</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</select></label></div><div className="modal-actions"><button className="button secondary" onClick={() => setPendingSend(null)}>Cancelar</button><button className="button primary" disabled={!sendAction} onClick={confirmSend}>Definir e marcar como enviado</button></div></div></div>}
  </section>;
}
