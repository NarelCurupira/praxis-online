import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red";
}

export function StatCard({ label, value, helper, icon: Icon, tone = "blue" }: Props) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon"><Icon size={21} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>
    </div>
  );
}
