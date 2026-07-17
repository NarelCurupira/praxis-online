import { useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { listAdminAudit } from "../api";
import type { AdminAuditEntry } from "../types";

const labels: Record<string, string> = { invite_created: "Convite criado", member_updated: "Acesso alterado", backup_created: "Backup criado", backup_restored: "Backup restaurado", database_cleared: "Banco limpo", class_setting_changed: "Regra de prazo alterada", calendar_changed: "Calendário alterado" };

export function AdminAuditPage() {
  const [items, setItems] = useState<AdminAuditEntry[]>([]); const [loading, setLoading] = useState(true); const [message, setMessage] = useState("");
  async function load() { setLoading(true); setMessage(""); try { setItems(await listAdminAudit()); } catch (error) { setMessage(String(error)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">Segurança administrativa</p><h1>Auditoria</h1><p>Registro das operações sensíveis realizadas no espaço de trabalho.</p></div><button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={17} />Atualizar</button></div>
    <section className="panel audit-panel"><div className="panel-title"><div><h2>Eventos recentes</h2><p>Os 500 registros administrativos mais recentes.</p></div><ClipboardList size={21} /></div>{message && <div className="info-box">{message}</div>}{loading ? <div className="empty-state">Carregando auditoria...</div> : <div className="audit-list">{items.map((item) => <div className="audit-row" key={item.id}><div><strong>{labels[item.eventType] || item.eventType}</strong><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.createdAt))}</small></div><div><strong>{item.actorName || item.actorEmail || "Sistema"}</strong><small>{item.actorEmail}</small></div><code>{JSON.stringify(item.details)}</code></div>)}{!items.length && <div className="empty-state">Nenhum evento administrativo registrado.</div>}</div>}</section></div>;
}
