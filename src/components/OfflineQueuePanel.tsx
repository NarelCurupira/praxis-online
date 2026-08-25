import { AlertTriangle, CloudUpload, Clock3, GitMerge, RotateCw, Server, ShieldCheck, Trash2, X } from "lucide-react";
import type { OfflineConflictField, OfflineOperation } from "../offlineStore";

interface Props {
  operations: OfflineOperation[];
  currentWorkspaceId?: string;
  syncing: boolean;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onDiscard: (operationId: string) => Promise<void>;
  onApplyLocal: (operationId: string) => Promise<void>;
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

function ConflictField({ field }: { field: OfflineConflictField }) {
  return <div className="offline-conflict-field">
    <strong>{field.label}</strong>
    <div><span>Antes</span><b>{field.baseline}</b></div>
    <div><span>Servidor</span><b>{field.server}</b></div>
    <div><span>Local</span><b>{field.local}</b></div>
  </div>;
}

export function OfflineQueuePanel({ operations, currentWorkspaceId, syncing, onClose, onRetry, onDiscard, onApplyLocal }: Props) {
  const currentOperations = operations.filter((operation) => operation.workspaceId === currentWorkspaceId);
  const currentCount = currentOperations.length;
  const failed = operations.filter((operation) => operation.lastError).length;
  const conflicts = operations.filter((operation) => operation.conflict).length;
  const currentHasConflict = currentOperations.some((operation) => operation.conflict);

  return <div className="modal-backdrop offline-queue-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal offline-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-queue-title">
      <div className="modal-head">
        <div><p className="eyebrow">Contingência</p><h2 id="offline-queue-title">Fila de sincronização</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </div>

      <div className="offline-queue-summary">
        <div><CloudUpload size={20} /><span><strong>{operations.length}</strong><small>alterações locais</small></span></div>
        <div><Clock3 size={20} /><span><strong>{currentCount}</strong><small>nesta Procuradoria</small></span></div>
        <div className={conflicts ? "has-conflict" : ""}><GitMerge size={20} /><span><strong>{conflicts}</strong><small>conflitos</small></span></div>
        <div className={failed ? "has-error" : ""}><AlertTriangle size={20} /><span><strong>{failed}</strong><small>com falha</small></span></div>
      </div>

      <div className="info-box offline-sync-rc-note"><ShieldCheck size={16} /><span><strong>0.11.2-RC:</strong> o Práxis compara a base local com o estado atual do servidor. Mudanças independentes são mescladas automaticamente; conflitos reais param a fila até uma decisão explícita.</span></div>

      <div className="offline-queue-list">
        {!operations.length && <div className="empty-state">Nenhuma alteração aguarda sincronização.</div>}
        {operations.map((operation) => {
          const conflict = operation.conflict;
          return <article key={operation.id} className={`offline-queue-item ${operation.lastError ? "has-error" : ""} ${conflict ? "has-conflict" : ""}`}>
            <div className="offline-queue-item-main">
              <div className="offline-queue-item-title"><strong>{operationLabel(operation)}</strong>{operation.workspaceId !== currentWorkspaceId && <span>{operation.workspaceName}</span>}{conflict && <span className="conflict-badge">Conflito</span>}</div>
              <p>{operation.processLabel || "Processo local"}</p>
              <small>{timeLabel(operation.createdAt)}{operation.attempts ? ` · ${operation.attempts} tentativa${operation.attempts === 1 ? "" : "s"}` : ""}</small>
              {operation.lastError && <div className="offline-queue-error"><AlertTriangle size={15} /><span>{operation.lastError}</span></div>}

              {conflict && <div className="offline-conflict-box">
                <div className="offline-conflict-message"><GitMerge size={16} /><div><strong>Alteração concorrente detectada</strong><span>{conflict.message}</span></div></div>
                {conflict.fields.length > 0 && <div className="offline-conflict-fields">{conflict.fields.map((field) => <ConflictField key={field.field} field={field} />)}</div>}
                <div className="offline-conflict-actions">
                  <button type="button" className="button secondary compact" onClick={() => { if (window.confirm("Manter a versão do servidor e descartar esta alteração local?")) void onDiscard(operation.id); }}><Server size={15} />Manter servidor</button>
                  {conflict.canApplyLocal && <button type="button" className="button primary compact" disabled={syncing || !navigator.onLine} onClick={() => { if (window.confirm("Aplicar a alteração local sobre o valor atual do servidor? Esta decisão ficará registrada pela sincronização normal do Práxis.")) void onApplyLocal(operation.id); }}><CloudUpload size={15} />Aplicar alteração local</button>}
                </div>
              </div>}
            </div>
            {!conflict && <button type="button" className="icon-button danger" title="Descartar alteração local" aria-label="Descartar alteração local" onClick={() => { if (window.confirm("Descartar esta alteração local? Se for um cadastro ainda não sincronizado, também serão descartadas as alterações posteriores vinculadas a ele.")) void onDiscard(operation.id); }}><Trash2 size={17} /></button>}
          </article>;
        })}
      </div>

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
        <button type="button" className="button primary" disabled={syncing || !currentCount || !navigator.onLine || currentHasConflict} onClick={() => void onRetry()}><RotateCw size={17} className={syncing ? "spin" : ""} />{syncing ? "Sincronizando..." : currentHasConflict ? "Resolva o conflito para continuar" : "Sincronizar esta Procuradoria"}</button>
      </div>
    </section>
  </div>;
}
