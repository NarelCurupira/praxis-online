# Atualização do Práxis Web 0.7.0

Esta versão transforma o antigo Relatório de Acompanhamento Processual em um conjunto de relatórios gerenciais, mantendo os dados históricos e as permissões existentes.

## 1. Atualizar o banco

No Supabase, abra **SQL Editor**, cole todo o conteúdo de `supabase/009-relatorios-gerenciais.sql` e clique em **Run**.

O resultado esperado é:

```text
Success. No rows returned
```

A query apenas permite que uma movimentação seja marcada como **sem prazo aplicável**. Ela não apaga nem modifica nenhum prazo histórico.

Se a migração `008-ods-onu.sql` ainda não tiver sido executada, faça primeiro a 008 e depois a 009.

## 2. Publicar o site

Envie todos os arquivos desta versão para a ramificação `main` do GitHub. O Cloudflare deverá executar os comandos já configurados:

```text
npx vite build
npx wrangler deploy --assets ./dist --compatibility-date 2026-07-16
```

Não é necessário criar novas variáveis de ambiente.

## 3. O que testar

1. Abra **Sobre** e confirme a versão **0.7.0**.
2. Abra **Relatórios gerenciais** e teste **Mês atual**, **Últimos 30 dias**, um ano completo e um intervalo personalizado.
3. Gere os três documentos: **Relatório Executivo**, **Relatório Completo** e **Anexo de Processos Destacados**.
4. Confira se `estoque inicial + recebidos - enviados = estoque final`.
5. Confira separadamente concluídos no prazo, concluídos com atraso, pendentes no prazo, próximos do vencimento, vencidos e sem prazo aplicável.
6. Como usuário comum, confirme que o seletor fica restrito ao próprio usuário.
7. Como administrador com segundo fator, gere o comparativo da equipe.
8. Edite um processo, deixe o prazo vazio e confirme que aparece **Sem prazo** / **não aplicável**.
9. Gere um relatório com processos que possuam mais de um ODS e confira o ranking.
10. No Relatório Completo, confira se os blocos do anexo não são divididos entre páginas.

## 4. Metodologia importante

- Recebidos são contados pela data de entrada no período.
- Enviados são contados pela data de envio no período, mesmo quando recebidos antes.
- O estoque é reconstruído pela posição do registro no início e no fim do intervalo.
- Horas úteis vêm do mesmo cálculo central usado pelo restante do Práxis: seis horas por dia útil, fins de semana e exclusões do calendário.
- A taxa de cumprimento entre concluídos não é reduzida pela existência de processos ainda pendentes.
- Relevância social e alta complexidade usam categorias exclusivas no gráfico, evitando dupla contagem.
- Cada ODS é contado individualmente, uma vez por processo.

## 5. Validação técnica executada

Foram executados:

```text
npm run check
npm run test:reports
npm run build
npm run report:sample
```

O PDF de desenvolvimento foi renderizado página a página para conferência de gráficos, tabelas, rodapés e quebras do anexo.
