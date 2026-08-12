# Práxis Online

Versão atual: **0.11.0**, conectada ao PostgreSQL do Supabase e com contingência local de leitura.

Aplicação web/PWA privada para organização e controle auxiliar de processos, com autenticação, múltiplos usuários, múltiplas Procuradorias, governança de acesso, relatórios, auditoria, diagnóstico, funcionamento responsivo e contingência local de leitura.


## Contingência 0.11.0

- Os dados operacionais da Procuradoria visitada são armazenados no IndexedDB do navegador por até 72 horas.
- O cache é isolado por usuário + Procuradoria e contém apenas dados necessários à consulta; documentos, observações e metadados detalhados não são persistidos.
- Sem conexão, ficam disponíveis Visão Geral, Minha Fila e Processos em modo somente leitura.
- A troca offline de Procuradoria é permitida apenas para unidades previamente sincronizadas no mesmo dispositivo.
- O logout remove os snapshots locais do usuário.
- Quando a conexão retorna, o Supabase volta automaticamente a ser a fonte de verdade.
- O Service Worker armazena apenas o shell da aplicação; os dados processuais de contingência ficam no IndexedDB.

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

Validação:

```bash
npm run check
npm test
npm run build
```

## Usuários e workspaces

O cadastro cria o perfil do usuário. O acesso a um workspace depende de vínculo ativo ou aceite de convite. Papéis disponíveis: administrador, procurador, assessor e consulta.

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

## Funções legadas

As funções `get_praxis_diagnostics_v0101`, `list_performance_metrics_v0101` e `list_current_workspace_members_v09` permanecem porque ainda são utilizadas como fallbacks de compatibilidade no frontend.
