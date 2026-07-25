import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listDeletedMovements, permanentlyDeleteMovement, restoreDeletedMovement } from "../api";
import { formatDate } from "../date";
import type { ProcessMovement } from "../types";
interface Props { refreshKey: number; onChanged: () => Promise<void>; canManage: boolean; }
export function TrashPage({ refreshKey, onChanged, canManage }: Props) {
  const [records,setRecords]=useState<ProcessMovement[]>([]); const [message,setMessage]=useState("");
  async function load(){try{setRecords(await listDeletedMovements())}catch(e){setMessage(String(e))}}
  useEffect(()=>{void load()},[refreshKey]);
  async function restore(id:number){try{await restoreDeletedMovement(id);await onChanged();setMessage("Registro restaurado.")}catch(e){setMessage(String(e))}}
  async function remove(id:number){if(!confirm("Excluir definitivamente?"))return;try{await permanentlyDeleteMovement(id);await onChanged();setMessage("Registro excluído definitivamente.")}catch(e){setMessage(String(e))}}
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">Exclusão recuperável</p><h1>Lixeira</h1><p>{canManage?"Restaure ou exclua definitivamente registros.":"Consulte os registros excluídos. A restauração é administrativa."}</p></div></div><section className="panel trash-panel">{message&&<div className="trash-message">{message}</div>}<div className="trash-list">{records.map((r)=><div className="trash-row" key={r.movementId}><div><strong>{r.judicialNumber}</strong><small>{r.mpNumber}</small></div><div><strong>{r.className}</strong><small>{r.subject}</small></div><div><span>Entrada</span><strong>{formatDate(r.receivedAt)}</strong></div>{canManage?<div className="trash-actions"><button className="button secondary" onClick={()=>restore(r.movementId)}><RotateCcw size={15}/>Restaurar</button><button className="icon-button danger" onClick={()=>remove(r.movementId)}><Trash2 size={17}/></button></div>:<span className="role-badge">Somente leitura</span>}</div>)}{!records.length&&<div className="quality-empty"><Trash2 size={30}/><strong>A lixeira está vazia</strong></div>}</div></section></div>;
}
