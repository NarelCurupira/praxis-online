import type { CalendarExclusion, ClassSetting, ClosedPeriod, WorkspaceSettings } from "./types";
import { PRAXIS_VERSION } from "./version";

export interface PraxisConfigurationExport {
  format: "praxis-settings";
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  notice: string;
  workspaceSettings: WorkspaceSettings;
  classSettings: ClassSetting[];
  calendarExclusions: CalendarExclusion[];
  closedPeriods: ClosedPeriod[];
}

export function buildConfigurationExport(input: {
  settings: WorkspaceSettings;
  classes: ClassSetting[];
  exclusions: CalendarExclusion[];
  closedPeriods: ClosedPeriod[];
  exportedAt?: string;
}): PraxisConfigurationExport {
  return {
    format: "praxis-settings",
    schemaVersion: 1,
    appVersion: PRAXIS_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    notice: "Arquivo de configurações do Práxis. Não contém processos, senhas, passkeys, tokens ou conteúdo processual.",
    workspaceSettings: structuredClone(input.settings),
    classSettings: structuredClone(input.classes),
    calendarExclusions: structuredClone(input.exclusions),
    closedPeriods: structuredClone(input.closedPeriods),
  };
}

export function configurationExportFileName(date = new Date()): string {
  return `praxis-configuracoes-${date.toISOString().slice(0, 10)}.json`;
}

export function downloadConfigurationExport(value: PraxisConfigurationExport): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = configurationExportFileName(new Date(value.exportedAt));
  anchor.click();
  URL.revokeObjectURL(url);
}
