import { ArrowRightLeft, Building2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProcessMovement } from "../types";
import { listWorkspaceDirectory, type AvailableWorkspace, type WorkspaceDirectoryMember } from "../workspaceApi";

interface Props {
  record: ProcessMovement;
  currentWorkspaceId: string;
  workspaces: AvailableWorkspace[];
  onClose: () => void;
  onTransfer: (targetWorkspaceId: string, targetAssigneeId: string, reason: string) => Promise<void>;
}

export function ProcessTransferDialog({ record, currentWorkspaceId, workspaces, onClose, onTransfer }: Props) {
  const targets = useMemo(() => workspaces.filter((workspace) => workspace.workspaceId !== currentWorkspaceId && workspace.role === "admin"), [workspaces, currentWorkspaceId]);
  const [workspaceId, setWorkspaceId] = useState(targets[0]?.workspaceId ?? "");
  const [members, setMembers] = useState<WorkspaceDirectoryMember[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!workspaceId) { setMembers([]); setAssigneeId(""); return; }
    let cancelled = false;
    setMessage("");
    void listWorkspaceDirectory(workspaceId).then((items) => {
      if (cancelled) return;
      const active = items.filter((member) => member.enabled && ["admin", "procurador", "assessor", "estagiario"].includes(member.role));
      setMembers(active);
      const same = active.find((member) => member.userId === record.assignedTo);
      setAssigneeId(same?.userId ?? active.find((member) => member.role === "procurador" || member.role === "assessor" || member.role === "admin")?.userId ?? active[0]?.userId ?? "");
    }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [workspaceId, record.assignedTo]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId || !assigneeId || !reason.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await onTransfer(workspaceId, assigneeId, reason.trim());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return <div className="modal-backdrop"><form className="modal transfer-process-dialog" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">Administração</p><h2>Transferir processo</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X /></button></div>
    <div className="transfer-process-summary"><ArrowRightLeft size={20} /><div><strong>{record.judicialNumber}</strong><span>{record.className || "Processo"}{record.assignedName ? ` · ${record.assignedName}` : ""}</span></div></div>

    {targets.length ? <div className="transfer-process-fields">
      <label>Procuradoria de destino<select required value={workspaceId} disabled={busy} onChange={(event) => setWorkspaceId(event.target.value)}>{targets.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}</select></label>
      <label>Novo responsável<select required value={assigneeId} disabled={busy || !members.length} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Selecione...</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select><small>Se o responsável atual também integra a Procuradoria de destino, ele é mantido automaticamente.</small></label>
      <label className="full">Justificativa<textarea required rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Informe o motivo administrativo da transferência." /></label>
    </div> : <div className="info-box"><Building2 size={17} />Não há outra Procuradoria em que você possua perfil de administrador. Cadastre ou habilite a unidade em Configurações.</div>}

    {message && <div className="info-box">{message}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy || !targets.length || !workspaceId || !assigneeId || !reason.trim()}><ArrowRightLeft size={17} />{busy ? "Transferindo..." : "Transferir"}</button></div>
  </form></div>;
}
