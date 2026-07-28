# Changelog

## 0.10.3.2 — Autenticação forte administrativa

- Passkeys reconhecidas como autenticação forte para todas as funções administrativas.
- Login por senha continua sujeito ao TOTP quando exigido pelo perfil.
- Limpeza integral e restauração de backup exigem nova confirmação, com escolha entre passkey/biometria e código TOTP.
- A confirmação de segurança não depende de preferências gravadas no navegador.

# Histórico de versões

## 0.10.3.1 — Passkey como autenticação forte

- Login por passkey, Face ID, Touch ID ou biometria entra diretamente no Práxis.
- O código TOTP continua obrigatório quando o acesso é realizado com e-mail e senha.
- O método de autenticação é identificado pelo `amr` do JWT emitido pelo Supabase.
- Preferências locais do navegador não são utilizadas para dispensar o segundo fator.
- Testes automáticos cobrem passkey, senha, renovação do token e token inválido.
- Cache do Service Worker atualizado para distribuir a correção aos PWAs instalados.

## 0.10.3 — PWA, passkeys e desempenho

- Manifesto PWA, Service Worker, tela sem conexão e modo standalone.
- Aviso de instalação em navegadores compatíveis e instrução específica para iPhone/iPad.
- Detecção e aplicação automática de novas versões.
- Passkeys nativas do Supabase Auth, com Face ID, Touch ID e biometria do celular.
- Ativação opcional por navegador e gerenciamento de credenciais na aba Sobre.
- E-mail e senha preservados como método de recuperação.
- Consulta otimizada de movimentações, com campos explícitos, paginação paralela e deduplicação.
- Uso de sessão local para evitar validações remotas repetidas durante o reload.
- Consulta compartilhada de feriados e recessos.
- Testes para PWA e elegibilidade de dispositivos biométricos.

## 0.10.2 — Importação Inteligente e desempenho

- Prévia detalhada, lotes, histórico, reversão segura, origem e precisão dos dados.
- Atualização incremental após cadastro e edição.
- Exportação e arquivamento das operações lentas.
