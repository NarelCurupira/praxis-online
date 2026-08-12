# Critérios para a versão 1.0

## Base funcional consolidada

- [x] Cadastro, edição, fila, processos e lixeira
- [x] Controle de acesso por perfil
- [x] Importação e reimportação
- [x] Prazos e horas úteis
- [x] Eficiência e qualidade dos dados
- [x] Relatórios individuais e de equipe
- [x] Configurações e fechamento mensal

## Engenharia de confiabilidade

- [x] Testes automáticos executados no GitHub
- [x] Verificação TypeScript e build automático
- [x] Error Boundary e captura global de erros
- [x] Identificação da compilação
- [x] Registro técnico sem dados processuais
- [x] Auditoria e diagnóstico unificados
- [x] Importações por lote com prévia
- [x] Origem e precisão dos dados
- [ ] Paginação real e otimizações de crescimento
- [x] Ajuda contextual
- [ ] Exportação e importação de configurações
- [ ] Release candidate validada em uso cotidiano

## Atualização 0.10.1
- [x] Auditoria e diagnóstico unificados.
- [x] Consulta de logs técnicos.
- [x] Monitoramento básico de desempenho.
- [x] Monitoramento do tamanho do banco.
- [x] Ajuda contextual inicial.
- [x] Histórico de versões na interface.

## Atualização 0.10.2
- [x] Importação Inteligente com prévia e regras de validação.
- [x] Lotes de importação com origem e precisão dos dados.
- [x] Histórico e reversão segura de lotes.
- [x] Atualização incremental após operações cotidianas.
- [x] Exportação e arquivamento de operações lentas.

## Concluído na 0.10.3

- [x] Aplicação instalável como PWA.
- [x] Service Worker, atualização controlada e contingência sem conexão.
- [x] Passkeys/biometria opcional em Mac e celulares.
- [x] Otimização do carregamento integral de movimentações.
- [x] Redução de validações repetidas de sessão.


## Roadmap de contingência até a 1.0

### 0.11.0 — leitura offline
- [x] IndexedDB por usuário + Procuradoria.
- [x] Snapshot operacional com retenção de 72 horas.
- [x] Modo somente leitura automático.
- [x] Troca entre Procuradorias previamente sincronizadas.
- [x] Retorno automático ao Supabase após reconexão.
- [x] Exclusão do cache no logout.

### 0.11.1-RC — escrita offline e sincronização
- [ ] Fila local de operações pendentes.
- [ ] Cadastro e edição básica em contingência.
- [ ] Alteração offline de responsável, providência e status.
- [ ] Sincronização automática das operações sem conflito.
- [ ] Painel de pendências de sincronização.

### 1.0 — conflitos, segurança e estabilização
- [ ] Versionamento otimista dos registros.
- [ ] Detecção e resolução assistida de conflitos.
- [ ] Testes multiusuário, multi-Procuradoria e de queda abrupta da rede.
- [ ] Revisão final de segurança do armazenamento local.
- [ ] Telemetria específica de contingência e sincronização.
- [ ] Documentação operacional final e release estável.
