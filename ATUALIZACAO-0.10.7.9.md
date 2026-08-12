# Atualização do Práxis para 0.10.7.9

1. Substitua no GitHub os arquivos indicados em `ARQUIVOS-0.10.7.9.txt`, preservando as mesmas pastas.
2. Execute no SQL Editor do Supabase o arquivo `EXECUTAR-NO-SUPABASE-0.10.7.9.sql`.
3. Confirme que a execução terminou sem erro e que as RPCs `list_my_workspaces_v01079` e `set_current_workspace_v01079` foram criadas.
4. Execute `npm install` se necessário e valide com `npm run quality`.
5. Publique a nova build e confirme a versão **0.10.7.9** na aba **Sobre**.
6. Teste Visão geral, Minha fila, Processos, Eficiência, Relatórios, Qualidade dos dados, Importação e a visualização de Arquivados.
7. Em **Auditoria e diagnóstico**, reduza temporariamente o limite de operações lentas para **500 ms** e, após uso suficiente, exporte novamente o relatório.

## O que muda

- A abertura carrega apenas movimentações ativas e campos operacionais essenciais.
- Arquivados deixam de integrar a carga inicial e são carregados sob demanda.
- Observações, caminho de documento e campos analíticos extensos são carregados somente quando necessários.
- Eficiência continua incluindo o histórico arquivado, carregado ao entrar na página.
- Relatórios, Qualidade e Importação recebem o conjunto completo antes de renderizar.
- O cache passa a pertencer ao par usuário + workspace.
- A equipe passa a ser isolada pelo `current_workspace_id`.
- O banco ganha as APIs preparatórias da futura seleção de Procuradoria da versão 0.10.8.

## Observação

A 0.10.7.9 **não exibe ainda o seletor de Procuradoria**. Ela prepara o isolamento, a segurança e as APIs necessárias para que a 0.10.8 possa ativar a 4ª e a 5ª Procuradorias sem risco de mistura de dados.
