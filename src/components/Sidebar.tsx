import { useEffect, useState } from "react";
import { Activity, Bell, ClipboardList, Database, FileSpreadsheet, FileText, Gavel, Info, LayoutDashboard, ListTodo, LogOut, Settings, ShieldCheck, Trash2, UserRound, Users, X } from "lucide-react";
import type { AccessCapabilities } from "../access";
import type { Page } from "../types";

const items: Array<{ page: Page; label: string; icon: typeof LayoutDashboard }> = [
  { page: "dashboard", label: "Início", icon: LayoutDashboard },
  { page: "queue", label: "Minha fila", icon: ListTodo },
  { page: "processes", label: "Processos", icon: Gavel },
  { page: "efficiency", label: "Eficiência", icon: Activity },
  { page: "reports", label: "Relatórios", icon: FileText },
  { page: "quality", label: "Qualidade dos dados", icon: ShieldCheck },
  { page: "import", label: "Importar e backup", icon: FileSpreadsheet },
  { page: "trash", label: "Lixeira", icon: Trash2 },
  { page: "team", label: "Equipe", icon: Users },
  { page: "settings", label: "Configurações", icon: Settings },
  { page: "audit", label: "Auditoria e diagnóstico", icon: ClipboardList },
  { page: "about", label: "Sobre", icon: Info },
];

interface Props {
  page: Page;
  access: AccessCapabilities;
  onChange: (page: Page) => void;
}

export function Sidebar({ page, access, onChange }: Props) {
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const navigateFromProduct = (event: Event) => {
      const target = (event as CustomEvent<Page>).detail;
      if (!target || !access.visiblePages.has(target)) return;
      onChange(target);
    };

    window.addEventListener("praxis:navigate", navigateFromProduct);
    return () => window.removeEventListener("praxis:navigate", navigateFromProduct);
  }, [access.visiblePages, onChange]);

  useEffect(() => {
    const openProfileMenu = () => setProfileOpen(true);
    window.addEventListener("praxis:open-profile-menu", openProfileMenu);
    return () => window.removeEventListener("praxis:open-profile-menu", openProfileMenu);
  }, []);

  function openCentral() {
    setProfileOpen(false);
    window.dispatchEvent(new CustomEvent("praxis:open-information-center"));
  }

  function openPageFromProfile(target: Page) {
    if (!access.visiblePages.has(target)) return;
    setProfileOpen(false);
    onChange(target);
  }

  function logoutFromProfile() {
    setProfileOpen(false);
    const logoutButton = document.querySelector<HTMLButtonElement>('.topbar button[title="Sair"]');
    logoutButton?.click();
  }

  return <>
    <aside className="sidebar">
      <div className="brand praxis1-brand">
        <img className="praxis1-brand-logo praxis1-brand-logo-light" src="/brand/praxis-1-logo-light.webp" alt="Práxis" />
        <img className="praxis1-brand-logo praxis1-brand-logo-dark" src="/brand/praxis-1-logo-dark.webp" alt="Práxis" />
        <img className="praxis1-brand-mark" src="/brand/praxis-1-mark.webp" alt="Práxis" />
        <img className="brand-symbol brand-symbol-light praxis1-brand-symbol" src="/brand/symbol-light.webp" alt="" aria-hidden="true" />
        <img className="brand-symbol brand-symbol-dark praxis1-brand-symbol" src="/brand/symbol-dark.webp" alt="" aria-hidden="true" />
      </div>

      <nav className="sidebar-nav">
        {items
          .filter((item) => access.visiblePages.has(item.page))
          .map(({ page: itemPage, label, icon: Icon }) =>
            <button
              aria-label={label}
              className={page === itemPage ? "nav-item active" : "nav-item"}
              key={itemPage}
              onClick={() => onChange(itemPage)}
            >
              <Icon size={19} />
              <span className="nav-label">{label}</span>
              <span className="nav-tooltip" role="tooltip">{label}</span>
            </button>
          )}
      </nav>

      <div className="sidebar-foot praxis1-sidebar-foot">
        <Database size={16} />
        <span>Práxis 1.0 · ambiente protegido</span>
      </div>
    </aside>

    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      <button type="button" className={page === "dashboard" ? "active" : ""} onClick={() => onChange("dashboard")} aria-label="Início">
        <LayoutDashboard /><span>Início</span>
      </button>

      {access.visiblePages.has("queue")
        ? <button type="button" className={page === "queue" ? "active" : ""} onClick={() => onChange("queue")} aria-label="Minha fila">
            <ListTodo /><span>Fila</span>
          </button>
        : <span />}

      {access.visiblePages.has("processes")
        ? <button type="button" className={page === "processes" ? "active" : ""} onClick={() => onChange("processes")} aria-label="Processos">
            <Gavel /><span>Processos</span>
          </button>
        : <span />}

      <button type="button" onClick={openCentral} aria-label="Central de Informações">
        <Bell /><span>Central</span>
      </button>

      <button type="button" className={profileOpen ? "active" : ""} onClick={() => setProfileOpen(true)} aria-label="Perfil e menu">
        <UserRound /><span>Perfil</span>
      </button>
    </nav>

    {profileOpen && <>
      <button
        type="button"
        className="p1-profile-backdrop"
        aria-label="Fechar perfil e menu"
        onClick={() => setProfileOpen(false)}
      />
      <section className="p1-profile-menu" aria-label="Perfil e menu">
        <header>
          <span className="p1-profile-menu-icon"><UserRound /></span>
          <span>
            <strong>Perfil e menu</strong>
            <small>Preferências, informações e sessão</small>
          </span>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setProfileOpen(false)}><X /></button>
        </header>

        <div className="p1-profile-menu-actions">
          {access.visiblePages.has("settings") && (
            <button type="button" onClick={() => openPageFromProfile("settings")}>
              <Settings /><span><strong>Configurações</strong><small>Preferências e ajustes disponíveis</small></span>
            </button>
          )}
          {access.visiblePages.has("about") && (
            <button type="button" onClick={() => openPageFromProfile("about")}>
              <Info /><span><strong>Sobre o Práxis</strong><small>Versão e informações do aplicativo</small></span>
            </button>
          )}
          <button type="button" className="danger" onClick={logoutFromProfile}>
            <LogOut /><span><strong>Sair</strong><small>Encerrar esta sessão</small></span>
          </button>
        </div>
      </section>
    </>}
  </>;
}
