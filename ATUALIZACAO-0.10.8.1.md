# Práxis Online 0.10.8.1

## Ordem de atualização

1. Execute `EXECUTAR-NO-SUPABASE-0.10.8.1.sql` no SQL Editor do Supabase.
2. Substitua/adicione no GitHub os arquivos do pacote `praxis-0.10.8.1-arquivos-para-github.zip`.
3. Aguarde o workflow de qualidade (`npm run quality`).
4. Publique somente após `check`, testes e build concluírem sem erro.

## Alterações

- Configurações reorganizadas em cinco seções internas.
- Campo de cadastro de Procuradoria alinhado ao padrão visual do Práxis.
- Vínculos de usuários com uma Procuradoria são salvos de uma só vez, em RPC transacional.
- Relatórios não carregam mais todos os detalhes ao abrir a página.
- Ao gerar um relatório, o banco elimina registros encerrados antes da janela relevante e aplica no servidor o escopo de responsável, classe e classificação quando possível.
- A paginação de movimentações busca duas páginas em paralelo após a primeira página completa.
- No celular, o seletor de Procuradoria ocupa uma segunda linha e deixa de disputar espaço com os controles de fonte.
