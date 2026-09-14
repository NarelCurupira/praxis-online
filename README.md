# Práxis Online

Versão atual: **1.1.0**, conectada ao PostgreSQL do Supabase e consolidada como aplicação web/PWA estável, com contingência local, múltiplas Procuradorias, governança de acesso, auditoria, relatórios, Central de Informações e Web Push.

Aplicação web/PWA privada para organização e controle auxiliar de processos, com autenticação, múltiplos usuários, múltiplas Procuradorias, governança de acesso, relatórios, auditoria, diagnóstico, funcionamento responsivo e contingência local com leitura, gravação operacional e resolução de conflitos concorrentes.

## Atualização 1.1.0

Para atualizar uma instalação 1.0 existente, leia [ATUALIZAR-1.1.md](ATUALIZAR-1.1.md). Execute somente `supabase/migrations/20260914_praxis_v110.sql` e depois publique os arquivos da versão 1.1. Não reaplique o esquema-base nem as migrações antigas em um banco em uso.

A versão inclui recuperação operacional transacional, proteção de edições individuais por versão, recibos para operações offline, métricas com horários confirmados, proteção de Push e inatividade, cache PWA versionado e refinamento da tabela e do painel.

Para uma instalação nova, a sequência de dependências do histórico está em `scripts/migrations-order.json`. Alguns nomes antigos não seguem a ordem semântica das versões: não use simplesmente a ordenação alfabética. As extensões e o serviço de autenticação precisam estar disponíveis no Supabase.

## Histórico: versão 1.0.0

- Consolida como versão estável as funcionalidades desenvolvidas na série 0.x e nas versões 0.11.x-RC.
- Mantém contingência local com snapshot operacional, fila de gravações no IndexedDB e resolução de conflitos por comparação em três vias.
- Inclui Central de Informações persistente por usuário e Procuradoria, com leitura/não leitura e atualização em tempo real.
- Inclui Web Push para PWA instalado, com preferências configuráveis por usuário.
- Mantém suporte a múltiplas Procuradorias, com perfis, permissões e isolamento por workspace.
- Consolida auditoria administrativa, histórico processual, diagnóstico, telemetria técnica, relatórios e controles de qualidade.
- Consolida `supabase/migrations/` como fonte única das alterações versionadas do banco.
- Reorganiza a documentação histórica em `docs/` e remove scripts SQL e artefatos redundantes do repositório.

## Contingência

- Os dados operacionais da Procuradoria visitada são armazenados localmente no IndexedDB, isolados por usuário + Procuradoria.
- Sem conexão, ficam disponíveis os dados previamente sincronizados e as operações autorizadas pelo perfil em cache.
- Alterações operacionais pendentes são mantidas em fila local e reenviadas na ordem original quando a conexão retorna.
- Na reconexão, o Práxis compara o valor visto quando a alteração foi criada, o valor atual do servidor e o valor desejado localmente.
- Alterações independentes ou já convergentes são sincronizadas automaticamente.
- Quando o mesmo campo foi alterado de forma diferente no servidor, o usuário pode escolher **Manter servidor** ou **Aplicar alteração local**.
- Arquivamento, exclusão ou desaparecimento concorrente do registro não podem ser sobrescritos pela contingência.
- O Supabase permanece como fonte de verdade.
- O logout remove os dados locais do usuário e exige confirmação quando houver alterações ainda não sincronizadas.
- A política de MFA não é restaurada a partir de snapshots locais antigos.

## Central de Informações e Push

- Central persistente por usuário e Procuradoria.
- Atualização em tempo real e controle de leitura/não leitura.
- Web Push disponível para PWA instalado.
- Notificações de atribuições e transferências habilitadas por padrão; status e prazo podem ser configurados.
- O sistema de notificações é separado da fila de contingência e da resolução de conflitos.
- Notificações não alteram registros locais nem operações pendentes da fila de sincronização.

## Configuração

1. Crie um projeto no Supabase.
2. Em uma instalação nova, execute `supabase/schema.sql`.
3. Execute **todas** as migrações de `supabase/migrations/` em ordem cronológica.
4. Em um banco existente, execute somente as migrações ainda não aplicadas.
5. Copie `.env.example` para `.env.local` e informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Nunca coloque a senha do banco ou a chave `service_role` no frontend.

## Execução local

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run quality
```

O comando executa a verificação de consistência da versão, TypeScript, testes automatizados e build.

## Usuários e workspaces

O cadastro cria o perfil do usuário. O acesso a uma Procuradoria depende de vínculo ativo ou aceite de convite. Os papéis e permissões são aplicados no contexto do workspace ativo.

## Segurança do banco

- Row Level Security para isolamento por workspace.
- Funções sensíveis com `SECURITY DEFINER` e `search_path` fixado.
- Execução anônima bloqueada nas RPCs administrativas.
- MFA ou passkey exigidos para operações administrativas críticas.
- Workspace atual validado nas funções sensíveis.
- Atribuição de processos limitada a membros ativos do mesmo workspace.
- Aceite de convite associado ao usuário e ao e-mail autenticado.
- Auditoria administrativa preservada.

## Telemetria técnica

Erros técnicos e métricas de desempenho podem ser excluídos pela área **Auditoria e diagnóstico** quando tiverem mais de 15 dias. A limpeza exige administrador com autenticação forte e não alcança auditoria, histórico processual ou dados funcionais.

## Estrutura do repositório

- `src/` — aplicação e testes.
- `public/` — recursos públicos e PWA.
- `supabase/migrations/` — fonte canônica das alterações versionadas do banco.
- `supabase/functions/` — Edge Functions.
- `docs/updates/` — documentação histórica das versões.
- `docs/setup/` — instruções de configuração.
- `docs/roadmap/` — critérios e documentação de evolução.
- `scripts/` — automações de build, validação e geração de artefatos.

## Funções legadas

As funções `get_praxis_diagnostics_v0101`, `list_performance_metrics_v0101` e `list_current_workspace_members_v09` permanecem enquanto forem necessárias como fallbacks de compatibilidade no frontend.
