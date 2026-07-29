# Práxis Web 0.10.6

## Desempenho

- cálculo otimizado de horas úteis para períodos históricos extensos;
- sessão e workspace compartilhados entre as APIs;
- redução das viagens ao Supabase na alteração de providência;
- índice parcial para a consulta principal de processos;
- aplicação da configuração da jornada antes dos cálculos da primeira carga.

## Diagnóstico

- separação entre tempo de busca dos processos e tempo de transformação no
  navegador;
- manutenção da métrica geral para comparação com as versões anteriores.

## Compatibilidade

- fallback automático para a atualização antiga de providência enquanto a
  query da versão 0.10.6 ainda não tiver sido executada;
- nenhuma alteração nas regras de prazos, permissões, filtros ou relatórios.
