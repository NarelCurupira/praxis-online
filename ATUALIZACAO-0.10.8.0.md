# Práxis Online 0.10.8.0 — Múltiplas Procuradorias de Justiça

## Ordem recomendada

1. Faça backup do banco e do repositório.
2. No **SQL Editor do Supabase**, execute integralmente `EXECUTAR-NO-SUPABASE-0.10.8.0.sql`.
3. Confirme que a consulta final retorna a Procuradoria atual e o respectivo vínculo.
4. Substitua no GitHub os arquivos do pacote da 0.10.8.0, preservando as pastas.
5. Se a função `admin-manage-user` é implantada manualmente no seu projeto, redeploy a Edge Function a partir de `supabase/functions/admin-manage-user/index.ts`; a 0.10.8.0 passa a aceitar também o perfil **Estagiário** no cadastro de novas contas.
6. Aguarde o workflow de qualidade (`npm run check`, testes e build) antes de publicar.
7. Após entrar no Práxis, abra **Configurações > Procuradorias de Justiça** para cadastrar a 5ª Procuradoria e habilitar os integrantes.

## Como funciona

Cada `workspace` representa uma Procuradoria. Um usuário permanece com uma única conta e pode possuir vínculos distintos em várias Procuradorias por meio de `workspace_members`. O `profiles.current_workspace_id` indica a unidade ativa.

O seletor no topo muda a Procuradoria ativa e recarrega todos os dados estruturais e processuais dessa unidade. Visão Geral, Minha Fila, Processos, Eficiência, Relatórios, Qualidade, Lixeira, configurações e auditoria continuam segregados pelo workspace.

## Cadastro de uma nova Procuradoria

O administrador da unidade atual pode cadastrar outra Procuradoria. É possível copiar:

- jornada e regras de prazo;
- classes e prazos;
- calendário de exclusões.

**Não são copiados** processos, movimentações ou períodos fechados. O nome institucional da nova unidade começa com o nome cadastrado e o campo de Procurador responsável permanece em branco.

## Equipe

Na seção de Procuradorias, o administrador pode habilitar usuários já conhecidos pelo Práxis em cada unidade. O mesmo usuário pode ser, por exemplo, Assessor na 4ª Procuradoria e Assessor, Procurador, Estagiário ou Consulta em outra, conforme o vínculo administrativo atribuído.

## Transferência administrativa

O botão de transferência aparece somente para administradores quando existe outra Procuradoria em que o mesmo usuário também seja administrador. A transferência exige:

- Procuradoria de destino;
- responsável operacional ativo no destino;
- justificativa.

A movimentação é transferida e o cadastro do processo é criado ou reutilizado na unidade de destino. A operação é registrada na auditoria das duas Procuradorias e no histórico do processo transferido.

## Segurança

A migração 0.10.8.0 reforça as políticas RLS para que as tabelas operacionais exijam o `current_workspace_id`. As operações administrativas entre unidades ocorrem somente por RPCs `SECURITY DEFINER` que validam o vínculo de administrador e a autenticação forte.

## Compatibilidade

A 4ª Procuradoria existente continua sendo o workspace atual após a migração. A atualização não move nem duplica processos existentes. Se o campo **Nome da unidade** estiver preenchido nas configurações atuais, ele será usado como nome inicial da Procuradoria no novo seletor.
