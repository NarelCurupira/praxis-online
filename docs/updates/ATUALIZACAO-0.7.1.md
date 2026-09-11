# Atualização do Práxis Web 0.7.1

Esta versão faz os ajustes finais de legibilidade e precisão do Relatório Gerencial, sem alterar o banco de dados nem os registros históricos.

## Publicação

Envie todos os arquivos desta versão para a ramificação `main`. Não há nova query para executar no Supabase.

O Cloudflare continuará usando:

```text
npx vite build
npx wrangler deploy --assets ./dist --compatibility-date 2026-07-16
```

## Principais ajustes

- A tela de carregamento e a página Sobre exibem a versão obtida do `package.json`.
- O PDF identifica se o escopo é individual ou da equipe e informa o responsável ou a quantidade de usuários considerados.
- O nome baixado é calculado pela modalidade, pelo escopo, pelo usuário filtrado e pelas datas efetivas.
- Duração igual a zero na mesma data é exibida como **Mesmo dia útil**. Medições importadas sem horário completo são identificadas como aproximadas.
- A categoria **Sem prazo aplicável** aparece no resumo e nas tabelas e permanece fora dos denominadores.
- O gráfico de fluxo apresenta valores sobre barras e pontos e informa quando o estoque ficou zerado em todo o período.
- Providências aparecem apenas em **Fluxo e Produtividade**.
- O gráfico de tramitação ganhou margem superior, valores visíveis e composição específica para relatório individual.
- Dimensões com uma única categoria são apresentadas em cartões.
- Campos históricos de texto livre sem repetição suficiente são apresentados como síntese, sem ranking artificial.
- As três modalidades possuem conteúdos e nomes de arquivo próprios.
- O anexo omite campos sociais ou de complexidade que não se apliquem ao processo.
- A nomenclatura oficial permanece **Alta complexidade** em toda a aplicação.

## Dados históricos e categorias futuras

Nenhum texto histórico foi alterado ou normalizado automaticamente. Os campos livres de tema social, direito fundamental e grupo afetado permanecem preservados como detalhamento.

Uma futura estrutura de categorias selecionáveis e de múltipla escolha deverá ser implementada em novas colunas, mantendo os textos atuais. Não deve ser feita migração automática por simples correspondência textual sem revisão prévia e possibilidade de conferência administrativa.

## Validação

Foram criados cenários para:

1. relatório executivo individual;
2. relatório completo individual;
3. relatório executivo da equipe;
4. relatório completo da equipe;
5. anexo de processos destacados;
6. período sem pendências;
7. período com pendentes vencidos;
8. período sem prazo aplicável;
9. período sem processos destacados;
10. período com apenas um usuário.

Os PDFs ficam em `output/pdf/scenarios` quando executado:

```text
npm run report:scenarios
```
