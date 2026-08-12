import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const teamSource = readFileSync(new URL("./components/TeamPage.tsx", import.meta.url), "utf8");
const functionSource = readFileSync(new URL("../supabase/functions/admin-manage-user/index.ts", import.meta.url), "utf8");

test("redefinição de senha usa a função administrativa protegida", () => {
  const resetFunction = apiSource.slice(
    apiSource.indexOf("export async function sendMemberPasswordReset"),
    apiSource.indexOf("export async function teamComparativeReport"),
  );
  assert.match(resetFunction, /functions\.invoke\("admin-manage-user"/);
  assert.match(resetFunction, /action:\s*"reset_password"/);
  assert.match(resetFunction, /targetUserId:\s*member\.userId/);
  assert.doesNotMatch(resetFunction, /client\.auth\.resetPasswordForEmail/);
});

test("backend valida vínculo, envia o e-mail e registra auditoria", () => {
  const resetAction = functionSource.slice(functionSource.indexOf('if (action === "reset_password")'));
  assert.match(resetAction, /from\("workspace_members"\)/);
  assert.match(resetAction, /auth\.admin\.getUserById\(targetUserId\)/);
  assert.match(resetAction, /auth\.resetPasswordForEmail\(targetData\.user\.email/);
  assert.match(resetAction, /member_password_reset_requested/);
});

test("interface aguarda o envio e apresenta resultado ao administrador", () => {
  assert.match(teamSource, /await sendMemberPasswordReset\(editing\)/);
  assert.match(teamSource, /E-mail de redefinição enviado/);
  assert.match(teamSource, /busy \? "Enviando\.\.\." : "Redefinir senha"/);
  assert.match(teamSource, /className="member-editor-message" role="status"/);
});


test("cadastro administrativo aceita o perfil estagiário", () => {
  const createAction = functionSource.slice(
    functionSource.indexOf('if (action === "create_member")'),
    functionSource.indexOf('if (action === "update_email")'),
  );
  assert.match(createAction, /"procurador", "assessor", "estagiario", "consulta"/);
});
