export const PASSKEY_DEVICE_ENABLED_KEY = "praxis-passkey-device-enabled";

export interface PasskeyCapability {
  eligibleDevice: boolean;
  secureContext: boolean;
  webAuthnAvailable: boolean;
  platformAuthenticatorAvailable: boolean;
  supported: boolean;
  deviceLabel: string;
}

export function eligiblePasskeyDevice(userAgent: string, platform = ""): { eligible: boolean; label: string } {
  const source = `${userAgent} ${platform}`;
  if (/iPhone|iPad|iPod/i.test(source)) return { eligible: true, label: "Face ID ou Touch ID" };
  if (/Android/i.test(source)) return { eligible: true, label: "biometria do celular" };
  if (/Macintosh|MacIntel|Mac OS X|\bMac\b/i.test(source)) return { eligible: true, label: "Touch ID" };
  return { eligible: false, label: "biometria" };
}

export function isPasskeyEnabledForThisBrowser(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try { return storage.getItem(PASSKEY_DEVICE_ENABLED_KEY) === "true"; }
  catch { return false; }
}

export function setPasskeyEnabledForThisBrowser(enabled: boolean, storage: Pick<Storage, "setItem" | "removeItem"> = localStorage): void {
  try {
    if (enabled) storage.setItem(PASSKEY_DEVICE_ENABLED_KEY, "true");
    else storage.removeItem(PASSKEY_DEVICE_ENABLED_KEY);
  } catch {
    // Preferência local não persistente.
  }
}

export async function detectPasskeyCapability(): Promise<PasskeyCapability> {
  const navigatorValue = typeof navigator === "undefined" ? null : navigator;
  const device = eligiblePasskeyDevice(navigatorValue?.userAgent ?? "", navigatorValue?.platform ?? "");
  const secureContext = typeof window !== "undefined" && window.isSecureContext;
  const webAuthnAvailable = typeof PublicKeyCredential !== "undefined";
  let platformAuthenticatorAvailable = false;

  if (device.eligible && secureContext && webAuthnAvailable && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
    try { platformAuthenticatorAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { platformAuthenticatorAvailable = false; }
  }

  return {
    eligibleDevice: device.eligible,
    secureContext,
    webAuthnAvailable,
    platformAuthenticatorAvailable,
    supported: device.eligible && secureContext && webAuthnAvailable && platformAuthenticatorAvailable,
    deviceLabel: device.label,
  };
}

export function friendlyPasskeyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel|abort|notallowed/i.test(message)) return "A autenticação biométrica foi cancelada.";
  if (/passkey_disabled/i.test(message)) return "O acesso por biometria ainda não foi habilitado no Supabase.";
  if (/credential_exists/i.test(message)) return "Este dispositivo já possui uma credencial cadastrada.";
  if (/credential_not_found/i.test(message)) return "A credencial deste dispositivo não foi encontrada. Entre com e-mail e senha e cadastre novamente.";
  if (/challenge_expired/i.test(message)) return "A solicitação expirou. Tente novamente.";
  return message;
}
