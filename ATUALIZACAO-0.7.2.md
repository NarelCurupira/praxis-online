# Atualização do Práxis Web 0.7.2

Correções finais do Relatório Gerencial, sem alteração dos dados históricos ou das regras centrais de cálculo.

## Alterações

- Rótulos coincidentes de mediana, P75 e P90 são consolidados no gráfico de tempo de tramitação.
- Classes, providências e demais categorias fechadas são agrupadas estatisticamente sem distinção entre maiúsculas e minúsculas ou espaços repetidos.
- A normalização é aplicada somente ao relatório e aos filtros; os textos armazenados no Supabase permanecem inalterados.
- O anexo mede a altura efetivamente desenhada de cada bloco e inclui tantos processos por página quantos couberem integralmente.
- Os blocos continuam indivisíveis e preservam o tamanho da fonte.
- Os valores do estoque final aparecem em etiquetas brancas, com borda dourada e texto azul-marinho.

## Validação

- O anexo com os 26 processos do relatório de referência passou de 22 para 15 páginas.
- Foram conferidos cenários com métricas coincidentes, diferentes, iguais a zero, um usuário e vários usuários.
- Foram verificados os gráficos de fluxo, classes processuais e tempo de tramitação.
- Não é necessária nova consulta ou migração no Supabase.
