# Atualização do Práxis Online 0.6.0

Esta versão corrige a consulta da Auditoria, amplia o gráfico de distribuição e acrescenta administração segura dos usuários.

## 1. Atualizar o banco

No Supabase, abra **SQL Editor**, cole todo o conteúdo de `supabase/007-usuarios-distribuicao-auditoria.sql` e clique em **Run**. O resultado esperado é `Success. No rows returned`.

## 2. Implantar a função protegida de e-mail

A alteração de e-mail usa uma Edge Function para que a chave administrativa nunca seja exposta no navegador.

No Supabase, abra **Edge Functions**, crie a função `admin-manage-user`, copie o conteúdo de `supabase/functions/admin-manage-user/index.ts` e implante-a com a verificação de JWT ativada.

Alternativa pelo terminal, dentro desta pasta:

```text
npx supabase login
npx supabase link --project-ref yoqsxkakoeqjbiaewdim
npx supabase functions deploy admin-manage-user
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente nas Edge Functions hospedadas do projeto. Não coloque a `service_role` no GitHub ou no Cloudflare.

## 3. Publicar o site

Envie esta versão para a ramificação `main` do GitHub e acompanhe a implantação automática no Cloudflare.

## 4. Testes rápidos

1. Entre como administrador usando o segundo fator.
2. Abra **Auditoria**: a lista deve carregar sem o erro de estrutura.
3. Abra **Eficiência**: o gráfico deve mostrar duas cores, “Distribuídos nos últimos 30 dias” e “Pendentes atuais”.
4. Abra **Equipe**, edite um usuário e altere somente o nome e a exigência de 2FA.
5. Depois teste a troca de e-mail e confirme que o novo endereço aparece na lista.
6. Clique em **Redefinir senha** e confirme o recebimento do e-mail pelo usuário.

Observação: “distribuídos nos últimos 30 dias” usa a data de recebimento do processo, que é o marco histórico confiável disponível no banco atual. As pendências são todos os processos ainda não enviados, independentemente da data.
