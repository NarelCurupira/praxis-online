import type { ClassSetting } from "./types";

export const REQUIRED_APPEAL_CLASSES: ClassSetting[] = [
  { name: "Recurso Especial", businessDays: 30 },
  { name: "Recurso Extraordinário", businessDays: 30 },
];

export function withRequiredAppealClasses(classes: ClassSetting[]): ClassSetting[] {
  const merged = [...classes];
  const knownNames = new Set(classes.map((item) => item.name.trim().toLocaleLowerCase("pt-BR")));

  for (const requiredClass of REQUIRED_APPEAL_CLASSES) {
    if (!knownNames.has(requiredClass.name.toLocaleLowerCase("pt-BR"))) {
      merged.push(requiredClass);
    }
  }

  return merged.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}
