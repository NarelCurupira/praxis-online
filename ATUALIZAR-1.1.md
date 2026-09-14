# Práxis Online 1.1.0 — atualização pelo navegador

Base: versão 1.0 do repositório NarelCurupira/praxis-online, commit `ea949aa90df31f473b4ecc52dd0b5bb70f273ef1`, confirmado no GitHub em 14/09/2026.

Este pacote foi preparado para essa base. Não exige Git, terminal nem espelho local. Nenhuma alteração foi publicada no GitHub ou executada no Supabase de produção.

## Ordem de instalação

1. Combine um intervalo sem gravações da equipe. Antes de começar, sincronize a fila local em todos os dispositivos e encerre as edições abertas. **Não saia da conta se houver operações pendentes**, pois a saída manual continua apagando os dados locais após o aviso.
2. Guarde uma cópia da versão atual: no GitHub, **Code → Download ZIP**. Faça também uma cópia do banco pelos recursos disponíveis no painel Supabase. O JSON da versão 1.0 contém apenas parte dos dados e não equivale a uma cópia integral do banco.
3. No Supabase, abra o **SQL Editor** do projeto já usado pelo Práxis, crie uma consulta e cole **todo** o conteúdo de `SUPABASE/01-atualizar-praxis-1.1.sql`. Execute de uma vez. O resultado final deve ser **“Práxis 1.1: atualização SQL concluída”**. Se houver erro, não publique o frontend: o script usa uma transação e desfaz suas próprias alterações. Guarde o erro completo para análise.
4. Extraia o ZIP da atualização. No GitHub, abra a raiz do repositório e use **Add file → Upload files**. Arraste **o conteúdo da pasta GITHUB**, preservando as subpastas `src`, `public`, `scripts` e `supabase`, além dos arquivos da raiz. São somente os arquivos alterados ou novos; os demais permanecem no repositório. **Não envie o ZIP nem crie uma pasta GITHUB dentro do repositório.**
5. Confirme que `src/movementOperations.ts`, `src/praxis11.css`, `scripts/build-precache.mjs`, `package.json` e `package-lock.json` aparecem nos caminhos corretos. Publique todos os arquivos do pacote em **um único commit** para evitar builds intermediários incompletos. Sugestão: `Práxis 1.1.0 — confiabilidade e layout`.
6. Aguarde o check do GitHub e o deploy da hospedagem terminarem. Mantenha o comando de build **`npm run build`** e o diretório **`dist`**: a geração do cache PWA agora faz parte desse comando. Não use apenas `vite build`.
7. Feche todas as abas e janelas instaladas do Práxis e abra novamente, conectado à internet. Se aparecer “Nova versão disponível”, conclua as operações pendentes e toque em **Atualizar agora**. Confira **1.1.0** na tela Sobre.

Não são necessárias novas chaves nem redeploy de Edge Functions nesta entrega. As funções SQL de Push mantêm os nomes e o formato esperados pela Edge Function atual. As configurações existentes do projeto Supabase e da hospedagem foram preservadas.

## Conferência após atualizar

Use um registro de teste, sem informação real sensível, antes de liberar as gravações da equipe:

- Entre com o perfil habitual, abra Minha fila e Processos e confira responsáveis e contagens.
- Cadastre um processo de teste; altere providência e status. Verifique o histórico.
- Abra o mesmo registro em duas sessões: uma edição com uma versão antiga deve informar conflito, sem sobrescrever silenciosamente a outra.
- Confira a visualização favorita, o recolhimento de Organização e exportação, os modos claro/escuro e a leitura no seu iPhone e computador.
- Com o aplicativo previamente carregado, teste uma alteração em contingência e a posterior sincronização. O PWA precisa concluir sua primeira instalação online para ter todos os arquivos em cache.
- No perfil administrador, gere um **novo backup 1.1** e guarde o JSON fora do aplicativo.
- Confira Push em um dispositivo de teste e a desativação ao sair. A entrega depende da configuração e dos segredos já existentes no Supabase.

## O que mudou

- **Dados:** datas de envio ausentes deixam de receber a estimativa automática de dez dias. Datas históricas já existentes são preservadas. Intervalos negativos não são mais convertidos em zero.
- **Indicadores:** média, mediana e percentis em horas usam horários confirmados. Os limites de “um dia útil” e a conversão para dias usam a jornada configurada. Salvar uma jornada com duração incompatível com início/fim agora é bloqueado. O score de qualidade recebe as justificativas mínimas necessárias; uma base vazia aparece como “Sem dados”, e uma cópia sem detalhes como “Parcial”.
- **Gravações individuais e contingência:** cadastro e edição passam pela transação SQL. Status e histórico são gravados juntos. Versões de movimentação e data de atualização do processo detectam concorrência. Operações offline têm recibos no servidor e bloqueio entre abas com Web Locks quando disponível. O identificador do cadastro é preservado se uma falha de rede exigir sua passagem para a fila local.
- **Backup:** o novo JSON operacional inclui processos, movimentações, lixeira, arquivados, histórico e uma cópia das configurações. A recuperação atualiza processos e movimentações do arquivo em uma transação, guarda uma cópia anterior em `recovery_snapshots_v11` e preserva registros que não estão no arquivo.
- **Segurança:** cabeçalhos impedem enquadramento externo da aplicação na hospedagem que aplica `public/_headers`; escritas administrativas diretas nas tabelas de configurações e exclusões definitivas exigem autenticação forte. Endpoints Push são limitados a provedores conhecidos; uma assinatura não é transferida para outra conta; a fila confere destinatário e vínculo ativo. A notificação da tela bloqueada passa a usar texto genérico, com detalhes dentro da Central.
- **Sessão/PWA:** a expiração por quatro horas de inatividade é verificada antes de renovar a atividade ao reabrir. A expiração preserva a fila local; a saída manual mantém a confirmação antes de apagá-la. A saída tenta invalidar a assinatura Push do dispositivo. A atualização do aplicativo aguarda comando do usuário e não recarrega automaticamente outras abas.
- **Interface:** menu e cabeçalho mais compactos no desktop, ajustes de espaçamento nos cards, CNJ sem quebra de linha na tabela, organização recolhível, uma visualização favorita por usuário/Procuradoria/fila, busca com renderização adiada, estado “Salvando…”, tratamento de erros na lista e no cadastro, foco e Escape nos formulários e rótulos de acesso em português. Prazos relativos indicam dias corridos.
- **Manutenção:** DOMPurify atualizado para a versão corrigida, todos os arquivos de teste passam a ser descobertos automaticamente e o build gera a lista de arquivos do cache PWA.

## Limites e cuidados específicos

- **A recuperação 1.1 é operacional, por mesclagem.** Ela não apaga os registros ausentes do JSON e não restaura contas, senhas, permissões, arquivos do Storage, configurações nem auditoria histórica. Esses últimos dados presentes no JSON servem como referência. Para restauração integral do projeto, use os recursos do PostgreSQL/Supabase.
- O aplicativo **não aceita diretamente o antigo JSON 1.0 para recuperação**. Ele deve ser convertido e revisado para evitar perda de IDs e estados. Guarde os arquivos antigos e gere um novo backup após instalar a 1.1.
- **Backup diário externo automático não foi ativado.** Precisa de configuração de agendamento, destino e retenção no seu ambiente. A cópia anterior à recuperação fica no mesmo banco e não substitui backup externo. Não há limpeza automática dessa tabela nesta entrega.
- Datas que já haviam sido estimadas não foram apagadas em massa. Revise os registros históricos antes de confirmar horários; indicadores podem mudar por passarem a usar somente medições confirmadas.
- A importação de planilhas continua executada por etapas. Agora preserva os contadores ao registrar uma falha, mas **ainda não tem transação única para todo o lote nem retomada automática**. Em falhas parciais, confira o histórico e use a prévia antes de importar novamente.
- A proteção de versão desta entrega cobre gravações individuais e sincronização offline. Ações em lote, transferências e rotinas antigas de importação continuam com seus mecanismos existentes. Não foram adicionadas atualização em tempo real da lista nem preferências de Procuradoria independentes por dispositivo.
- O CSS anterior foi preservado e recebeu uma camada de refinamento. Não houve reescrita integral do design system, nem medição de Lighthouse/Core Web Vitals em produção.
- A implantação depende de o banco estar na base 1.0 completa. O roteiro de nova instalação em `scripts/migrations-order.json` é para banco vazio; **não é o roteiro de atualização**.

## Validação realizada

- Verificação de versão, TypeScript, **146 testes automatizados** e build de produção.
- Migrações históricas e nova migração executadas em PostgreSQL isolado (PGlite), com reaplicação da 1.1 e **12 cenários de comportamento**: idempotência, conflito, datas, recuperação, permissões, isolamento e Push. Auth e extensões de rede/criptografia foram simulados somente no ambiente de testes; não foi usada a infraestrutura real do Supabase.
- Auditoria de dependências de produção: **nenhuma vulnerabilidade reportada** na verificação de 14/09/2026. O resultado está incluído no pacote.
- **A inspeção visual interativa ficou pendente:** o navegador remoto não conseguiu acessar o servidor local de prévia. Os testes automatizados e a compilação não substituem a conferência do layout em iOS/Safari e desktop.
- Não foram executados testes contra seu banco, suas contas, o serviço Push externo ou a hospedagem de produção.

## Se ocorrer problema

Se o SQL falhar, mantenha o frontend 1.0 e envie a mensagem completa do erro. Se o build falhar, use o log do GitHub/hospedagem; não remova arquivos para tentar fazer a publicação passar. Se a interface falhar depois do deploy, suspenda gravações e registre a tela e o erro. A migração é aditiva, mas **voltar o frontend para 1.0 reativa seus caminhos antigos de gravação e recuperação**; não use a restauração antiga como mecanismo de reversão. Uma reversão do banco deve ser preparada a partir do backup do projeto, não apagando tabelas novas indiscriminadamente.
