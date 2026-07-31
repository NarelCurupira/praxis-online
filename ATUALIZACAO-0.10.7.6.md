# Atualização do Práxis para 0.10.7.6

## Ordem obrigatória

1. Execute integralmente `EXECUTAR-NO-SUPABASE-0.10.7.6.sql` no SQL Editor do Supabase.
2. Extraia o ZIP na raiz do repositório, autorizando a substituição dos arquivos.
3. Envie as alterações ao GitHub e aguarde a publicação.
4. Confirme a versão 0.10.7.6 na aba **Sobre**.

## O que a query faz

- adiciona a coluna `procedural_priority`, com valor inicial `Nenhuma` para os registros existentes;
- restringe os valores aceitos para evitar dados inconsistentes;
- instala a função transacional `update_movement_v01076`;
- registra alterações da prioridade processual no histórico próprio do processo.

A query não exclui processos nem modifica as prioridades internas já existentes.

## Testes recomendados

1. Abra a Visão Geral no Chrome com a janela em orientação vertical e confirme que o gráfico aparece acima da tabela, sem sobreposição.
2. Cadastre um processo e selecione uma **Prioridade processual**.
3. Edite o mesmo processo, altere a prioridade e confira o Histórico do processo.
4. Exporte a lista e confirme a coluna **Prioridade processual**.
