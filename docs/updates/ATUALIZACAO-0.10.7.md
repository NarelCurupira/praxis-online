# Atualização do Práxis Online para 0.10.7

## Ordem obrigatória

1. No Supabase, abra o **SQL Editor**.
2. Execute integralmente `EXECUTAR-NO-SUPABASE-0.10.7.sql`.
3. Extraia o ZIP na raiz do repositório, preservando as pastas.
4. Confirme a substituição dos arquivos existentes.
5. Envie as alterações ao GitHub e aguarde o workflow.
6. Abra **Sobre** e confirme a versão `0.10.7`.

A query deve ser aplicada antes do frontend porque cria a coluna de
arquivamento, o histórico detalhado e as funções transacionais usadas pelas
operações em lote.

## Verificação rápida

- No celular, abra o menu arrastando da borda esquerda.
- No topo da página, arraste para baixo e confirme a atualização.
- Selecione dois processos e confira a barra de ações.
- Abra um processo, altere um campo e confira o Histórico do processo.
- Na Visão Geral, clique em um indicador e em uma coluna do Movimento Mensal.
- Em Qualidade dos dados, clique em “Enviados sem data”.

## Observações

- Arquivar não envia o processo à lixeira. Os arquivados ficam acessíveis pelo
  filtro de status **Arquivados** na tela Processos.
- Excluir continua sendo uma exclusão recuperável pela Lixeira.
- Vibração depende do suporte e das permissões do navegador/dispositivo.
- A auditoria administrativa não foi substituída pelo histórico do processo.
