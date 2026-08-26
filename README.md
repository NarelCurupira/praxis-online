# Práxis Online

Versão atual: **0.11.3-RC**, conectada ao PostgreSQL do Supabase e com contingência local de leitura, gravação operacional e resolução de conflitos concorrentes.

Aplicação web/PWA privada para organização e controle auxiliar de processos, com autenticação, múltiplos usuários, múltiplas Procuradorias, governança de acesso, relatórios, auditoria, diagnóstico, funcionamento responsivo e contingência local com leitura e fila de gravações operacionais.


## Contingência 0.11.3-RC

- Mantém a fila local da 0.11.1-RC e acrescenta uma base de comparação por alteração pendente.
- Na reconexão, o Práxis faz comparação em três vias entre o valor visto quando a alteração foi criada, o valor atual do servidor e o valor desejado localmente.
- Alterações independentes ou que já convergiram para o mesmo valor são sincronizadas automaticamente, sem criar conflito artificial.
- Quando o mesmo campo foi modificado de forma diferente no servidor, a fila é pausada naquele ponto e mostra os valores **Antes**, **Servidor** e **Local**.
- O usuário pode escolher **Manter servidor** (descarta apenas aquela alteração local) ou **Aplicar alteração local** (reenvia a alteração pelas APIs normais, mantendo RLS, permissões e validações).
- Arquivamento, exclusão ou desaparecimento concorrente do registro não podem ser sobrescritos pela contingência.
- A fila continua isolada por usuário + Procuradoria, e operações posteriores permanecem ordenadas para evitar inversão de dependências.
- A política de MFA permanece fora do snapshot confiável: snapshots antigos são neutralizados na leitura e novos snapshots não persistem `mfaRequired=true`.
- Não há nova migração SQL nesta versão.
- Push e notificações ficam reservados para a 0.11.3-RC.

## Contingência 0.11.1-RC

- Mantém o snapshot de leitura da 0.11.0 e acrescenta fila local de sincronização no IndexedDB.
- Em contingência, respeitadas as permissões do perfil em cache, podem ser cadastrados processos e alterados status, providência e responsável; edição completa só é permitida quando o registro detalhado já está disponível localmente.
- Exclusão, arquivamento, exportação, transferência entre Procuradorias, administração, importação e demais ações sensíveis continuam dependentes do servidor.
- Ao reconectar, as operações são reenviadas na ordem original pelas mesmas APIs do Práxis e continuam sujeitas às RLS, permissões e validações do Supabase.
- A fila mostra operações pendentes e falhas e permite nova tentativa ou descarte explícito.
- Cadastro offline recebe identificador temporário negativo até ser confirmado pelo servidor; uma verificação de idempotência reduz o risco de duplicidade se a confirmação da primeira tentativa se perder.
- A data/hora de envio registrada offline é preservada quando o status Enviado é sincronizado.
- Detecção e resolução de alterações concorrentes entre usuários foram incorporadas na 0.11.3-RC.
- Logout com alterações pendentes exige confirmação, pois a fila local é apagada junto com os demais dados do usuário.

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
