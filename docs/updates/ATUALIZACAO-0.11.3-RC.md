# Práxis Online 0.11.3-RC — Push e Central de Informações

## Objetivo

Esta RC adiciona notificações sem acoplar o transporte Push à contingência ou ao estado dos processos. Há três domínios independentes:

1. **Processos/contingência** — Supabase continua sendo a fonte de verdade; `sync_queue` e resolução de conflitos permanecem intactas.
2. **Central de Informações** — eventos persistentes por usuário no PostgreSQL, protegidos por RLS e recebidos por Realtime quando o Práxis está on-line.
3. **Push Service** — assinaturas de dispositivos e fila própria de entrega Web Push, processada pela Edge Function `push-dispatch`.

Uma falha de Push nunca desfaz uma alteração processual, não impede a criação do item na Central e não modifica o cache de contingência.

## Eventos

- **Atribuição/redistribuição:** Central + Push por padrão.
- **Transferência entre Procuradorias:** Central + Push por padrão.
- **Mudança de status:** Central; Push opcional, desativado por padrão.
- **Alteração de prazo:** Central; Push opcional, desativado por padrão.
- O próprio autor da alteração não recebe notificação sobre a ação que acabou de executar.

## Central de Informações

- sino global no cabeçalho;
- contador de não lidas;
- atualização Realtime;
- marcar uma ou todas como lidas;
- identificação da Procuradoria e número processual;
- clique troca de Procuradoria quando necessário e abre o processo relacionado;
- durante contingência a Central não consulta nem aplica informação remota sobre os processos.

## Push

- Web Push padrão, sem SDK de terceiros;
- uma conta pode registrar mais de um dispositivo;
- reaproveitamento seguro da assinatura quando o mesmo navegador troca de usuário;
- VAPID: chave pública no frontend; chave privada somente nos Secrets da Edge Function;
- endpoints expirados (404/410) são automaticamente desativados;
- entregas em processamento abandonadas podem ser recuperadas após 10 minutos;
- fila separada `push_deliveries`, sem qualquer relação com `sync_queue`.

## Banco

Executar `supabase/manual/EXECUTAR-NO-SUPABASE-0.11.3-RC.sql` uma única vez. A migração cria:

- `notification_preferences`;
- `user_notifications`;
- `push_subscriptions`;
- `push_deliveries`;
- `push_runtime_v0113`;
- RPCs, RLS, índices e triggers da Central/Push;
- publicação Realtime de `user_notifications` quando necessária;
- integração assíncrona `pg_net` com a Edge Function.

## Edge Function

Nova função: `supabase/functions/push-dispatch/index.ts`.

Ela deve ser publicada **sem verificação JWT no gateway**, pois recebe também o webhook interno do PostgreSQL. A função não fica aberta para disparos arbitrários: solicitações sem sessão precisam apresentar o token aleatório guardado em `push_runtime_v0113`; solicitações autenticadas só podem drenar a fila do próprio usuário.

A configuração VAPID está no arquivo entregue separadamente `SEGREDOS-PUSH-0.11.3-RC.txt`, que **não deve ser enviado ao GitHub**.
