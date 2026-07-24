import { useEffect, useMemo, useState } from "react";
import { Clipboard, KeyRound, Link2, Mail, Pencil, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { createManagedTeamMember, listTeamMembers, sendMemberPasswordReset, updateTeamMemberProfile } from "../api";
import { requireSupabase } from "../supabase";
import type { PraxisRole, TeamMember } from "../types";

const roleLabels: Record<PraxisRole, string> = {
  admin: "Administrador",
  procurador: "Procurador",
  assessor: "Assessor/servidor",
  consulta: "Somente consulta",
};

export function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PraxisRole>("assessor");
  const [coverageSince, setCoverageSince] = useState("");
  const [delivery, setDelivery] = useState<"email" | "link">("link");
  const [generatedLink, setGeneratedLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<PraxisRole>("assessor");
  const [editActive, setEditActive] = useState(true);
  const [editMfa, setEditMfa] = useState(false);
  const [editCoverageSince, setEditCoverageSince] = useState("");

  async function reload() {
    const [{ data }, items] = await Promise.all([requireSupabase().auth.getUser(), listTeamMembers()]);
    setCurrentUserId(data.user?.id ?? "");
    setMembers(items);
  }
  useEffect(() => { reload().catch((error) => setMessage(String(error))); }, []);
  const me = useMemo(() => members.find((item) => item.userId === currentUserId), [members, currentUserId]);
  const isAdmin = me?.role === "admin";

  async function createMember(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setGeneratedLink("");
    try {
      const result = await createManagedTeamMember({
        fullName,
        email,
        role,
        historicalCoverageSince: coverageSince || null,
        delivery,
      });
      setGeneratedLink(result.link ?? "");
      setMessage(result.emailSent
        ? "Conta criada. O link individual para cadastrar a senha foi enviado por e-mail."
        : "Conta criada. Copie o link individual abaixo e entregue ao usuário por um canal seguro.");
      setFullName("");
      setEmail("");
      setCoverageSince("");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function openEditor(member: TeamMember) {
    setEditing(member);
    setEditName(member.fullName);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditActive(member.active);
    setEditMfa(member.role === "admin" || member.mfaRequired);
    setEditCoverageSince(member.historicalCoverageSince ?? "");
    setMessage("");
  }

  async function saveMember(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage("");
    try {
      await updateTeamMemberProfile(editing, {
        fullName: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        active: editActive,
        mfaRequired: editing.role === "admin" || editMfa,
        historicalCoverageSince: editCoverageSince || null,
      });
      setEditing(null);
      await reload();
      setMessage("Dados do usuário atualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!editing || !window.confirm(`Enviar um e-mail de redefinição de senha para ${editing.email}?`)) return;
    setBusy(true);
    setMessage("");
    try {
      await sendMemberPasswordReset(editing);
      setMessage("E-mail de redefinição de senha enviado.");
      setEditing(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Acesso compartilhado</p><h1>Equipe</h1><p>Cadastro administrativo, cobertura histórica, perfis e segurança.</p></div></div>

    {isAdmin && <section className="panel managed-member-card">
      <div className="panel-title"><div><h2>Cadastrar usuário</h2><p>A conta é criada pelo administrador; o usuário define a própria senha no primeiro acesso.</p></div><UserPlus size={22} /></div>
      <form className="managed-member-form" onSubmit={createMember}>
        <label>Nome completo<input required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Perfil<select value={role} onChange={(event) => setRole(event.target.value as PraxisRole)}><option value="procurador">Procurador</option><option value="assessor">Assessor/servidor</option><option value="consulta">Somente consulta</option></select></label>
        <label>Histórico disponível a partir de<input type="date" value={coverageSince} onChange={(event) => setCoverageSince(event.target.value)} /><small>Preencha somente com uma data confirmada. O sistema não a deduz dos processos.</small></label>
        <fieldset className="delivery-choice"><legend>Entrega do primeiro acesso</legend>
          <label><input type="radio" checked={delivery === "link"} onChange={() => setDelivery("link")} /><Link2 size={17} /><span>Gerar link para o administrador copiar</span></label>
          <label><input type="radio" checked={delivery === "email"} onChange={() => setDelivery("email")} /><Mail size={17} /><span>Enviar link por e-mail</span></label>
        </fieldset>
        <button className="button primary" disabled={busy}>{busy ? "Cadastrando..." : "Cadastrar usuário"}</button>
      </form>
      {generatedLink && <div className="first-access-link"><span>Link individual de primeiro acesso</span><code>{generatedLink}</code><button className="button secondary" onClick={() => void navigator.clipboard.writeText(generatedLink)}><Clipboard size={17} />Copiar link</button><small>Entregue somente ao usuário cadastrado. O link é de uso único e obedece ao prazo configurado no Supabase.</small></div>}
    </section>}

    {message && <div className="info-box">{message}</div>}
    <section className="panel"><div className="panel-title"><div><h2>Usuários do espaço</h2><p>{members.length === 1 ? "1 conta vinculada" : `${members.length} contas vinculadas`}</p></div><Users size={21} /></div>
      <div className="team-list">{members.map((member) => <div className={member.active ? "team-row" : "team-row inactive"} key={member.userId}>
        <div className="team-avatar">{(member.fullName || member.email).slice(0, 1).toUpperCase()}</div>
        <div className="grow"><strong>{member.fullName || "Usuário"}{member.userId === currentUserId ? " (você)" : ""}</strong><span>{member.email}</span><small>{member.historicalCoverageSince ? `Histórico confirmado desde ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${member.historicalCoverageSince}T12:00:00`))}` : "Cobertura histórica ainda não configurada"}</small></div>
        <span className="role-badge">{roleLabels[member.role]}</span>
        {(member.role === "admin" || member.mfaRequired) && <span className="mfa-badge"><ShieldCheck size={14} />2FA exigido</span>}
        {isAdmin && <button className="button secondary" disabled={busy} onClick={() => openEditor(member)}><Pencil size={15} />Editar</button>}
      </div>)}</div>
    </section>

    {editing && <div className="modal-backdrop"><form className="modal member-editor" onSubmit={saveMember}>
      <div className="modal-head"><div><p className="eyebrow">Administração segura</p><h2>Editar usuário</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)}><X size={18} /></button></div>
      <div className="member-editor-grid">
        <label>Nome<input required value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
        <label>E-mail<input required type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></label>
        <label>Perfil<select value={editRole} disabled={editing.role === "admin" || editing.userId === currentUserId} onChange={(event) => setEditRole(event.target.value as PraxisRole)}><option value="admin">Administrador</option><option value="procurador">Procurador</option><option value="assessor">Assessor/servidor</option><option value="consulta">Somente consulta</option></select></label>
        <label>Histórico disponível a partir de<input type="date" value={editCoverageSince} onChange={(event) => setEditCoverageSince(event.target.value)} /><small>Deixe vazio enquanto a data real não estiver confirmada.</small></label>
        <label className="member-check"><input type="checkbox" checked={editActive} disabled={editing.userId === currentUserId} onChange={(event) => setEditActive(event.target.checked)} /><span>Conta ativa</span></label>
        <label className="member-check full"><input type="checkbox" checked={editMfa} disabled={editing.role === "admin"} onChange={(event) => setEditMfa(event.target.checked)} /><span>Exigir autenticação em dois fatores{editing.role === "admin" ? " (obrigatório para administrador)" : ""}</span></label>
      </div>
      <div className="member-security-note"><ShieldCheck size={18} /><span>A senha nunca é exibida ao administrador. A redefinição ocorre por link individual.</span></div>
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={resetPassword}><KeyRound size={17} />Redefinir senha</button><span className="grow" /><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button></div>
    </form></div>}
  </div>;
}
