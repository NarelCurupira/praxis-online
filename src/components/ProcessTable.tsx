import { ChevronLeft, ChevronRight, Download, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { daysUntil, formatDate, localDatePart } from "../date";
import { actionLabel } from "../labels";
import type { MovementSortField, ProcessMovement, ProcessPermissions, TeamMember, WorkflowStatus } from "../types";

interface Props {
  records: ProcessMovement[]; queueOnly?: boolean; currentUserId?: string; members?: TeamMember[];
  permissions: ProcessPermissions;
  onStatus: (id: number, status: WorkflowStatus, actionType?: string) => Promise<void>;
  onAction: (id: number, actionType: string) => Promise<void>;
  onAssignment: (id: number, assignedTo: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>; onEdit: (record: ProcessMovement) => void;
  onExport: (bytes: number[]) => Promise<string>;
}
const statuses: WorkflowStatus[] = ["Recebido", "Em análise", "Minutado", "Enviado", "Sobrestado"];
const actions = ["Manifestação", "DI", "Diligência", "Prevenção", "Ciência", "CTRZ", "Recurso", "Sobrestamento", "Ratifico"];
const sortOptions: { value: MovementSortField; label: string }[] = [
  { value: "receivedAt", label: "Data de entrada" }, { value: "deadlineAt", label: "Prazo" },
  { value: "judicialNumber", label: "Número judicial" }, { value: "mpNumber", label: "Número MP" },
  { value: "className", label: "Classe" }, { value: "actionType", label: "Providência" },
  { value: "workflowStatus", label: "Status" }, { value: "assignedName", label: "Responsável" },
];
function excelRows(records: ProcessMovement[]) { return records.map((record) => ({
  "Nº MP": record.mpNumber, "Nº Judicial": record.judicialNumber, Classe: record.className, Assunto: record.subject,
  Entrada: record.receivedAt, Prazo: record.deadlineAt, Status: record.workflowStatus, Envio: record.sentAt ?? "",
  Providência: actionLabel(record.actionType), Prioridade: record.priority, "Observações internas": record.notes,
  Responsável: record.assignedName,
})); }

export function ProcessTable({ records, queueOnly = false, currentUserId = "", members = [], permissions, onStatus, onAction, onAssignment, onDelete, onEdit, onExport }: Props) {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("Todos"); const [year, setYear] = useState("Todos");
  const [assignedTo, setAssignedTo] = useState("Todos"); const [sortField, setSortField] = useState<MovementSortField>(queueOnly ? "deadlineAt" : "receivedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(queueOnly ? "asc" : "desc"); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(30);
  const [message, setMessage] = useState(""); const [pendingSend, setPendingSend] = useState<ProcessMovement | null>(null); const [sendAction, setSendAction] = useState("");
  const years = useMemo(() => [...new Set(records.map((record) => Number(localDatePart(record.receivedAt).slice(0, 4))).filter(Number.isFinite))].sort((a,b)=>b-a), [records]);
  const filtered = useMemo(() => records.filter((record) => {
    if (queueOnly && (record.workflowStatus === "Enviado" || record.assignedTo !== currentUserId)) return false;
    if (status !== "Todos" && record.workflowStatus !== status) return false;
    if (year !== "Todos" && localDatePart(record.receivedAt).slice(0,4) !== year) return false;
    if (assignedTo !== "Todos" && record.assignedTo !== assignedTo) return false;
    return `${record.mpNumber} ${record.judicialNumber} ${record.className} ${record.subject}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  }).sort((a,b) => { const av=a[sortField], bv=b[sortField]; const cmp=(sortField==="receivedAt"||sortField==="deadlineAt") ? new Date(String(av)).getTime()-new Date(String(bv)).getTime() : String(av).localeCompare(String(bv),"pt-BR",{numeric:true,sensitivity:"base"}); return sortDirection==="asc"?cmp:-cmp; }), [records,queueOnly,currentUserId,status,year,assignedTo,query,sortField,sortDirection]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)); const safePage=Math.min(page,totalPages); const displayed=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  async function exportFiltered(){ if(!permissions.canExport)return; try{ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(excelRows(filtered)),"Processos filtrados"); const bytes=Array.from(new Uint8Array(XLSX.write(wb,{bookType:"xlsx",type:"array"}))); setMessage(await onExport(bytes)); }catch(e){setMessage(String(e));}}
  async function changeStatus(record:ProcessMovement,next:WorkflowStatus){ if(next==="Enviado"&&!record.actionType.trim()){setPendingSend(record);setSendAction("");return;} try{await onStatus(record.movementId,next);}catch(e){setMessage(String(e));}}
  async function confirmSend(){if(!pendingSend||!sendAction)return;try{await onStatus(pendingSend.movementId,"Enviado",sendAction);setPendingSend(null);}catch(e){setMessage(String(e));}}
  return <section className="panel table-panel">
    <div className="table-toolbar"><div className="search-box"><Search size={18}/><input value={query} onChange={(e)=>{setQuery(e.target.value);setPage(1)}} placeholder="Pesquisar número, assunto ou classe..."/></div>
      <select value={year} onChange={(e)=>{setYear(e.target.value);setPage(1)}}><option>Todos</option>{years.map((item)=><option key={item}>{item}</option>)}</select>
      <select value={status} onChange={(e)=>{setStatus(e.target.value);setPage(1)}}><option>Todos</option>{statuses.map((item)=><option key={item}>{item}</option>)}</select>
      {!queueOnly&&<select value={assignedTo} onChange={(e)=>{setAssignedTo(e.target.value);setPage(1)}}><option value="Todos">Todos os responsáveis</option>{members.map((m)=><option key={m.userId} value={m.userId}>{m.fullName||m.email}</option>)}</select>}
      <select value={sortField} onChange={(e)=>setSortField(e.target.value as MovementSortField)}>{sortOptions.map((o)=><option key={o.value} value={o.value}>Ordenar: {o.label}</option>)}</select><select value={sortDirection} onChange={(e)=>setSortDirection(e.target.value as "asc"|"desc")}><option value="desc">Decrescente</option><option value="asc">Crescente</option></select>
      {permissions.canExport&&<button className="button secondary" disabled={!filtered.length} onClick={exportFiltered}><Download size={16}/>Exportar filtrados</button>}</div>
    {message&&<div className="table-export-message">{message}</div>}
    <div className="table-scroll"><table><thead><tr><th>Processo</th><th>Classe/assunto</th><th>Responsável</th><th>Entrada</th><th>Prazo</th><th>Providência</th><th>Status</th><th/></tr></thead><tbody>{displayed.map((record)=>{const remaining=daysUntil(record.deadlineAt);const actionOptions=[...new Set([record.actionType,...actions].filter(Boolean))];return <tr key={record.movementId}>
      <td><strong>{record.judicialNumber}</strong><span>{record.mpNumber}</span></td><td className="subject-cell"><strong>{record.className}</strong><span>{record.subject}</span></td>
      <td>{permissions.canChangeAssignment&&!queueOnly?<select className="assignee-select" value={record.assignedTo} onChange={(e)=>onAssignment(record.movementId,e.target.value)}>{members.filter((m)=>m.active||m.userId===record.assignedTo).map((m)=><option key={m.userId} value={m.userId}>{m.fullName||m.email}</option>)}</select>:<strong>{record.assignedName||"Não atribuído"}</strong>}</td>
      <td>{formatDate(record.receivedAt)}</td><td><strong className={remaining<=3&&record.workflowStatus!=="Enviado"?"danger-text":""}>{record.deadlineAt?formatDate(record.deadlineAt):"Sem prazo"}</strong><span>{record.workflowStatus==="Enviado"?"concluído":record.deadlineAt?`${remaining} dias`:"não aplicável"}</span></td>
      <td><select disabled={!permissions.canEditWorkflow} value={record.actionType} onChange={(e)=>onAction(record.movementId,e.target.value)}><option value="">Definir...</option>{actionOptions.map((a)=><option key={a} value={a}>{actionLabel(a)}</option>)}</select></td>
      <td><select disabled={!permissions.canEditWorkflow} className={`status-select status-${record.workflowStatus.toLowerCase().replace(" ","-")}`} value={record.workflowStatus} onChange={(e)=>changeStatus(record,e.target.value as WorkflowStatus)}>{statuses.map((s)=><option key={s}>{s}</option>)}</select></td>
      <td><div className="row-actions">{(permissions.canEditFull||permissions.canEditNotes)&&<button className="icon-button" title="Editar registro" onClick={()=>onEdit(record)}><Pencil size={16}/></button>}{permissions.canDelete&&<button className="icon-button danger" title="Mover para a lixeira" onClick={()=>confirm("Mover este registro para a lixeira?")&&onDelete(record.movementId)}><Trash2 size={16}/></button>}</div></td></tr>})}</tbody></table></div>
    <div className="table-pagination"><span>{filtered.length?`${(safePage-1)*pageSize+1}–${Math.min(safePage*pageSize,filtered.length)} de ${filtered.length}`:"Nenhum registro"}</span><label>Por página<select value={pageSize} onChange={(e)=>{setPageSize(Number(e.target.value));setPage(1)}}><option>30</option><option>50</option><option>100</option></select></label><button className="icon-button" disabled={safePage<=1} onClick={()=>setPage(safePage-1)}><ChevronLeft size={18}/></button><span>{safePage}/{totalPages}</span><button className="icon-button" disabled={safePage>=totalPages} onClick={()=>setPage(safePage+1)}><ChevronRight size={18}/></button></div>
    {pendingSend&&<div className="modal-backdrop"><div className="modal send-action-modal"><div className="modal-head"><div><p className="eyebrow">Providência obrigatória</p><h2>Defina antes de enviar</h2></div><button className="icon-button" onClick={()=>setPendingSend(null)}><X size={18}/></button></div><label>Providência<select value={sendAction} onChange={(e)=>setSendAction(e.target.value)}><option value="">Escolha...</option>{actions.map((a)=><option key={a} value={a}>{actionLabel(a)}</option>)}</select></label><div className="modal-actions"><button className="button secondary" onClick={()=>setPendingSend(null)}>Cancelar</button><button className="button primary" disabled={!sendAction} onClick={confirmSend}>Confirmar envio</button></div></div></div>}
  </section>;
}
