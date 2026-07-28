import { detectPasskeyCapability } from "./passkeySupport";
import { requireSupabase } from "./supabase";

export interface StrongAuthenticationAvailability {
  passkey: boolean;
  totp: boolean;
}

export async function strongAuthenticationAvailability(): Promise<StrongAuthenticationAvailability> {
  const client = requireSupabase();
  const [capability, factors] = await Promise.all([
    detectPasskeyCapability().catch(() => ({ supported: false } as Awaited<ReturnType<typeof detectPasskeyCapability>>)),
    client.auth.mfa.listFactors(),
  ]);

  return {
    passkey: Boolean(capability.supported),
    totp: Boolean(factors.data?.totp.some((factor) => factor.status === "verified")),
  };
}

export async function confirmWithPasskey(): Promise<void> {
  const client = requireSupabase();
  const auth = client.auth as typeof client.auth & {
    signInWithPasskey?: () => Promise<{ error?: Error | null }>;
  };
  if (!auth.signInWithPasskey) throw new Error("O acesso por passkey não está disponível neste navegador.");
  const result = await auth.signInWithPasskey();
  if (result.error) throw result.error;
}

export async function confirmWithTotp(code: string): Promise<void> {
  const client = requireSupabase();
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  const factor = factors.data.totp.find((item) => item.status === "verified");
  if (!factor) throw new Error("Nenhum autenticador TOTP verificado foi encontrado para esta conta.");

  const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) throw challenge.error;

  const verification = await client.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  });
  if (verification.error) throw verification.error;
}
