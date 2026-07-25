import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

interface Props { title: string; children: ReactNode; }
export function HelpTip({ title, children }: Props) {
  return <details className="help-tip">
    <summary aria-label={`Ajuda: ${title}`} title={`Ajuda: ${title}`}><CircleHelp size={16} /></summary>
    <div className="help-tip-popover" role="tooltip"><strong>{title}</strong><span>{children}</span></div>
  </details>;
}
