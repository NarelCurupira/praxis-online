# Práxis Web 0.10.5

## Desempenho
- lazy loading das páginas principais;
- code splitting do aplicativo;
- carregamento sob demanda de PDF e planilhas;
- separação dos chunks de gráficos, Supabase, React e ferramentas pesadas;
- redução do bundle inicial.

## Qualidade e segurança
- manutenção da atualização segura do SheetJS;
- auditoria das dependências de produção no GitHub Actions;
- manutenção de TypeScript, testes automatizados e build como requisitos de integração.

## Infraestrutura
- atualização de `actions/checkout` e `actions/setup-node`;
- revisão dos avisos de tamanho do bundle;
- organização explícita dos chunks de produção.

## Interface
- correção da sobreposição da frase “Preparando seus processos...” com a logomarca;
- revisão das safe areas do iPhone;
- ajustes para telas pequenas e orientação horizontal.

## Robustez
- preservação do Error Boundary global;
- fallback visual durante o carregamento assíncrono;
- manutenção das opções de diagnóstico e recarga.

## Observação
Não havia arquivo `wrangler.toml`, `wrangler.json` ou `wrangler.jsonc` no repositório recebido. Assim, não foi possível corrigir o nome do Worker nesta entrega sem inventar uma configuração inexistente.
