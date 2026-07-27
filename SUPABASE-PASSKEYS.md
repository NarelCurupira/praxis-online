# Ativação de passkeys no Supabase

A versão 0.10.3 usa o suporte experimental nativo a passkeys do Supabase Auth.

## Configuração obrigatória no painel

1. Abra o projeto no Supabase.
2. Vá em **Authentication → Passkeys**.
3. Ative **Enable Passkey authentication**.
4. Preencha:
   - **Relying Party Display Name:** `Práxis`
   - **Relying Party ID:** o domínio exato e estável do aplicativo, sem `https://` e sem caminho.
   - **Relying Party Origins:** a origem completa do aplicativo, com `https://`.

Para o endereço atualmente utilizado, confira no navegador o domínio publicado e use, por exemplo:

- RP ID: `praxis-online.narelcurupira.workers.dev`
- Origin: `https://praxis-online.narelcurupira.workers.dev`

Se o domínio publicado for diferente, use o endereço real. Não mude o RP ID depois que os usuários começarem a cadastrar passkeys, pois as credenciais são vinculadas ao domínio.

## Funcionamento no Práxis

- O usuário entra normalmente com e-mail e senha na primeira vez.
- Na aba **Sobre**, ativa Face ID, Touch ID ou biometria do celular.
- A preferência de mostrar o acesso biométrico é salva somente naquele navegador.
- E-mail e senha permanecem disponíveis para recuperação.
- Por decisão do projeto, o botão é exibido apenas em Mac, iPhone, iPad e Android.

## Observação

Passkeys no Supabase ainda são um recurso experimental. Antes de substituir a versão estável, teste o cadastro, saída e novo acesso em um único dispositivo.

## Comportamento do segundo fator no Práxis 0.10.3.1

- Login por passkey: não solicita código TOTP adicional.
- Login por e-mail e senha: continua solicitando TOTP para administradores e usuários com MFA obrigatório.
- A distinção é feita pelo método `passkey` presente no campo `amr` do JWT emitido pelo Supabase.
- Preferências do navegador e localStorage não são usadas para dispensar o segundo fator.
