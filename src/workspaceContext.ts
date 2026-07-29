import { requireSupabase } from "./supabase";

let workspaceOwner = "";
let workspacePromise: Promise<string> | null = null;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Compartilha a sessão e a resolução do workspace entre as diferentes APIs.
 * A autorização efetiva continua sendo feita pelo JWT e pelas políticas RLS
 * do Supabase; por isso, não é necessário validar o mesmo usuário remotamente
 * antes de cada operação.
 */
export async function workspaceContext() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  fail(error);
  const user = data.session?.user;
  if (!user) throw new Error("Sessão expirada. Entre novamente.");

  if (workspaceOwner !== user.id) {
    workspaceOwner = user.id;
    workspacePromise = null;
  }

  if (!workspacePromise) {
    workspacePromise = (async () => {
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", user.id)
        .single();
      fail(profileError);

      if (profile?.current_workspace_id) return String(profile.current_workspace_id);

      const { data: member, error: memberError } = await client
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .single();
      fail(memberError);
      if (!member?.workspace_id) throw new Error("Sua conta ainda não possui um espaço de trabalho.");
      return String(member.workspace_id);
    })().catch((error) => {
      workspacePromise = null;
      throw error;
    });
  }

  return { client, user, workspaceId: await workspacePromise };
}

export function clearWorkspaceContext(): void {
  workspaceOwner = "";
  workspacePromise = null;
}
