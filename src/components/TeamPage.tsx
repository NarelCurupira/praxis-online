import { useEffect, useState } from "react";
import { Pencil, UserPlus, Users, X } from "lucide-react";
import { createManagedTeamMember, sendMemberPasswordReset, updateTeamMemberProfile } from "../api";
import { listGovernanceMembers, saveMemberAccess } from "../governanceApi";
import type { AccessScope, PraxisRole, TeamMember } from "../types";

interface Props {
  onChanged?: () => Promise<void>;
}

const labels: Record<PraxisRole, string> = {
  admin: "Administrador",
  procurador: "Procurador",
  assessor: "Assessor/servidor",
  estagiario: "Estagiário",
  consulta: "Somente consulta",
};

function normalized(role: PraxisRole, efficiency: AccessScope, reports: AccessScope) {
  if (role === "admin" || role === "procurador") return { efficiency: "team" as AccessScope, reports: "team" as AccessScope };
  if (role === "estagiario" || role === "consulta") return { efficiency: "none" as AccessScope, reports: "none" as AccessScope };
  return { efficiency, reports };
}

function suggestedDisplayName(fullName: string, email = ""): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return email.split("@")[0] || "Usuário";
  if (words.length === 1) return words[0];
  return `${words[0]} ${words.at(-1)}`;
}

export function TeamPage({ onChanged }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PraxisRole>("assessor");
  const [coverage, setCoverage] = useState("");

  const [editName, setEditName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<PraxisRole>("assessor");
  const [editActive, setEditActive] = useState(true);
  const [editMfa, setEditMfa] = useState(false);
  const [editCoverage, setEditCoverage] = useState("");
  const [editEfficiency, setEditEfficiency] = useState<AccessScope>("own");
  const [editReports, setEditReports] = useState<AccessScope>("own");

  async function reload() {
    setMembers(await listGovernanceMembers());
  }

  useEffect(() => { void reload(); }, []);

  function updateCreateName(value: string) {
    setName(value);
    if (!displayName.trim() || displayName === suggestedDisplayName(name, email)) {
      setDisplayName(suggestedDisplayName(value, email));
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createManagedTeamMember({
        fullName: name,
        email,
        role,
        historicalCoverageSince: coverage || null,
        delivery: "link",
      });

      const refreshed = await listGovernanceMembers();
      const created = refreshed.find((member) => member.email.trim().toLocaleLowerCase("pt-BR") === email.trim().toLocaleLowerCase("pt-BR"));
      if (created) {
        const scopes = normalized(role, "own", "own");
        await saveMemberAccess(created.userId, scopes.efficiency, scopes.reports, displayName.trim());
      }

      await reload();
      await onChanged?.();
      setMessage("Usuário criado. O nome de exibição já poderá ser usado nas tabelas.");
      setName("");
      setDisplayName("");
      setEmail("");
      setCoverage("");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  function open(member: TeamMember) {
    setEditing(member);
    setEditName(member.fullName);
    setEditDisplayName(member.displayName || suggestedDisplayName(member.fullName, member.email));
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditActive(member.active);
    setEditMfa(member.mfaRequired);
    setEditCoverage(member.historicalCoverageSince ?? "");
    setEditEfficiency(member.efficiencyAccess ?? "own");
    setEditReports(member.reportsAccess ?? "own");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage("");
    try {
      const scopes = normalized(editRole, editEfficiency, editReports);
      await updateTeamMemberProfile(editing, {
        fullName: editName,
        email: editEmail,
        role: editRole,
        active: editActive,
        mfaRequired: editRole === "admin" || editMfa,
        historicalCoverageSince: editCoverage || null,
      });
      await saveMemberAccess(editing.userId, scopes.efficiency, scopes.reports, editDisplayName.trim());
      setEditing(null);
      await reload();
      await onChanged?.();
      setMessage("Usuário atualizado.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Acesso compartilhado</p><h1>Equipe</h1><p>Perfis, segurança, permissões e nomes de exibição.</p></div></div>

    <section className="panel">
      <div className="panel-title"><div><h2>Cadastrar usuário</h2><p>O nome de exibição aparece nas tabelas para economizar espaço.</p></div><UserPlus /></div>
      <form className="managed-member-form managed-member-form-v091" onSubmit={create}>
        <label>Nome completo<input required value={name} onChange={(event) => updateCreateName(event.target.value)} /></label>
        <label>Nome de exibição<input required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Marcos Antonio" /><small>Curto e facilmente identificável.</small></label>
        <label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Perfil<select value={role} onChange={(event) => setRole(event.target.value as PraxisRole)}>{Object.entries(labels).filter(([key]) => key !== "admin").map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label>Histórico desde<input type="date" value={coverage} onChange={(event) => setCoverage(event.target.value)} /></label>
        <button className="button primary" disabled={busy}>Cadastrar</button>
      </form>
    </section>

    {message && <div className="info-box">{message}</div>}

    <section className="panel">
      <div className="panel-title"><div><h2>Usuários</h2><p>O nome completo permanece nos relatórios e na auditoria.</p></div><Users /></div>
      <div className="team-list">{members.map((member) => <div className="team-row" key={member.userId}>
        <div className="team-avatar">{(member.displayName || member.fullName || member.email)[0]}</div>
        <div className="grow"><strong>{member.fullName}</strong><span>{member.email}</span><small>Nas tabelas: <b>{member.displayName || suggestedDisplayName(member.fullName, member.email)}</b> · Eficiência: {member.efficiencyAccess ?? "own"} · Relatórios: {member.reportsAccess ?? "own"}</small></div>
        <span className="role-badge">{labels[member.role]}</span>
        <button className="button secondary" onClick={() => open(member)}><Pencil size={15} />Editar</button>
      </div>)}</div>
    </section>

    {editing && <div className="modal-backdrop"><form className="modal member-editor" onSubmit={save}>
      <div className="modal-head"><div><p className="eyebrow">Equipe</p><h2>Editar usuário</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)}><X /></button></div>
      <div className="member-editor-grid">
        <label>Nome completo<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
        <label>Nome de exibição<input required maxLength={40} value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} /><small>Usado somente nas tabelas e filtros compactos.</small></label>
        <label>E-mail<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label>
        <label>Perfil<select value={editRole} onChange={(event) => setEditRole(event.target.value as PraxisRole)}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label>Histórico desde<input type="date" value={editCoverage} onChange={(event) => setEditCoverage(event.target.value)} /></label>
        <label>Eficiência<select disabled={editRole !== "assessor"} value={normalized(editRole, editEfficiency, editReports).efficiency} onChange={(event) => setEditEfficiency(event.target.value as AccessScope)}><option value="none">Sem acesso</option><option value="own">Próprios dados</option><option value="team">Equipe</option></select></label>
        <label>Relatórios<select disabled={editRole !== "assessor"} value={normalized(editRole, editEfficiency, editReports).reports} onChange={(event) => setEditReports(event.target.value as AccessScope)}><option value="none">Sem acesso</option><option value="own">Relatório próprio</option><option value="team">Equipe</option></select></label>
        <label><input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />Conta ativa</label>
        <label><input type="checkbox" checked={editMfa} onChange={(event) => setEditMfa(event.target.checked)} />Exigir 2FA</label>
      </div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={() => editing && sendMemberPasswordReset(editing)}>Redefinir senha</button><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button primary" disabled={busy}>Salvar</button></div>
    </form></div>}
  </div>;
}
