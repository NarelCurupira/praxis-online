# Atualização do Práxis para 0.10.7.8

1. Substitua no GitHub os arquivos indicados em `ARQUIVOS-0.10.7.8.txt`, preservando as mesmas pastas.
2. Esta atualização não exige execução de SQL nem alteração no Supabase.
3. Aguarde a validação automática do GitHub ou execute localmente `npm install`, `npm run check`, `npm test` e `npm run build`.
4. Publique a nova build.
5. Confirme a versão 0.10.7.8 na aba **Sobre**.
6. No celular, execute o pull-to-refresh e confirme que a atualização conclui normalmente.
7. Após uso suficiente, exporte novamente **Operações lentas**. Os novos nomes poderão incluir, por exemplo, `movements.fetch.pull.pages3.rows2517` e `movements.page.initial.1.rows1000`.

## Escopo

- Proteção single-flight: uma segunda solicitação reutiliza a carga de movimentações já em andamento.
- Pull-to-refresh restrito às movimentações.
- Telemetria por motivo, página, linhas, transformação e reaproveitamento.
- Consulta atual preservada para comparação; arquivados e campos extensos ainda não foram retirados nesta versão.
