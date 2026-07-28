interface AuthenticationMethodReference {
  method?: unknown;
}

interface AccessTokenClaims {
  amr?: unknown;
  authentication_method?: unknown;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function accessTokenClaims(accessToken: string): AccessTokenClaims | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const parsed = JSON.parse(decodeBase64Url(payload));
    return parsed && typeof parsed === "object" ? parsed as AccessTokenClaims : null;
  } catch {
    return null;
  }
}

export function authenticationMethodsFromAccessToken(accessToken: string): string[] {
  const claims = accessTokenClaims(accessToken);
  if (!claims) return [];

  const methods = new Set<string>();
  const amr = Array.isArray(claims.amr) ? claims.amr : [];

  for (const entry of amr) {
    if (typeof entry === "string") methods.add(entry.toLowerCase());
    else if (entry && typeof entry === "object") {
      const method = (entry as AuthenticationMethodReference).method;
      if (typeof method === "string") methods.add(method.toLowerCase());
    }
  }

  if (typeof claims.authentication_method === "string") {
    methods.add(claims.authentication_method.toLowerCase());
  }

  return [...methods];
}

/**
 * Uma passkey é identificada exclusivamente pelo método "passkey" emitido
 * pelo Supabase no JWT. Não se usa preferência do navegador ou localStorage
 * como decisão de segurança.
 */
const STRONG_WEBAUTHN_METHODS = new Set(["passkey", "webauthn", "mfa/webauthn"]);

export function sessionUsesPasskey(session: { access_token: string }): boolean {
  return authenticationMethodsFromAccessToken(session.access_token).some((method) => STRONG_WEBAUTHN_METHODS.has(method));
}
