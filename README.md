# Práxis Online

Versão atual: **0.11.1-RC**, conectada ao PostgreSQL do Supabase e com contingência local de leitura e gravação operacional.

Aplicação web/PWA privada para organização e controle auxiliar de processos, com autenticação, múltiplos usuários, múltiplas Procuradorias, governança de acesso, relatórios, auditoria, diagnóstico, funcionamento responsivo e contingência local com leitura e fila de gravações operacionais.


## Contingência 0.11.1-RC

- Mantém o snapshot de leitura da 0.11.0 e acrescenta fila local de sincronização no IndexedDB.
- Em contingência, respeitadas as permissões do perfil em cache, podem ser cadastrados processos e alterados status, providência e responsável; edição completa só é permitida quando o registro detalhado já está disponível localmente.
- Exclusão, arquivamento, exportação, transferência entre Procuradorias, administração, importação e demais ações sensíveis continuam dependentes do servidor.
- Ao reconectar, as operações são reenviadas na ordem original pelas mesmas APIs do Práxis e continuam sujeitas às RLS, permissões e validações do Supabase.
- A fila mostra operações pendentes e falhas e permite nova tentativa ou descarte explícito.
- Cadastro offline recebe identificador temporário negativo até ser confirmado pelo servidor; uma verificação de idempotência reduz o risco de duplicidade se a confirmação da primeira tentativa se perder.
- A data/hora de envio registrada offline é preservada quando o status Enviado é sincronizado.
- Detecção e resolução de alterações concorrentes entre usuários permanecem fora desta RC e serão incorporadas na versão 1.0.
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
