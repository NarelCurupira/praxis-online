# Práxis 0.10.7.2 — Seletores e histórico

- Padroniza em 44 px as listas suspensas de formulários, relatórios e equipe.
- Amplia para 40 px os seletores de filtros e paginação.
- Amplia para 36 px os seletores compactos das tabelas, preservando a densidade das linhas.
- Limita o histórico da aba Sobre às três versões mais recentes.
- Centraliza os nomes e as descrições das versões apresentadas.
- Renova o cache do PWA para distribuir os novos estilos.

# Práxis 0.10.7.1 — Correções visuais

- Oculta o botão de menu móvel quando a barra lateral já está disponível no desktop.
- Usa símbolos próprios para os modos claro e escuro no menu recolhido.
- Corrige o alinhamento do símbolo da marca no menu recolhido.
- Impede que a altura mínima acessível amplie os botões compactos de copiar.
- Padroniza campos, seletores e áreas de texto em Configurações e Equipe.
- Corrige os cartões de Relevância social e Alta complexidade no modo escuro.
- Corrige os campos bloqueados e os botões de copiar na edição de processos.
- Atualiza o cache do PWA para distribuir imediatamente as correções.

# Práxis 0.10.7 — Mobile, produtividade e identidade visual

- Adiciona swipe para abrir o menu, pull-to-refresh, feedback tátil e botão
  para voltar ao topo.
- Reorganiza o cabeçalho móvel, padroniza áreas de toque e transforma “Novo
  processo” em botão de ícone nas telas estreitas.
- Cria diagnóstico direto para processos enviados sem data e classifica como
  leve a ausência da intervenção quando ela não afeta a eficiência.
- Amplia o histórico próprio do processo com data, hora, usuário, ação, campo,
  valor anterior e novo valor.
- Adiciona seleção múltipla e barra flutuante para responsável, intervenção,
  exportação, arquivamento e exclusão.
- Transforma os indicadores da Visão Geral em atalhos para listas filtradas.
- Reformula o Movimento Mensal com comparação ao ano anterior, últimos 12
  meses e navegação por mês.
- Aplica a nova identidade visual, paleta, logos, ícones PWA, favicon, splash
  e estados vazios.

# Práxis 0.10.6 — Otimização de desempenho

- Acelera o cálculo de horas úteis sem alterar fins de semana, feriados,
  recessos ou jornada configurada.
- Compartilha sessão e workspace entre as APIs para evitar consultas repetidas.
- Reúne atualização de providência e histórico em uma única operação.
- Adiciona índice parcial para a carga dos processos ativos.
- Separa no diagnóstico o tempo de busca e o tempo de transformação dos dados.

# Práxis 0.10.4 — Consolidação para a versão 1.0

- Unifica o número da versão no pacote, interface e Service Worker.
- Adiciona verificação automática para impedir publicação com versões divergentes.
- Torna obrigatórios no GitHub Actions: TypeScript, testes automáticos e build.
- Publica a pasta `dist` como artefato de cada execução bem-sucedida.
- Implementa exportação das configurações institucionais em JSON versionado.
- A exportação contém configurações gerais, classes, calendário e períodos fechados; não contém processos ou credenciais.

# 0.10.3.7 — Área segura no iPhone e configurações pessoais

- Reserva a área superior do iPhone com notch ou Dynamic Island quando o Práxis está instalado como PWA.
- Mantém o menu e os controles do cabeçalho abaixo da barra de status.
- Torna a página Configurações visível a todos os usuários autenticados.
- Usuários não administradores visualizam somente o painel pessoal de biometria/passkey.
- Configurações institucionais e administrativas continuam exclusivas do administrador.

# Práxis 0.10.3.6

- O aviso de nova versão passa a ser exibido exclusivamente quando o Práxis estiver aberto como PWA instalado.
- No uso comum pelo Chrome, Edge, Safari ou outro navegador, a atualização do Service Worker não gera aviso visual de aplicativo instalado.

# Práxis 0.10.3.5

- Oferta de instalação PWA limitada a Mac, iPhone, iPad e Android; navegadores no Windows não exibem mais o aviso.
- Login com passkey passa a abrir diretamente no modo biométrico, mantendo e-mail e senha ocultos até escolha explícita.
- Inicialização progressiva: interface administrativa abre após carregar configurações e perfil; processos e dados auxiliares continuam em segundo plano.
- Cache de movimentações ampliado para reduzir recargas integrais repetidas na mesma sessão.

## 0.10.3.4
- Reconhecimento de passkey no backend para RPCs, RLS, Auditoria, Diagnóstico e Logs técnicos.
- Login por senha continua exigindo AAL2/TOTP para funções administrativas.

## 0.10.3.3

- Liberação integral das funções administrativas para sessões autenticadas por passkey/WebAuthn.
- Compatibilidade com os métodos `passkey`, `webauthn` e `mfa/webauthn` no JWT.
- Configuração do acesso biométrico movida da aba Sobre para Configurações.
- O formulário de senha é ocultado após a seleção do acesso biométrico, com opção explícita para voltar ao login por senha.

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
