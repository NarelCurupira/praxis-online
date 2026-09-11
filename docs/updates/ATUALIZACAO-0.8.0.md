# Atualização do Práxis Web 0.8.0

## Ordem de atualização

1. No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/010-cadastro-administrativo-cobertura-historica.sql` e execute uma única vez.
2. Em **Edge Functions**, substitua a função `admin-manage-user` pelo conteúdo de `supabase/functions/admin-manage-user/index.ts` e faça nova implantação.
3. Na função, mantenha disponíveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Opcionalmente, defina `PUBLIC_SITE_URL` com o endereço público do Práxis para controlar o retorno do link de primeiro acesso.
4. Publique os arquivos da versão 0.8.0 no repositório. Aguarde a implantação automática do Cloudflare.
5. Entre como administrador com o segundo fator e abra **Equipe**.
6. Preencha manualmente **Histórico disponível a partir de** para cada usuário, usando apenas datas confirmadas. A migração não inventa nem preenche essas datas.

## Cadastro de usuários

- O cadastro público por código foi retirado.
- Somente o administrador cria contas.
- No cadastro, escolha entre enviar o link por e-mail ou gerar um link individual para copiar.
- O usuário define a própria senha no primeiro acesso.
- A chave administrativa do Supabase permanece exclusivamente na Edge Function.
- Convites antigos não são apagados; as funções públicas de criação e aceitação por código perdem permissão de execução.

## Cobertura histórica

- `historico_disponivel_desde` diferencia ausência de histórico de zero real.
- Cobertura parcial e indisponível aparecem explicitamente.
- Comparações anuais usam períodos equivalentes e, por padrão, somente usuários com cobertura nos dois períodos.
- Meses futuros não são desenhados como zero; o mês corrente é marcado como parcial.

## Eficiência e carga

- Filtros de ano, mês, últimos 30 dias, últimos 90 dias e intervalo personalizado.
- Fluxo separado das métricas de tempo.
- “Até 2 horas úteis” usa somente registros com horários completos.
- Distribuição dos últimos 30 dias e pendências atuais são blocos distintos.
- Nova evolução de eficiência com seletor de métrica.
- Nova composição da carga sem pontuação ou ranking de produtividade.
- Comparativo administrativo distingue ausência de histórico de valor zero.

## Verificação

1. Abra **Sobre** e confirme a versão **0.8.0**.
2. Teste um usuário com histórico em 2025 e outro sem histórico.
3. Confirme que meses futuros não aparecem com barras ou pontos.
4. Gere um relatório com comparação histórica e confira a indicação da equipe comparável.
