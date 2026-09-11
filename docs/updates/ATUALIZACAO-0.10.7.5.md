# Atualização do Práxis para 0.10.7.5

Esta correção não exige query SQL.

## Ordem de implantação

1. Substitua os arquivos do repositório pelos arquivos deste pacote.
2. Publique novamente a função `admin-manage-user` no Supabase:

   ```bash
   npx supabase functions deploy admin-manage-user
   ```

   Também é possível atualizar a função pelo painel do Supabase, usando o arquivo
   `supabase/functions/admin-manage-user/index.ts` incluído no pacote.
3. Envie os demais arquivos ao GitHub e aguarde a publicação da aplicação.
4. Confirme a versão 0.10.7.5 na aba **Sobre**.
5. Na aba **Equipe**, edite um usuário e clique em **Redefinir senha**.

## Resultado esperado

- O botão muda temporariamente para **Enviando...**.
- O administrador recebe uma confirmação dentro do modal.
- O usuário recebe o e-mail de recuperação do Supabase; se não aparecer na caixa
  de entrada, deve verificar spam e a configuração SMTP do projeto.
- A solicitação aparece na Auditoria administrativa como
  `member_password_reset_requested`.

O fluxo continua exigindo perfil de administrador e autenticação forte, conforme
as permissões já existentes no Práxis.
