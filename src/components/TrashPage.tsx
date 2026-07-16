import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listDeletedMovements, permanentlyDeleteMovement, restoreDeletedMovement } from "../api";
import { formatDate } from "../date";
import type { ProcessMovement } from "../types";

interface Props { refreshKey: number; onChanged: () => Promise<void>; }

function deletionDeadline(deletedAt: string | null) {
  if (!deletedAt) return "—";
  const date = new Date(deletedAt);
  date.setDate(date.getDate() + 30);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function TrashPage({ refreshKey, onChanged }: Props) {
  const [records, setRecords] = useState<ProcessMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try { setRecords(await listDeletedMovements()); }
    catch (error) { setMessage(`Não foi possível carregar a lixeira: ${String(error)}`); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [refreshKey]);

  async function restore(id: number) {
    setMessage("");
    try { await restoreDeletedMovement(id); await onChanged(); setMessage("Registro restaurado com sucesso."); }
    catch (error) { setMessage(String(error)); }
  }

  async function remove(id: number) {
    if (!confirm("Excluir este registro definitivamente? Esta ação não poderá ser desfeita.")) return;
    setMessage("");
    try { await permanentlyDeleteMovement(id); await onChanged(); setMessage("Registro excluído definitivamente."); }
    catch (error) { setMessage(String(error)); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Exclusão recuperável</p><h1>Lixeira</h1><p>Restaure registros individualmente. A exclusão definitiva ocorre após 30 dias.</p></div></div>
    <section className="panel trash-panel">
      {message && <div className="trash-message">{message}</div>}
      {loading ? <div className="empty-state">Carregando lixeira...</div> : records.length ? <div className="trash-list">
        {records.map((record) => <div className="trash-row" key={record.movementId}>
          <div><strong>{record.judicialNumber}</strong><small>{record.mpNumber}</small></div>
          <div><strong>{record.className}</strong><small>{record.subject}</small></div>
          <div><span>Entrada</span><strong>{formatDate(record.receivedAt)}</strong></div>
          <div><span>Exclusão definitiva em</span><strong>{deletionDeadline(record.deletedAt)}</strong></div>
          <div className="trash-actions"><button className="button secondary" onClick={() => restore(record.movementId)}><RotateCcw size={15} />Restaurar</button><button className="icon-button danger" title="Excluir definitivamente" onClick={() => remove(record.movementId)}><Trash2 size={17} /></button></div>
        </div>)}
      </div> : <div className="quality-empty"><Trash2 size={30} /><strong>A lixeira está vazia</strong><span>Os registros excluídos aparecerão aqui durante 30 dias.</span></div>}
    </section>
  </div>;
}
