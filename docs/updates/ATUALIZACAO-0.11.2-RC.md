# Práxis Online 0.11.2-RC

## Objetivo

Terceira etapa da contingência: detectar e resolver alterações concorrentes entre o estado local e o Supabase sem abandonar a fila offline, sem enfraquecer RLS e sem transformar o IndexedDB em fonte de verdade.

## O que muda

### 1. Base por alteração local

Operações offline sobre registros existentes passam a guardar somente a base dos campos que aquela operação pode modificar, além do estado de arquivamento/exclusão. Isso permite saber se o servidor mudou depois que o usuário começou a trabalhar offline.

### 2. Three-way merge por campo

Na reconexão, cada operação compara:

- **Antes:** valor visto quando a alteração local foi criada;
- **Servidor:** valor atual no Supabase;
- **Local:** valor que o usuário pretende gravar.

Só existe conflito quando `Servidor != Antes` e `Servidor != Local` no mesmo campo. Se outro usuário alterou um campo independente, a operação continua normalmente. Se servidor e local já convergiram para o mesmo valor, a operação é considerada idempotente e não duplica histórico desnecessariamente.

### 3. Fila com conflito persistente

Ao encontrar um conflito real, o Práxis:

- persiste o conflito no IndexedDB;
- interrompe a sequência naquela operação para preservar a ordem;
- exibe os valores Antes / Servidor / Local;
- exige decisão explícita antes de continuar.

### 4. Resolução explícita

Operações pendentes herdadas da 0.11.1-RC que não possuam baseline também exigem decisão explícita, exceto operações dependentes de um cadastro local criado pela própria fila.

A fila oferece:

- **Manter servidor:** descarta a alteração local conflitante e recarrega o estado atual;
- **Aplicar alteração local:** libera uma tentativa de sobrescrita consciente usando as APIs normais do Práxis.

A decisão "Aplicar local" não contorna validações, RLS, permissões ou períodos fechados. Se a gravação falhar, uma nova tentativa volta a reavaliar a concorrência.

### 5. Proteção de ciclo de vida

Se o processo foi arquivado, excluído ou deixou de existir no servidor depois da criação da operação local, a contingência não oferece sobrescrita local. A versão do servidor deve prevalecer nesse caso.

### 6. MFA e cache persistente

Permanece incorporada a correção preventiva da 0.11.1-RC: snapshots antigos são neutralizados na leitura e snapshots novos não restauram `mfaRequired=true` a partir do IndexedDB.

## O que permanece igual

- Supabase continua sendo a fonte de verdade.
- Fila permanece isolada por usuário + Procuradoria.
- Cadastro offline usa ID temporário negativo e proteção de idempotência.
- Exclusão, arquivamento, transferência, administração, importação e demais ações sensíveis continuam exclusivamente on-line.
- Logout continua avisando antes de apagar uma fila pendente.
- Não há migração SQL nesta versão.

## Próxima RC

A 0.11.3-RC fica reservada para Push/notificações. Após consolidação sem regressões, a versão poderá ser promovida sem mudança funcional relevante.
