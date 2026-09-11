# Práxis Online 0.11.1-RC — segunda fase da contingência

## Objetivo

A 0.11.1-RC mantém a contingência de leitura da 0.11.0 e acrescenta gravação operacional local com fila de sincronização. O Supabase continua sendo a fonte de verdade e nenhuma escrita offline contorna as RLS, permissões ou validações existentes.

## O que pode ser feito em contingência

Conforme as permissões do usuário armazenadas no snapshot da Procuradoria:

- cadastrar novo processo;
- alterar status;
- alterar providência;
- alterar responsável;
- editar integralmente um registro apenas quando os detalhes já estiverem disponíveis localmente (por exemplo, processo criado na própria contingência ou aberto em detalhe antes da indisponibilidade).

Os novos registros recebem identificador temporário local negativo até a confirmação pelo servidor e são marcados com a flag **Local**.

## O que continua exclusivamente on-line

- exclusão e exclusão em lote;
- arquivamento em lote;
- exportação;
- transferência entre Procuradorias;
- importação e restauração;
- Lixeira;
- Equipe e administração de usuários;
- Configurações administrativas;
- Qualidade dos Dados e Auditoria;
- demais operações administrativas ou destrutivas.

## Sincronização

- As operações ficam no IndexedDB, isoladas por usuário e Procuradoria.
- A reconexão tenta sincronizar automaticamente a Procuradoria ativa.
- Se o navegador indicar conexão antes de o backend responder, a recuperação é tentada novamente após 15 segundos, mantendo a interface local disponível.
- A fila é processada em ordem cronológica e para na primeira falha, evitando que uma operação dependente ultrapasse outra anterior.
- Também é possível abrir **Fila de sincronização** e acionar **Sincronizar esta Procuradoria** manualmente.
- Ao trocar para uma Procuradoria on-line, o Práxis tenta sincronizar primeiro as operações pendentes daquela unidade.

## Segurança e consistência

- A sincronização chama as mesmas APIs normais do Práxis; o servidor continua aplicando RLS e regras de governança.
- Erros de permissão, validação ou regra de negócio não são convertidos silenciosamente em gravação local. O fallback automático ocorre apenas em falhas reconhecidas como transitórias de rede/servidor.
- Cadastro, status, providência e responsável possuem verificações para reduzir repetição quando uma gravação chegou ao servidor, mas a confirmação se perdeu.
- A data/hora em que o usuário marcou **Enviado** durante a contingência é preservada no envio posterior ao Supabase.
- O snapshot de leitura continua sem documentos, observações internas e metadados detalhados. Dados que o usuário criar/editar offline ficam necessariamente na fila local enquanto aguardam sincronização.
- O logout continua apagando o armazenamento local do usuário, mas agora exige confirmação quando houver alterações pendentes.

## Limite deliberado da RC

A 0.11.1-RC **não resolve concorrência entre dois usuários que alterem o mesmo registro em estados diferentes**. A fila sinaliza explicitamente esse limite. Versionamento, detecção e resolução assistida de conflitos permanecem reservados para a versão 1.0.

## Banco de dados

**Não há SQL nem migração Supabase nesta versão.**

## Atualização

1. Substitua no GitHub os arquivos contidos no ZIP, preservando exatamente os caminhos.
2. Não execute SQL no Supabase.
3. Aguarde o workflow do GitHub Actions e confirme `npm run quality` verde.
4. Depois do deploy, abra on-line cada Procuradoria que deverá ter contingência para atualizar seu snapshot local.

## Teste funcional recomendado

1. Entre on-line e aguarde a Procuradoria carregar.
2. Desconecte a rede.
3. Cadastre um processo de teste e confira a flag **Local**.
4. Altere status/providência/responsável de um processo existente.
5. Abra **Fila de sincronização** e confira a ordem das operações.
6. Reconecte a rede.
7. Confirme o desaparecimento das operações sincronizadas e compare o registro com o Supabase.
8. Repita em uma segunda Procuradoria para confirmar o isolamento da fila.
9. Faça um teste com uma alteração pendente e tente sair da conta; o aviso de perda da fila deve aparecer.
