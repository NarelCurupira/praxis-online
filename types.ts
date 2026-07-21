import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, KeyRound, Pencil, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { acceptTeamInvite, createTeamInvite, listTeamMembers, sendMemberPasswordReset, updateTeamMemberProfile } from "../api";
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
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<PraxisRole>("assessor");
  const [editActive, setEditActive] = useState(true);
  const [editMfa, setEditMfa] = useState(false);

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

  function openEditor(member: TeamMember) {
    setEditing(member); setEditName(member.fullName); setEditEmail(member.email); setEditRole(member.role);
    setEditActive(member.active); setEditMfa(member.role === "admin" || member.mfaRequired); setMessage("");
  }

  async function saveMember(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setMessage("");
    try {
      await updateTeamMemberProfile(editing, { fullName: editName.trim(), email: editEmail.trim(), role: editRole, active: editActive, mfaRequired: editing.role === "admin" || editMfa });
      setEditing(null); await reload(); setMessage("Dados do usuário atualizados.");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!editing || !window.confirm(`Enviar um e-mail de redefinição de senha para ${editing.email}?`)) return;
    setBusy(true); setMessage("");
    try { await sendMemberPasswordReset(editing); setMessage("E-mail de redefinição de senha enviado."); setEditing(null); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Acesso compartilhado</p><h1>Equipe</h1><p>Convites, perfis e segurança das contas vinculadas ao Práxis.</p></div></div>
    <div className="two-column team-columns">
      {isAdmin && <section className="panel team-invite-card"><div className="large-icon blue"><UserPlus size={28} /></div><h2>Convidar usuário</h2><p>Informe exatamente o e-mail que o colega usará no cadastro.</p><form onSubmit={invite}><label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Perfil<select value={role} onChange={(event) => setRole(event.target.value as PraxisRole)}><option value="procurador">Procurador</option><option value="assessor">Assessor/servidor</option><option value="consulta">Somente consulta</option></select></label><button className="button primary" disabled={busy}>Gerar convite</button></form>{inviteCode && <div className="invite-code"><span>Código válido por sete dias</span><strong>{inviteCode}</strong><button className="button secondary" onClick={() => navigator.clipboard.writeText(inviteCode)}><Clipboard size={17} />Copiar código</button></div>}</section>}
      <section className="panel team-invite-card"><div className="large-icon green"><Users size={28} /></div><h2>Entrar em outra equipe</h2><p>Use o código recebido do administrador. O convite deve corresponder ao e-mail desta conta.</p><form onSubmit={accept}><label>Código do convite<input required value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={12} /></label><button className="button secondary" disabled={busy || joinCode.length < 12}><Check size={18} />Aceitar convite</button></form></section>
    </div>
    {message && <div className="info-box">{message}</div>}
    <section className="panel"><div className="panel-title"><div><h2>Usuários do espaço</h2><p>{members.length} conta(s) vinculada(s)</p></div></div><div className="team-list">{members.map((member) => <div className={member.active ? "team-row" : "team-row inactive"} key={member.userId}><div className="team-avatar">{(member.fullName || member.email).slice(0, 1).toUpperCase()}</div><div className="grow"><strong>{member.fullName || "Usuário"}{member.userId === currentUserId ? " (você)" : ""}</strong><span>{member.email}</span></div><span className="role-badge">{roleLabels[member.role]}</span>{(member.role === "admin" || member.mfaRequired) && <span className="mfa-badge"><ShieldCheck size={14} />2FA exigido</span>}{isAdmin && <button className="button secondary" disabled={busy} onClick={() => openEditor(member)}><Pencil size={15} />Editar</button>}</div>)}</div></section>
    {editing && <div className="modal-backdrop"><form className="modal member-editor" onSubmit={saveMember}><div className="modal-head"><div><p className="eyebrow">Administração segura</p><h2>Editar usuário</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)}><X size={18} /></button></div><div className="member-editor-grid"><label>Nome<input required value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>E-mail<input required type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label><label>Perfil<select value={editRole} disabled={editing.role === "admin" || editing.userId === currentUserId} onChange={(event) => setEditRole(event.target.value as PraxisRole)}><option value="admin">Administrador</option><option value="procurador">Procurador</option><option value="assessor">Assessor/servidor</option><option value="consulta">Somente consulta</option></select></label><label className="member-check"><input type="checkbox" checked={editActive} disabled={editing.userId === currentUserId} onChange={(event) => setEditActive(event.target.checked)} /><span>Conta ativa</span></label><label className="member-check full"><input type="checkbox" checked={editMfa} disabled={editing.role === "admin"} onChange={(event) => setEditMfa(event.target.checked)} /><span>Exigir autenticação em dois fatores neste login{editing.role === "admin" ? " (obrigatório para administrador)" : ""}</span></label></div><div className="member-security-note"><ShieldCheck size={18} /><span>A senha nunca é exibida ao administrador. A redefinição é feita por um link individual enviado ao e-mail cadastrado.</span></div><div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={resetPassword}><KeyRound size={17} />Redefinir senha</button><span className="grow" /><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button></div></form></div>}
  </div>;
}
