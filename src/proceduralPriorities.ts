import type { ProceduralPriority } from "./types";

export const PROCEDURAL_PRIORITY_OPTIONS: ReadonlyArray<{ value: ProceduralPriority; label: string }> = [
  { value: "Nenhuma", label: "Sem prioridade processual" },
  { value: "Idoso", label: "Pessoa idosa (60 anos ou mais)" },
  { value: "Idoso +80", label: "Pessoa idosa (80 anos ou mais)" },
  { value: "ECA", label: "Criança ou adolescente (ECA)" },
  { value: "Doença grave", label: "Pessoa com doença grave" },
];

export function proceduralPriorityLabel(value: ProceduralPriority | undefined): string {
  return PROCEDURAL_PRIORITY_OPTIONS.find((item) => item.value === value)?.label ?? PROCEDURAL_PRIORITY_OPTIONS[0].label;
}
