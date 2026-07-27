import assert from "node:assert/strict";
import test from "node:test";
import { authenticationMethodsFromAccessToken, sessionUsesPasskey } from "./authenticationMethod";

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function token(payload: Record<string, unknown>): string {
  return `${base64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${base64Url(JSON.stringify(payload))}.signature`;
}

test("reconhece login por passkey pelo AMR emitido no JWT", () => {
  const accessToken = token({ amr: [{ method: "passkey", timestamp: 1 }] });
  assert.equal(sessionUsesPasskey({ access_token: accessToken }), true);
  assert.deepEqual(authenticationMethodsFromAccessToken(accessToken), ["passkey"]);
});

test("não dispensa o segundo fator quando o login foi por senha", () => {
  const accessToken = token({ amr: [{ method: "password", timestamp: 1 }] });
  assert.equal(sessionUsesPasskey({ access_token: accessToken }), false);
});

test("mantém a identificação da passkey após métodos adicionais no token", () => {
  const accessToken = token({ amr: [
    { method: "passkey", timestamp: 1 },
    { method: "token_refresh", timestamp: 2 },
  ] });
  assert.equal(sessionUsesPasskey({ access_token: accessToken }), true);
});

test("falha de forma segura com token inválido", () => {
  assert.equal(sessionUsesPasskey({ access_token: "token-invalido" }), false);
  assert.deepEqual(authenticationMethodsFromAccessToken("token-invalido"), []);
});
