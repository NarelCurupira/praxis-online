import { Activity, ClipboardList, Database, FileSpreadsheet, FileText, Gavel, Info, LayoutDashboard, ListTodo, Settings, ShieldCheck, Trash2, Users } from "lucide-react";
import type { AccessCapabilities } from "../access";
import type { Page } from "../types";

const items: Array<{ page: Page; label: string; icon: typeof LayoutDashboard }> = [
  { page: "dashboard", label: "Visão geral", icon: LayoutDashboard },
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
interface Props { page: Page; access: AccessCapabilities; onChange: (page: Page) => void; }
export function Sidebar({ page, access, onChange }: Props) {
  return <aside className="sidebar"><div className="brand"><img className="brand-logo brand-logo-light" src="/brand/logo-horizontal-light.webp" alt="Práxis — Controle de Processos" /><img className="brand-logo brand-logo-dark" src="/brand/logo-horizontal-dark.webp" alt="Práxis — Controle de Processos" /><img className="brand-symbol brand-symbol-light" src="/brand/symbol-light.webp" alt="Práxis" /><img className="brand-symbol brand-symbol-dark" src="/brand/symbol-dark.webp" alt="Práxis" /></div><nav>{items.filter((item) => access.visiblePages.has(item.page)).map(({ page: itemPage, label, icon: Icon }) => <button aria-label={label} className={page === itemPage ? "nav-item active" : "nav-item"} key={itemPage} onClick={() => onChange(itemPage)}><Icon size={19} /><span className="nav-label">{label}</span><span className="nav-tooltip" role="tooltip">{label}</span></button>)}</nav><div className="sidebar-foot"><Database size={16} /><span>Banco online protegido</span></div></aside>;
}
