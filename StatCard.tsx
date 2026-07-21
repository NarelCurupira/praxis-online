import { Activity, ClipboardList, Database, FileSpreadsheet, FileText, Gavel, Info, LayoutDashboard, ListTodo, Settings, ShieldCheck, Trash2, Users } from "lucide-react";
import type { Page } from "../types";

const items: Array<{ page: Page; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { page: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { page: "queue", label: "Minha fila", icon: ListTodo },
  { page: "processes", label: "Processos", icon: Gavel },
  { page: "efficiency", label: "Eficiência", icon: Activity },
  { page: "reports", label: "Relatórios", icon: FileText },
  { page: "quality", label: "Qualidade dos dados", icon: ShieldCheck, adminOnly: true },
  { page: "import", label: "Importar e backup", icon: FileSpreadsheet },
  { page: "trash", label: "Lixeira", icon: Trash2 },
  { page: "team", label: "Equipe", icon: Users, adminOnly: true },
  { page: "settings", label: "Configurações", icon: Settings, adminOnly: true },
  { page: "audit", label: "Auditoria", icon: ClipboardList, adminOnly: true },
  { page: "about", label: "Sobre", icon: Info },
];

interface Props {
  page: Page;
  isAdmin: boolean;
  onChange: (page: Page) => void;
}

export function Sidebar({ page, isAdmin, onChange }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-mark" src="/praxis-icon.png" alt="" />
        <div><strong>Práxis</strong><span>Controle de Processos</span></div>
      </div>
      <nav>
        {items.filter((item) => !item.adminOnly || isAdmin).map(({ page: itemPage, label, icon: Icon }) => (
          <button className={page === itemPage ? "nav-item active" : "nav-item"} key={itemPage} onClick={() => onChange(itemPage)}>
            <Icon size={19} />{label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot"><Database size={16} /><span>Banco online protegido</span></div>
    </aside>
  );
}
