# Histórico de versões do Práxis Web

## 0.10.2 — Importação Inteligente e desempenho

### Novidades
- Prévia detalhada da planilha antes de qualquer gravação.
- Regras configuráveis para registros existentes, duplicidades, conflitos de horário e validação.
- Importações por lote, com origem do arquivo, precisão dos horários e histórico administrativo.
- Reversão segura de lotes, preservando registros alterados manualmente após a importação.
- Exportação das operações lentas em TXT.
- Arquivamento das operações lentas sem exclusão do banco.
- Limite de lentidão e retenção configuráveis.
- Botões para copiar número judicial e número MP.

### Correções e desempenho
- Cadastro, edição, status, providência, responsável e exclusão atualizam o estado local sem recarregar toda a base.
- Carregamento inicial passou a buscar configurações e dados em paralelo.
- Tipografia da Qualidade dos dados alinhada à tabela de Processos.

## 0.10.1 — Auditoria, diagnóstico e refinamentos

### Novidades
- Auditoria e Diagnóstico reunidos na mesma área administrativa.
- Consulta de erros técnicos sanitizados e operações superiores a dois segundos.
- Diagnóstico copiável com versão, compilação, contagens, precisão histórica e tamanho do banco.
- Monitoramento da referência de 500 MB do Supabase Free.
- Ajuda contextual nos pontos técnicos mais relevantes.
- Histórico de versões incorporado à aba Sobre.
- Artefato de compilação validada gerado pelo GitHub Actions.

### Correções
- Gráfico de providências substituído por Natureza da atuação.
- Inclusão de Suspeição em Diligências e medidas processuais.
- Tooltip com decomposição das providências de cada grupo.
- Correção dos cartões Relevância social e Alta complexidade no cadastro e edição.
- Reforço da integração de unidade, procurador e rodapé nos PDFs.

## 0.10.0 — Confiabilidade e engenharia
- Error Boundary, captura global de erros, logs técnicos, identificação de compilação, testes e workflow de qualidade.

## 0.9.5 — Integração e acabamento
- Integração dos relatórios, modais, disclaimer e períodos.
