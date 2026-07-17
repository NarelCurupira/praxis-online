# Práxis Online 0.5.2 — instalação da atualização

Esta versão acrescenta painel de eficiência, distribuição colaborativa, convite obrigatório, MFA administrativo, recuperação de senha por e-mail, sessão inativa de quatro horas, auditoria, restauração de backup e tema noturno. O QR Code do autenticador também foi ampliado para facilitar a leitura.

## Recuperação de senha

No Supabase, abra **Authentication → URL Configuration** e confirme que o endereço público do Práxis está cadastrado em **Redirect URLs**. Exemplo: `https://seu-endereco.workers.dev/**`. Sem essa autorização, o e-mail pode ser enviado, mas o link não conseguirá retornar corretamente ao sistema.

## Ordem recomendada

1. No Supabase, abra **SQL Editor** e execute todo o arquivo `supabase/006-seguranca-auditoria-eficiencia.sql`.
2. No Supabase, abra **Authentication → Multi-Factor Authentication** e habilite o fator **TOTP**.
3. Envie os arquivos desta versão ao repositório GitHub, substituindo os anteriores.
4. Aguarde o novo build do Cloudflare terminar e abra o Práxis novamente.
5. No primeiro acesso administrativo, escaneie o QR Code com o Google Authenticator ou com o app **Senhas** do iPhone e confirme o código de seis dígitos.

## Proteção contra robôs com Cloudflare Turnstile

A aplicação já está preparada, mas o Turnstile só aparece depois de configurado:

1. No Cloudflare, abra **Turnstile → Add widget** e cadastre o endereço `workers.dev` usado pelo Práxis.
2. Copie a **Site key** e a **Secret key**.
3. No projeto do Cloudflare, crie a variável de build `VITE_TURNSTILE_SITE_KEY` com o valor da Site key.
4. No Supabase, abra **Authentication → Bot and Abuse Protection**, habilite CAPTCHA, selecione **Cloudflare Turnstile** e informe a Secret key.
5. Faça uma nova implantação no Cloudflare.

Não publique a Secret key no GitHub. A Site key pode ficar na variável de build; ela é pública por natureza.

## Como funcionam os convites

- O administrador gera o código na aba **Equipe**.
- O novo usuário abre a tela de acesso, toca em **Tenho um convite** e informa nome, e-mail, senha e código.
- O e-mail deve ser exatamente o mesmo usado pelo administrador ao criar o convite.
- Contas criadas sem convite não recebem acesso a nenhum espaço nem a qualquer processo.

## Permissões

- Todos os perfis operacionais: visualizar todos os processos, importar planilhas, exportar Excel, usar a lixeira e redistribuir responsáveis.
- Somente administrador: Equipe, Configurações, Qualidade dos dados, backup JSON, restauração, limpeza do banco, auditoria e comparativo individual de eficiência.
- Perfil “Somente consulta”: leitura, relatórios e indicadores, sem alterações.

## Backup e restauração

O administrador pode baixar o backup JSON. Para restaurar, escolha o próprio arquivo JSON, digite `RESTAURAR` e confirme. Antes de substituir os dados, o sistema baixa automaticamente uma cópia do estado atual.

## Sessão

O sistema encerra a sessão após quatro horas sem teclado, toque, clique ou rolagem. A atividade é compartilhada entre as abas do Práxis abertas no mesmo navegador.
