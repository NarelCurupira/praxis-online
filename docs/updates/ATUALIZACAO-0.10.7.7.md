# Atualização do Práxis para 0.10.7.7

1. Substitua os arquivos indicados em `ARQUIVOS-0.10.7.7.txt`.
2. Execute integralmente `supabase/migrations/20260801_praxis_v01077_security_retention.sql` no SQL Editor do Supabase.
3. Execute `npm install`, `npm run check`, `npm test` e `npm run build`.
4. Publique a nova build.
5. Entre como administrador com MFA/passkey e abra **Auditoria e diagnóstico**.
6. Teste o botão **Limpar dados técnicos**.
7. Confirme a versão 0.10.7.7 na aba **Sobre**.

A migração é idempotente. Não inclua UUIDs de usuários ou simulações de JWT no repositório.
