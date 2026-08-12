# Práxis Online 0.11.0 — Contingência de leitura

## Escopo

A 0.11.0 implementa a primeira fase da contingência, exclusivamente em modo de leitura.

- IndexedDB por usuário + Procuradoria.
- Retenção local de 72 horas.
- Entrada automática em contingência quando a rede ou o Supabase não estão disponíveis.
- Visão Geral, Minha Fila e Processos permanecem consultáveis.
- Todas as capacidades de gravação ficam desabilitadas em contingência.
- Troca offline apenas entre Procuradorias previamente sincronizadas neste dispositivo.
- Reconexão automática ao Supabase quando o servidor volta a responder.
- Logout remove os snapshots locais do usuário.
- Documentos, observações e metadados detalhados não são armazenados no snapshot local.
- Service Worker mantém o shell da aplicação; os dados locais ficam no IndexedDB.

## Banco de dados

**Não há SQL para executar nesta versão.**

A 0.11.0 não altera schema, RLS, funções ou dados do Supabase.

## Atualização

1. Substitua/adicione no GitHub os arquivos do pacote `praxis-0.11.0-arquivos-para-github.zip`, preservando os caminhos.
2. Aguarde o workflow `quality.yml` e confirme que `npm run quality` ficou verde.
3. Publique/deploy a versão normalmente.
4. Abra o Práxis on-line e visite cada Procuradoria que deverá ficar disponível em contingência. Aguarde a carga completa dos processos antes de trocar de unidade.
5. Confirme em **Sobre** que a versão exibida é `0.11.0`.

## Teste recomendado de contingência

1. Com o Práxis on-line, entre na 4ª Procuradoria e aguarde a carga completa.
2. Troque para a 5ª Procuradoria e aguarde a carga completa.
3. Volte para a unidade desejada e aguarde alguns segundos para o snapshot local ser persistido.
4. Desative a rede do dispositivo ou use o modo Offline das ferramentas do navegador.
5. Confirme a faixa **“Modo contingência · somente leitura”**.
6. Verifique Visão Geral, Minha Fila, filtros e pesquisa em Processos.
7. Confirme que cadastro, edição, exclusão, exportação, administração e outras gravações não estão disponíveis.
8. Tente alternar entre as Procuradorias previamente sincronizadas.
9. Reative a rede e confirme que o Práxis retorna automaticamente ao modo on-line.
10. Faça logout e confirme que, após sair, o cache local daquele usuário foi removido.

## Observações de segurança

O snapshot é limitado à origem do aplicativo pelo IndexedDB do navegador e separado pela chave usuário + Procuradoria. A versão 0.11.0 não persiste documentos, observações nem os campos analíticos detalhados. Os snapshots expiram após 72 horas e são apagados no logout.

A contingência não substitui o Supabase como fonte de verdade. Não existe escrita offline nesta versão; essa funcionalidade fica reservada à 0.11.1-RC.
