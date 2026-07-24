import React from "react";
import { createRoot } from "react-dom/client";
import { EfficiencyPage } from "../src/components/EfficiencyPage";
import type { ProcessMovement, TeamMember } from "../src/types";
import "../src/styles.css";

const members: TeamMember[] = [
  { userId: "marcos", fullName: "Marcos Antonio Santos Machado", email: "marcos@example.test", role: "admin", active: true, mfaRequired: true, historicalCoverageSince: "2024-01-01" },
  { userId: "hurias", fullName: "Hurias Pinheiro Andrade", email: "hurias@example.test", role: "assessor", active: true, mfaRequired: false, historicalCoverageSince: "2026-01-01" },
];

function movement(id: number, assignedTo: string, receivedAt: string, sentAt: string | null, elapsedHours: number | null, extra: Partial<ProcessMovement> = {}): ProcessMovement {
  return {
    movementId: id, caseId: id, mpNumber: `MP-${id}`, judicialNumber: `0000000-00.2026.8.14.${String(id).padStart(4, "0")}`,
    className: "Agravo de Instrumento", subject: "Assunto", receivedAt, deadlineAt: "2026-08-10",
    draftStatus: sentAt ? "Minutado" : "Pendente", workflowStatus: sentAt ? "Enviado" : "Recebido", sentAt,
    actionType: "Manifestação", notes: "", priority: "Normal", documentPath: "", elapsedHours,
    sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "", fundamentalRight: "",
    affectedGroup: "", reach: "", territorialScope: "", impactType: "", socialResult: "", sdgs: [],
    complexityReason: "", deletedAt: null, assignedTo, assignedName: assignedTo === "marcos" ? members[0].fullName : members[1].fullName,
    ...extra,
  };
}

const records: ProcessMovement[] = [];
for (let month = 0; month < 7; month += 1) {
  const mm = String(month + 1).padStart(2, "0");
  for (let index = 0; index < 5 + month; index += 1) {
    const id = records.length + 1;
    const assignedTo = index % 3 ? "marcos" : "hurias";
    const day = String(Math.min(25, index + 2)).padStart(2, "0");
    records.push(movement(id, assignedTo, `2026-${mm}-${day}T09:00:00`, `2026-${mm}-${day}T${index % 2 ? "11" : "15"}:00:00`, index % 2 ? 2 : 6, {
      sociallyRelevant: index % 7 === 0,
      extremelyComplex: index % 9 === 0,
    }));
  }
}
records.push(movement(100, "hurias", "2026-02-10T09:00:00", null, null, { deadlineAt: "2026-02-20" }));

createRoot(document.getElementById("root")!).render(<main style={{ padding: 24, maxWidth: 1500, margin: "0 auto" }}><EfficiencyPage records={records} members={members} currentUserId="marcos" isAdmin /></main>);
