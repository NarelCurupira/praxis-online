export function actionLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "di" || normalized === "desnecessária intervenção" || normalized === "desnecessaria intervencao") {
    return "Desnecessária Intervenção";
  }
  if (normalized === "ctrz" || normalized === "contrarrazões" || normalized === "contrarrazoes") {
    return "Contrarrazões";
  }
  return value || "Não classificado";
}

export function isUnnecessaryIntervention(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "di" || normalized === "desnecessária intervenção" || normalized === "desnecessaria intervencao";
}
