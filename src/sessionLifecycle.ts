import { requireSupabase } from "./supabase";
import { clearWorkspaceContext } from "./workspaceContext";
import { clearMovementRevisions } from "./movementOperations";

export async function endLocalSession(): Promise<void> {
  // Obtém apenas uma instalação existente; ready poderia esperar indefinidamente.
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      // Primeiro invalida o endpoint no navegador, mesmo sem rede ou com JWT expirado.
      await subscription.unsubscribe();
      await Promise.race([
        requireSupabase().rpc("remove_push_subscription_v0113", { subscription_endpoint: subscription.endpoint }),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ]);
    }
  } catch { /* A sessão ainda deve ser encerrada se Push não estiver disponível. */ }
  const { data } = await requireSupabase().auth.getSession();
  try { if (data.session?.user.id) localStorage.removeItem(`praxis-last-activity:${data.session.user.id}`); } catch { /* Sem armazenamento. */ }
  clearWorkspaceContext();
  clearMovementRevisions();
  try { sessionStorage.removeItem("praxis-authenticated-with-passkey"); } catch { /* Armazenamento indisponível. */ }
  await requireSupabase().auth.signOut({ scope: "local" });
}
