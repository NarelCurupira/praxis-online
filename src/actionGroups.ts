export type ActionGroupName =
  | "Intervenção"
  | "Desnecessária intervenção"
  | "Diligências e medidas processuais"
  | "Ciência"
  | "Outras providências";

export interface ActionGroupDetail { name: string; value: number; }
export interface ActionGroupSummary {
  name: ActionGroupName;
  value: number;
  percentage: number;
  details: ActionGroupDetail[];
}

const ORDER: ActionGroupName[] = [
  "Intervenção",
  "Diligências e medidas processuais",
  "Desnecessária intervenção",
  "Ciência",
  "Outras providências",
];

function fold(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function actionGroupName(value: string): ActionGroupName {
  const normalized = fold(value);
  if (!normalized) return "Outras providências";
  if (normalized.includes("desnecessaria") && normalized.includes("intervencao")) return "Desnecessária intervenção";
  if (["diligencia", "prevencao", "sobrestamento", "suspeicao"].some((item) => normalized === item || normalized.startsWith(`${item} `))) return "Diligências e medidas processuais";
  if (normalized === "ciencia" || normalized.startsWith("ciencia fundamentada")) return "Ciência";
  if (["manifestacao", "contrarrazoes", "recurso", "ratifico"].some((item) => normalized === item || normalized.startsWith(`${item} `))) return "Intervenção";
  return "Outras providências";
}

export function summarizeActionGroups(actions: string[]): ActionGroupSummary[] {
  const groups = new Map<ActionGroupName, Map<string, { name: string; value: number }>>();
  for (const action of actions) {
    const label = action.trim() || "Não informada";
    const group = actionGroupName(label);
    const detailMap = groups.get(group) ?? new Map<string, { name: string; value: number }>();
    const key = fold(label);
    const current = detailMap.get(key);
    if (current) current.value += 1;
    else detailMap.set(key, { name: label, value: 1 });
    groups.set(group, detailMap);
  }
  const total = actions.length;
  return ORDER.flatMap((name) => {
    const details = [...(groups.get(name)?.values() ?? [])].sort((a,b) => b.value-a.value || a.name.localeCompare(b.name,"pt-BR"));
    const value = details.reduce((sum,item)=>sum+item.value,0);
    return value ? [{ name, value, percentage: total ? value/total*100 : 0, details }] : [];
  });
}
