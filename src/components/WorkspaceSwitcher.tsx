import { Building2, ChevronDown } from "lucide-react";
import type { AvailableWorkspace } from "../workspaceApi";

interface Props {
  workspaces: AvailableWorkspace[];
  currentWorkspaceId?: string;
  busy?: boolean;
  onSwitch: (workspaceId: string) => Promise<void>;
}

export function WorkspaceSwitcher({ workspaces, currentWorkspaceId, busy = false, onSwitch }: Props) {
  const current = workspaces.find((item) => item.workspaceId === currentWorkspaceId || item.current) ?? workspaces[0];
  if (!current) return null;

  if (workspaces.length <= 1) {
    return <div className="workspace-indicator" title="Procuradoria atual"><Building2 size={17} /><span>{current.name}</span></div>;
  }

  return <label className="workspace-switcher" title="Alterar Procuradoria ativa">
    <Building2 size={17} />
    <span className="workspace-switcher-label">Procuradoria</span>
    <select
      aria-label="Procuradoria ativa"
      disabled={busy}
      value={current.workspaceId}
      onChange={(event) => void onSwitch(event.target.value)}
    >
      {workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
    </select>
    <ChevronDown className="workspace-switcher-chevron" size={15} aria-hidden="true" />
  </label>;
}
