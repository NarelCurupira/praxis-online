# Práxis Web 0.10.6 — desempenho

## Ordem de atualização

1. No Supabase, abra o **SQL Editor**.
2. Execute integralmente `EXECUTAR-NO-SUPABASE-0.10.6.sql`.
3. Envie o conteúdo deste pacote ao GitHub e aguarde a conclusão do workflow.
4. Confirme no Práxis, em **Sobre**, a versão `0.10.6`.
5. Teste a abertura da Visão Geral e a alteração da providência de um processo.

O frontend mantém um caminho de compatibilidade caso seja publicado antes da
query, mas a alteração de providência só terá o ganho completo depois da
execução do SQL.

## Alterações de desempenho

- resolução do workspace compartilhada entre as APIs;
- eliminação da validação remota repetida do usuário antes das operações;
- cálculo de horas úteis em tempo constante para intervalos históricos longos;
- configuração do expediente aplicada antes da transformação dos processos;
- índice parcial compatível com o filtro e a ordenação da carga principal;
- alteração de providência e registro de histórico em uma única RPC;
- diagnóstico separado entre busca (`movements.fetch`) e transformação
  (`movements.transform`).

## Regras preservadas

- mesmos horários, feriados, recessos e fins de semana no cálculo do tempo;
- mesmas permissões por perfil;
- mesmas restrições para estagiário e períodos fechados;
- mesmo histórico de alteração de providência;
- mesmos campos e registros retornados pelas telas e relatórios.
