import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, UserPlus, Users } from "lucide-react";
import { acceptTeamInvite, createTeamInvite, listTeamMembers, updateTeamMember } from "../api";
import { requireSupabase } from "../supabase";
import type { PraxisRole, TeamMember } from "../types";

const roleLabels: Record<PraxisRole, string> = { admin: "Administrador", procurador: "Procurador", assessor: "Assessor/servidor", consulta: "Somente consulta" };

export function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PraxisRole>("assessor");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [{ data }, items] = await Promise.all([requireSupabase().auth.getUser(), listTeamMembers()]);
    setCurrentUserId(data.user?.id ?? ""); setMembers(items);
  }
  useEffect(() => { reload().catch((error) => setMessage(String(error))); }, []);
  const me = useMemo(() => members.find((item) => item.userId === currentUserId), [members, currentUserId]);
  const isAdmin = me?.role === "admin";

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setInviteCode("");
    try { setInviteCode(await createTeamInvite(email, role)); setEmail(""); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function accept(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await acceptTeamInvite(joinCode); }
    catch (error) { setMessage(String(error)); setBusy(false); }
  }

  async function changeMember(member: TeamMember, nextRole: PraxisRole, active = member.active) {
    setBusy(true); setMessage("");
    try { await updateTeamMember(member.userId, nextRole, active); await reload(); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Acesso compartilhado</p><h1>Equipe</h1><p>Contas individuais trabalhando no mesmo espaço do Práxis.</p></div></div>
    <div className="two-column team-columns">
      {isAdmin && <section className="panel team-invite-card"><div className="large-icon blue"><UserPlus size={28} /></div><h2>Convidar usuário</h2><p>Informe exatamente o e-mail que o colega usará no cadastro.</p><form onSubmit={invite}><label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Perfil<select value={role} onChange={(event) => setRole(event.target.value as PraxisRole)}><option value="procurador">Procurador</option><option value="assessor">Assessor/servidor</option><option value="consulta">Somente consulta</option></select></label><button className="button primary" disabled={busy}>Gerar convite</button></form>{inviteCode && <div className="invite-code"><span>Código válido por sete dias</span><strong>{inviteCode}</strong><button className="button secondary" onClick={() => navigator.clipboard.writeText(inviteCode)}><Clipboard size={17} />Copiar código</button></div>}</section>}
      <section className="panel team-invite-card"><div className="large-icon green"><Users size={28} /></div><h2>Entrar em outra equipe</h2><p>Use o código recebido do administrador. O convite deve corresponder ao e-mail desta conta.</p><form onSubmit={accept}><label>Código do convite<input required value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={12} /></label><button className="button secondary" disabled={busy || joinCode.length < 12}><Check size={18} />Aceitar convite</button></form></section>
    </div>
    {message && <div className="info-box">{message}</div>}
    <section className="panel"><div className="panel-title"><div><h2>Usuários do espaço</h2><p>{members.length} conta(s) vinculada(s)</p></div></div><div className="team-list">{members.map((member) => <div className={member.active ? "team-row" : "team-row inactive"} key={member.userId}><div className="team-avatar">{(member.fullName || member.email).slice(0, 1).toUpperCase()}</div><div className="grow"><strong>{member.fullName || "Usuário"}{member.userId === currentUserId ? " (você)" : ""}</strong><span>{member.email}</span></div>{isAdmin && member.userId !== currentUserId ? <><select value={member.role} disabled={busy} onChange={(event) => changeMember(member, event.target.value as PraxisRole)}><option value="procurador">Procurador</option><option value="assessor">Assessor/servidor</option><option value="consulta">Somente consulta</option></select><button className="button secondary" disabled={busy} onClick={() => changeMember(member, member.role, !member.active)}>{member.active ? "Suspender" : "Reativar"}</button></> : <span className="role-badge">{roleLabels[member.role]}</span>}</div>)}</div></section>
  </div>;
}

