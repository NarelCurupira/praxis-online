import { Building2, Check, Copy, Pencil, Plus, RefreshCw, Save, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AccessScope, PraxisRole } from "../types";
import {
  createWorkspace,
  listAdminWorkspaces,
  listWorkspaceDirectory,
  renameWorkspace,
  setWorkspaceMembersBatch,
  type AdminWorkspace,
  type WorkspaceDirectoryMember,
} from "../workspaceApi";

interface Props {
  currentWorkspaceId: string;
  onChanged?: () => Promise<void>;
}

type MemberDraft = WorkspaceDirectoryMember;

function sameMember(left: MemberDraft, right: MemberDraft): boolean {
  return left.enabled === right.enabled && left.role === right.role && left.efficiencyAccess === right.efficiencyAccess && left.reportsAccess === right.reportsAccess;
}

const roleLabels: Record<PraxisRole, string> = {
  admin: "Administrador",
  procurador: "Procurador",
  assessor: "Assessor/servidor",
  estagiario: "Estagiário",
  consulta: "Somente consulta",
};

function normalizedScopes(role: PraxisRole, efficiency: AccessScope, reports: AccessScope) {
  if (role === "admin" || role === "procurador") return { efficiency: "team" as AccessScope, reports: "team" as AccessScope };
  if (role === "estagiario" || role === "consulta") return { efficiency: "none" as AccessScope, reports: "none" as AccessScope };
  return { efficiency, reports };
}

export function ProcuradoriasPanel({ currentWorkspaceId, onChanged }: Props) {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState(currentWorkspaceId);
  const [directory, setDirectory] = useState<MemberDraft[]>([]);
  const [savedDirectory, setSavedDirectory] = useState<MemberDraft[]>([]);
  const [newName, setNewName] = useState("");
  const [copyConfiguration, setCopyConfiguration] = useState(true);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(() => workspaces.find((item) => item.workspaceId === selectedId), [workspaces, selectedId]);

  async function loadWorkspaces(preferredId?: string) {
    const next = await listAdminWorkspaces();
    setWorkspaces(next);
    const resolved = preferredId && next.some((item) => item.workspaceId === preferredId)
      ? preferredId
      : next.some((item) => item.workspaceId === selectedId)
        ? selectedId
        : next.find((item) => item.current)?.workspaceId ?? next[0]?.workspaceId ?? "";
    setSelectedId(resolved);
    setRenameValue(next.find((item) => item.workspaceId === resolved)?.name ?? "");
    if (resolved) { const members = await listWorkspaceDirectory(resolved); setDirectory(members); setSavedDirectory(members); }
    else { setDirectory([]); setSavedDirectory([]); }
  }

  useEffect(() => { void loadWorkspaces(currentWorkspaceId); }, [currentWorkspaceId]);

  useEffect(() => {
    if (!selectedId) return;
    setRenameValue(workspaces.find((item) => item.workspaceId === selectedId)?.name ?? "");
    void listWorkspaceDirectory(selectedId).then((members) => { setDirectory(members); setSavedDirectory(members); }).catch((error) => setMessage(String(error)));
  }, [selectedId]);

  async function run(operation: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) { setMessage("Informe o nome da Procuradoria."); return; }
    await run(async () => {
      const id = await createWorkspace(name, copyConfiguration);
      setNewName("");
      await loadWorkspaces(id);
      await onChanged?.();
    }, "Procuradoria criada. Use o seletor no topo para acessá-la.");
  }

  async function rename() {
    if (!selectedId || !renameValue.trim()) return;
    await run(async () => {
      await renameWorkspace(selectedId, renameValue);
      await loadWorkspaces(selectedId);
      await onChanged?.();
    }, "Nome da Procuradoria atualizado.");
  }

  function patchMember(userId: string, patch: Partial<MemberDraft>) {
    setDirectory((current) => current.map((member) => member.userId === userId ? { ...member, ...patch } : member));
  }

  const hasMemberChanges = directory.some((member) => {
    const saved = savedDirectory.find((item) => item.userId === member.userId);
    return !saved || !sameMember(member, saved);
  });

  async function saveMembers() {
    if (!selectedId || !hasMemberChanges) return;
    await run(async () => {
      const normalized = directory.map((member) => {
        const scopes = normalizedScopes(member.role, member.efficiencyAccess, member.reportsAccess);
        return { ...member, efficiencyAccess: scopes.efficiency, reportsAccess: scopes.reports };
      });
      await setWorkspaceMembersBatch(selectedId, normalized);
      const refreshed = await listWorkspaceDirectory(selectedId);
      setDirectory(refreshed);
      setSavedDirectory(refreshed);
      await loadWorkspaces(selectedId);
      await onChanged?.();
    }, "Integrantes da Procuradoria atualizados.");
  }

  return <section className="panel governance-section procuradorias-panel">
    <div className="panel-title">
      <div><h2>Procuradorias de Justiça</h2><p>Cadastre unidades e defina quais usuários podem atuar em cada Procuradoria.</p></div>
      <Building2 />
    </div>

    <div className="procuradoria-create-grid">
      <label className="grow procuradoria-name-field">Nova Procuradoria<input className="procuradoria-name-input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex.: 5ª Procuradoria de Justiça Cível" /></label>
      <label className="check-row procuradoria-copy-option"><input type="checkbox" checked={copyConfiguration} onChange={(event) => setCopyConfiguration(event.target.checked)} /><Copy size={15} />Copiar prazos, jornada e calendário da unidade atual</label>
      <button type="button" className="button primary" disabled={busy || !newName.trim()} onClick={() => void create()}><Plus size={17} />Cadastrar</button>
    </div>
    <p className="muted-note">A cópia de configuração não inclui processos, movimentações nem períodos fechados. A identificação institucional da nova Procuradoria começa com o novo nome e procurador responsável em branco.</p>

    <div className="procuradorias-layout">
      <div className="procuradoria-list" role="list" aria-label="Procuradorias administradas">
        {workspaces.map((workspace) => <button type="button" key={workspace.workspaceId} className={workspace.workspaceId === selectedId ? "procuradoria-card active" : "procuradoria-card"} onClick={() => setSelectedId(workspace.workspaceId)}>
          <Building2 size={17} /><span><strong>{workspace.name}</strong><small>{workspace.memberCount} integrante(s){workspace.current ? " · atual" : ""}</small></span>
        </button>)}
      </div>

      {selected && <div className="procuradoria-editor">
        <div className="procuradoria-rename-row">
          <label>Nome da Procuradoria<input className="procuradoria-name-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label>
          <button type="button" className="button secondary" disabled={busy || !renameValue.trim() || renameValue.trim() === selected.name} onClick={() => void rename()}><Pencil size={16} />Renomear</button>
        </div>

        <div className="panel-title compact"><div><h3>Integrantes habilitados</h3><p>O mesmo usuário pode possuir vínculos e perfis diferentes em unidades distintas.</p></div><Users size={19} /></div>
        <div className="workspace-member-table">
          <div className="workspace-member-head"><span>Acesso</span><span>Usuário</span><span>Perfil</span><span>Eficiência</span><span>Relatórios</span></div>
          {directory.map((member) => {
            const fixedAdmin = member.role === "admin" && member.enabled;
            const scopes = normalizedScopes(member.role, member.efficiencyAccess, member.reportsAccess);
            return <div className="workspace-member-row" key={member.userId}>
              <label className="workspace-member-enabled" title={fixedAdmin ? "Administradores ativos não podem ser removidos por esta tela." : "Habilitar acesso"}><input type="checkbox" disabled={busy || fixedAdmin} checked={member.enabled} onChange={(event) => patchMember(member.userId, { enabled: event.target.checked })} />{member.enabled ? <Check size={15} /> : null}</label>
              <span className="workspace-member-identity"><strong>{member.fullName || member.email}</strong><small>{member.email}</small></span>
              <select disabled={busy || fixedAdmin || !member.enabled} value={member.role} onChange={(event) => patchMember(member.userId, { role: event.target.value as PraxisRole })}>{Object.entries(roleLabels).filter(([role]) => role !== "admin" || member.role === "admin").map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select>
              <select disabled={busy || !member.enabled || member.role !== "assessor"} value={scopes.efficiency} onChange={(event) => patchMember(member.userId, { efficiencyAccess: event.target.value as AccessScope })}><option value="none">Sem acesso</option><option value="own">Próprios</option><option value="team">Equipe</option></select>
              <select disabled={busy || !member.enabled || member.role !== "assessor"} value={scopes.reports} onChange={(event) => patchMember(member.userId, { reportsAccess: event.target.value as AccessScope })}><option value="none">Sem acesso</option><option value="own">Próprios</option><option value="team">Equipe</option></select>
            </div>;
          })}
        </div>
        <div className="workspace-member-actions"><span>{hasMemberChanges ? "Há alterações pendentes." : "Todos os vínculos estão salvos."}</span><button type="button" className="button primary" disabled={busy || !hasMemberChanges} onClick={() => void saveMembers()}><Save size={17} />Salvar integrantes</button></div>
      </div>}
    </div>

    {message && <div className="info-box procuradoria-message">{message}</div>}
    {busy && <div className="inline-busy"><RefreshCw size={16} className="spin" />Atualizando Procuradorias...</div>}
  </section>;
}
