# Atualização do painel e inclusão dos ODS

## 1. Atualizar o banco

No Supabase, abra **SQL Editor**, execute todo o conteúdo de `supabase/008-ods-onu.sql` e aguarde `Success. No rows returned`.

## 2. Substituir os arquivos no GitHub

O pacote contém apenas arquivos que devem ser substituídos, preservando as pastas indicadas:

- `src/api.ts`
- `src/types.ts`
- `src/styles.css`
- `src/components/Dashboard.tsx`
- `src/components/EditProcessModal.tsx`
- `src/components/ImportPage.tsx`
- `src/components/ProcessModal.tsx`
- `src/components/ProcessTable.tsx`
- `src/components/ReportsPage.tsx`
- `src/components/SpecialClassificationFields.tsx`

Não envie esses arquivos para a raiz do repositório. Abra no GitHub a pasta correspondente e substitua o arquivo de mesmo nome.

O arquivo `supabase/schema.sql` foi atualizado apenas para futuras instalações completas e não precisa ser reenviado nesta atualização.

## 3. Verificação

Depois do commit na ramificação `main`, o Cloudflare deve transformar aproximadamente 2.605 módulos.

Testes:

1. Em **Visão geral**, selecione `Mês atual`, `Últimos 30 dias` e um ano.
2. Confira quantidade e percentual na legenda de **Providências**.
3. Edite um processo e marque **Relevância social**.
4. Selecione dois ou mais ODS, preencha **Impacto social esperado** e salve.
5. Reabra o processo para confirmar que os ODS permaneceram selecionados.

