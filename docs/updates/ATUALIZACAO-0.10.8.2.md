# Práxis Online 0.10.8.2

## Objetivo
Reduzir a regressão de desempenho observada após a adoção do RLS multi-Procuradoria e retirar cargas detalhadas desnecessárias da Qualidade dos Dados e da troca de unidade.

## Alterações
- RLS: contexto ativo e papel do usuário resolvidos uma vez por statement com `current_praxis_workspace_v01082()` e `current_praxis_role_v01082()`.
- Qualidade dos Dados: usa registros compactos; busca apenas `relevance_reason` e `complexity_reason` dos casos marcados como relevantes/complexos.
- Troca de Procuradoria: duas fases. Primeiro referências/configurações; depois movimentos em segundo plano, sem splash global.
- Configurações: campo de renomeação passa a usar o mesmo padrão visual do cadastro de Procuradoria.

## Instalação
1. Execute `EXECUTAR-NO-SUPABASE-0.10.8.2.sql` no SQL Editor do Supabase.
2. Substitua/adicione os arquivos do ZIP no GitHub.
3. Aguarde o workflow `quality.yml` (`npm run quality`).
4. Publique somente após o workflow concluir sem erros.

## Verificação recomendada
Após algumas trocas entre Procuradorias e acessos à Qualidade, exporte novamente:
- Relatório de operações lentas;
- Supabase Query Performance Statements.

Compare especialmente a consulta `movements` compacta com a média de ~1,41 s observada na 0.10.8.1.
