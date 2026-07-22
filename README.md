# Práxis Online

Versão atual: **0.7.0**, conectada ao projeto Atrium no Supabase.

Versão web e multiusuário do **Práxis — Controle de Processos**, derivada da interface local 0.9.3. Este projeto é independente do Práxis Local e não altera o banco SQLite nem o instalador do Windows.

## Estado atual

- autenticação por e-mail e senha;
- convites com código para usuários trabalharem no mesmo espaço;
- perfis de procurador, assessor/servidor e somente consulta;
- administração, suspensão e reativação de membros;
- criação automática do primeiro espaço de trabalho;
- PostgreSQL no Supabase;
- isolamento dos dados por espaço de trabalho com Row Level Security;
- perfis previstos: administrador, procurador, assessor e consulta;
- cadastro, edição, fila, lixeira, histórico, relatórios e importação conectados ao banco online;
- atribuição individual de responsáveis, filtro na tabela e correção em bloco na qualidade dos dados;
- exportação em Excel, PDF e backup JSON pelo navegador;
- relatórios gerenciais Executivo, Completo e Anexo de Processos Destacados;
- estoque conciliado, situações de prazo separadas, mediana e percentis em horas úteis;
- gráficos dinâmicos de fluxo, equipe, prazos, tramitação, relevância social, ODS e providências;
- build de produção validado.

Use somente dados fictícios ou anonimizados nesta fase de protótipo.

## Configuração do Supabase Free

1. Crie um projeto em https://supabase.com/dashboard.
2. Abra **SQL Editor**, crie uma consulta e execute todo o conteúdo de `supabase/schema.sql`.
3. Em seguida, execute, na ordem, as migrações numeradas de `supabase/002-equipe-convites.sql` até `supabase/009-relatorios-gerenciais.sql`.
4. Em **Project Settings > API**, copie a URL do projeto e a chave pública `anon`/`publishable`.
5. Copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```

Nunca coloque a senha do banco ou a chave `service_role` no frontend.

## Execução

### Windows, forma guiada

1. Execute `01-instalar-online.bat` uma única vez.
2. Execute `02-abrir-praxis-online.bat` sempre que quiser iniciar o teste.
3. Mantenha a janela preta aberta durante o uso.

O endereço local de teste é `http://127.0.0.1:1420`.

### Terminal

```bash
npm install
npm run dev
```

Validação e compilação:

```bash
npm run build
npm run test:reports
```

## Primeiro usuário

Ao criar a primeira conta, o esquema cria automaticamente:

- perfil do usuário;
- espaço de trabalho próprio;
- vínculo como administrador;
- classes e prazos iniciais.

Cada novo cadastro cria inicialmente um espaço separado. O administrador pode convidar usuários para trabalhar no mesmo espaço e distribuir os processos entre os membros ativos.

## Segurança implementada no banco

As políticas RLS impedem que um usuário consulte tabelas de um espaço do qual não seja membro. Usuários com perfil de consulta não podem alterar dados. Exclusões definitivas e determinadas operações administrativas exigem perfil de administrador.

## Observação sobre o projeto recebido

O ZIP usado como base continha a interface React, mas não continha `src-tauri`, onde ficaria o código Rust e SQLite da versão local. Essa ausência não bloqueia o Práxis Online, porque a camada local foi substituída pelo Supabase.
