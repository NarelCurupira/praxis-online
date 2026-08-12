import { AlertTriangle, CloudUpload, Clock3, RotateCw, Trash2, X } from "lucide-react";
import type { OfflineOperation } from "../offlineStore";

interface Props {
  operations: OfflineOperation[];
  currentWorkspaceId?: string;
  syncing: boolean;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onDiscard: (operationId: string) => Promise<void>;
}

function operationLabel(operation: OfflineOperation): string {
  if (operation.payload.kind === "create") return "Novo processo";
  if (operation.payload.kind === "edit") return "Edição do processo";
  if (operation.payload.kind === "status") return `Status → ${operation.payload.status}`;
  if (operation.payload.kind === "action") return "Alteração de providência";
  return "Alteração de responsável";
}

function timeLabel(value: string): string {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

export function OfflineQueuePanel({ operations, currentWorkspaceId, syncing, onClose, onRetry, onDiscard }: Props) {
  const currentCount = operations.filter((operation) => operation.workspaceId === currentWorkspaceId).length;
  const failed = operations.filter((operation) => operation.lastError).length;

  return <div className="modal-backdrop offline-queue-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal offline-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-queue-title">
      <div className="modal-head">
        <div><p className="eyebrow">Contingência</p><h2 id="offline-queue-title">Fila de sincronização</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </div>

      <div className="offline-queue-summary">
        <div><CloudUpload size={20} /><span><strong>{operations.length}</strong><small>alterações locais</small></span></div>
        <div><Clock3 size={20} /><span><strong>{currentCount}</strong><small>nesta Procuradoria</small></span></div>
        <div className={failed ? "has-error" : ""}><AlertTriangle size={20} /><span><strong>{failed}</strong><small>com falha</small></span></div>
      </div>

      <div className="info-box offline-sync-rc-note"><AlertTriangle size={16} /><span><strong>0.11.1-RC:</strong> as alterações são sincronizadas na ordem em que foram feitas. Detecção e resolução de alterações concorrentes serão incorporadas na versão 1.0.</span></div>

      <div className="offline-queue-list">
        {!operations.length && <div className="empty-state">Nenhuma alteração aguarda sincronização.</div>}
        {operations.map((operation) => <article key={operation.id} className={`offline-queue-item ${operation.lastError ? "has-error" : ""}`}>
          <div className="offline-queue-item-main">
            <div className="offline-queue-item-title"><strong>{operationLabel(operation)}</strong>{operation.workspaceId !== currentWorkspaceId && <span>{operation.workspaceName}</span>}</div>
            <p>{operation.processLabel || "Processo local"}</p>
            <small>{timeLabel(operation.createdAt)}{operation.attempts ? ` · ${operation.attempts} tentativa${operation.attempts === 1 ? "" : "s"}` : ""}</small>
            {operation.lastError && <div className="offline-queue-error"><AlertTriangle size={15} /><span>{operation.lastError}</span></div>}
          </div>
          <button type="button" className="icon-button danger" title="Descartar alteração local" aria-label="Descartar alteração local" onClick={() => { if (window.confirm("Descartar esta alteração local? Se for um cadastro ainda não sincronizado, também serão descartadas as alterações posteriores vinculadas a ele.")) void onDiscard(operation.id); }}><Trash2 size={17} /></button>
        </article>)}
      </div>

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
        <button type="button" className="button primary" disabled={syncing || !currentCount || !navigator.onLine} onClick={() => void onRetry()}><RotateCw size={17} className={syncing ? "spin" : ""} />{syncing ? "Sincronizando..." : "Sincronizar esta Procuradoria"}</button>
      </div>
    </section>
  </div>;
}
