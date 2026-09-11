# Configuração do Push — Práxis Online 0.11.3-RC

A Central de Informações funciona pelo banco e Realtime. O Push do sistema operacional depende também da Edge Function `push-dispatch` e das chaves VAPID.

## Ordem recomendada

1. Substitua no GitHub os arquivos do pacote 0.11.3-RC e aguarde o GitHub Actions ficar verde.
2. No Supabase, configure os três Secrets VAPID indicados em `SEGREDOS-PUSH-0.11.3-RC.txt`.
3. Publique a Edge Function `push-dispatch` **sem verificação JWT no gateway**.
4. Execute `supabase/migrations/20260825_praxis_v0113_push_central.sql` no SQL Editor uma única vez.
5. Aguarde o deploy do frontend e abra Práxis > Configurações pessoais > Notificações e Push.
6. Ative o Push no dispositivo e conceda a permissão do sistema operacional.

## Secrets da Edge Function

Configure estes nomes exatamente:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`

Os valores estão no arquivo separado `SEGREDOS-PUSH-0.11.3-RC.txt`. Esse arquivo contém segredo e **não deve ser colocado no GitHub**.

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo ambiente das Edge Functions do Supabase.

## Publicação da Edge Function

A função está em:

`supabase/functions/push-dispatch/index.ts`

Ao publicar, desative a verificação JWT do gateway para essa função. Isso é necessário porque o PostgreSQL também a chama de forma assíncrona via `pg_net`, sem sessão de usuário.

Essa configuração não torna o disparo público: a função faz sua própria autenticação em duas vias:

- chamada interna do banco: exige o `dispatch_token` aleatório armazenado em `push_runtime_v0113`;
- chamada do aplicativo: exige uma sessão Supabase válida e só pode processar entregas do próprio usuário.

## Dispositivos móveis

### Android / Chrome / PWA

Web Push funciona no navegador compatível e no PWA instalado. Recomenda-se instalar o Práxis como aplicativo para a experiência mais consistente.

### iPhone / iPad

O Push exige o Práxis instalado pela opção **Adicionar à Tela de Início** e aberto a partir desse ícone. O próprio painel de configurações informa essa exigência quando detecta iOS fora do modo instalado.

## Teste mínimo

1. Usuário A ativa Push em um celular/PWA.
2. Usuário B atribui um processo ao Usuário A.
3. O Usuário A deve receber:
   - um item não lido na Central de Informações; e
   - uma notificação do sistema operacional.
4. Toque na notificação: o Práxis deve abrir, trocar para a Procuradoria correta e focar o processo.
5. Altere apenas o status: com a configuração padrão deve aparecer na Central, mas não como Push.
6. Habilite Push de status e repita o teste.

## Contingência

Push e Central não participam da `sync_queue` e não resolvem conflitos. Durante contingência, um evento remoto não sobrescreve estado local nem aplica alterações no processo. Na reconexão, a reconciliação continua sendo responsabilidade exclusiva do mecanismo da 0.11.2-RC.

## Segurança

- RLS da Central: somente o destinatário lê seus itens.
- Assinaturas Push não são expostas diretamente a usuários autenticados.
- RPCs de processamento da fila são exclusivas de `service_role`.
- A chave VAPID privada existe somente nos Secrets da Edge Function.
- Falha da Central ou do Push é isolada e não pode abortar uma operação processual.
