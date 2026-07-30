import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red";
  onClick?: () => void;
}

export function StatCard({ label, value, helper, icon: Icon, tone = "blue", onClick }: Props) {
  const content = <>
    <div className="stat-icon"><Icon size={21} /></div>
    <div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>
  </>;
  return (
    onClick
      ? <button type="button" className={`stat-card stat-card-link ${tone}`} onClick={onClick}>{content}</button>
      : <div className={`stat-card ${tone}`}>{content}</div>
  );
}
