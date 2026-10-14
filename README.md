## V1.39.11 — correspondência estrita de placa no SGA

- Corrige o resolvedor que, na V1.39.10, podia usar o primeiro veículo retornado pelo SGA quando a placa exata não era encontrada.
- O Portal agora aceita SOMENTE veículo cuja placa normalizada seja exatamente igual à placa solicitada.
- Foram adicionadas tentativas controladas nos endpoints `veiculo/buscar` e `veiculo/buscar-por-permissao`, sempre com validação exata da placa retornada.
- Eventos obtidos pelo código interno do veículo são filtrados novamente antes de aparecerem no Portal.
- O fallback de evento por placa também descarta qualquer evento cuja placa seja diferente da consulta.
- Se o SGA devolver outro veículo/evento, o Portal retorna “nenhuma correspondência exata” em vez de assumir um resultado.
- A mesma proteção é reutilizada no envio do PDF, impedindo que um documento seja anexado a evento de outra placa.
- Nenhuma ENV, permissão do token ou regra do Firestore foi adicionada nesta versão.


## V1.39.10 — resolução robusta de placa/evento no SGA

- Placas são normalizadas para maiúsculas e sem hífen/espaços no Portal (`GPV-0000`, `gpv0000` e `GPV0000` convergem para `GPV0000`).
- A consulta SGA deixa de depender primeiro de `listar/evento-veiculo/{placa}`.
- O Portal busca o veículo por placa em `veiculo/buscar/{placa}/placa`, obtém `codigo_veiculo` e consulta os eventos pelo código interno.
- Se a busca por código não retornar evento, a consulta direta pela placa continua como fallback.
- A tela SGA informa a placa normalizada, o código do veículo localizado e qual estratégia encontrou o evento.
- O botão “Localizar evento” do agendamento usa a mesma resolução e passa a exibir também o erro técnico retornado pelo SGA quando todos os caminhos falharem.
- O envio do PDF revalida o evento usando a mesma lógica antes de anexar o documento, evitando divergência entre consulta e envio.
- Nenhuma ENV, permissão de usuário ou regra do Firestore foi adicionada nesta versão.


## V1.39.9 — operador da coleta separado de quem agenda

- `createdBy/createdByName` identifica quem criou o agendamento (ex.: Thamyres/Nataly).
- `assignedTo/assignedToName` identifica quem realizará a coleta/ligação (ex.: Samuel).
- Novo campo de usuário `canPerformCollections`: somente usuários marcados aparecem como operadores da coleta e podem receber faixas de disponibilidade.
- Disponibilidade é cadastrada por operador da coleta; qualquer Atendente autorizado a criar agendamentos pode utilizar os horários publicados para esse operador.
- VTCall e envio operacional ao SGA ficam restritos ao operador atribuído, com override de Administrador/Desenvolvedor.
- PDF registra tanto “Responsável pela coleta” quanto “Agendado por”.
- Fluxo SGA da V1.39.8 permanece: consulta do evento, observação, classificação e upload do PDF diretamente no evento.

# Portal Coleta de Relatos — V1.39.7

Portal interno para agenda, gestão de acessos, auditoria, VTCall e integração gradual com o SGA.

## Stack
- Next.js 16 + React 19
- Vercel
- Firebase Authentication
- Cloud Firestore
- Firebase Admin SDK
- Cloudinary para imagens de perfil
- Lucide React

## Variáveis de ambiente
Cadastre na Vercel (Production, Preview e Development):

### Firebase Web
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Firebase Admin
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

### Cloudinary
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Nunca envie a chave privada do Firebase Admin ou o API Secret do Cloudinary para o GitHub.

## V1.1
- Novo nome: Portal Coleta de Relatos
- Nova identidade visual em preto, amarelo e neutros
- Tela de login redesenhada com veículo e placa visual
- Tema claro/escuro com preferência persistente no navegador
- Dashboard com atalhos operacionais
- Componente de placa estilizado e dinâmico
- Melhorias no calendário e tabelas
- Upload de foto de perfil migrado do ImageKit para o Cloudinary
- VTCall e fluxo completo de Coleta de Relato continuam preparados como evoluções futuras

## Primeiro acesso
O login usa e-mail + CPF configurados no Firebase Authentication. O documento correspondente deve existir em `users/{UID}` no Firestore com `active: true` e um dos perfis: `admin`, `atendente` ou `consulta`.


## Diagnóstico Firebase Admin (V1.26)

Se rotas administrativas ou o upload de foto retornarem HTTP 500, verifique na Vercel:

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

A chave privada pode ser colada com `\n` literais ou como PEM multilinha; a V1.26 normaliza ambos.
Também há suporte opcional a `FIREBASE_SERVICE_ACCOUNT_KEY` com o JSON completo da conta de serviço.

Depois de alterar Environment Variables, faça um novo deploy.


## V1.39 — Consolidação operacional
- Status do ramal VTCall no agendamento (Disponível / Em chamada / Não configurado).
- Atualização automática do Showpeer a cada 10 segundos enquanto o agendamento está aberto.
- Histórico de tentativas de ligação por agendamento.
- Filtros por status e data na lista de agendamentos.
- Novos status operacionais: Em contato, Não atendeu, Reagendar e Concluído.
- Alerta não bloqueante de possível duplicidade por placa/telefone em datas próximas.
- Atalho VTCall do painel atualizado para refletir integração ativa.
- Instrumentação de investigação da V1.38 mantida somente no backend, sem alerta específico no modal.


## V1.39.2
- Múltiplas coletas no mesmo dia.
- Responsável por agendamento.
- Conflito apenas quando o mesmo responsável tem horários sobrepostos.
- Contagem diária na agenda e filtro por responsável.


## V1.39.3 — Nível Desenvolvedor
- Novo nível exclusivo **Desenvolvedor** para a conta técnica principal do portal.
- O Desenvolvedor mantém acesso total a agenda, usuários, logs, VTCall e configurações.
- Administradores não podem editar, bloquear, redefinir senha, alterar VTCall ou modificar o acesso do Desenvolvedor.
- O nível Desenvolvedor não aparece como opção ao criar ou promover outros usuários.
- O Desenvolvedor pode substituir a foto de perfil de qualquer usuário diretamente pela tela de edição.
- Alterações de foto feitas pelo Desenvolvedor são registradas na auditoria.
- Regras do Firestore reforçadas para proteger o cadastro técnico também contra alterações diretas pelo cliente.


## V1.39.4 — Novo ícone da aplicação
- Novo símbolo oficial do Portal Coleta de Relatos em preto e amarelo.
- Ícone atualizado no login e na navegação interna.
- Favicon/ícone da aba do navegador atualizado.
- Apple touch icon atualizado para atalhos em dispositivos compatíveis.
- Nenhuma regra de acesso, agenda, VTCall ou Firebase foi alterada nesta versão.


## V1.39.5 — Agenda controlada por disponibilidade
- Nova área **Disponibilidade da agenda** para liberar ou fechar dias.
- Desenvolvedor e Administradores gerenciam a disponibilidade automaticamente.
- Usuários de Eventos/Administrativo podem receber a permissão específica **Pode liberar dias da agenda**.
- Atendentes só conseguem criar novas coletas em dias previamente liberados.
- O Desenvolvedor mantém override de data.
- Fechar um dia com coletas existentes exige confirmação e não apaga os registros existentes.
- Alterações de agendamentos já existentes continuam permitidas quando a data não muda, mesmo se o dia tiver sido fechado depois.
- Segurança reforçada nas regras do Firestore para impedir criação/mudança de data para dias não liberados.


## V1.39.6 — Auditoria, disponibilidade e exportação VTCall
- Logs passam a ser gravados e consultados pelo backend com Firebase Admin, sem depender de permissão direta do navegador na coleção `auditLogs`.
- A tela de Logs agora diferencia carregamento, vazio e erro, além de possuir atualização manual.
- Login, logout e criação/edição/exclusão de agendamentos entram na trilha de auditoria pelo backend.
- Liberação e fechamento de dias passam pela API protegida do portal, corrigindo o erro `Missing or insufficient permissions` mesmo quando a regra antiga do Firestore ainda está publicada.
- A permissão `Pode liberar dias da agenda` é validada no servidor; Desenvolvedor e Administrador continuam autorizados automaticamente.
- Disponibilidade da agenda é carregada pelo backend e atualizada periodicamente para todos os usuários.
- Histórico de tentativas de ligação ganhou botão `Exportar`, gerando CSV compatível com Excel com todas as tentativas carregadas do agendamento.


## V1.39.7 - Disponibilidade por horário, PDF e preparação SGA
- A disponibilidade deixa de ser apenas por dia: agora pode ser definida por responsável e faixa de horário.
- O Atendimento só consegue criar/mover coletas para horários liberados para o responsável escolhido.
- A criação/edição/exclusão de agendamentos passou para API protegida no backend; isso permite validar a disponibilidade também no servidor.
- A tela de disponibilidade alerta quando uma alteração deixará coletas já existentes fora dos períodos publicados.
- Histórico de ligações ganhou exportação em PDF, além do CSV.
- Novo módulo SGA para Desenvolvedor/Administrador, inicialmente somente leitura/teste.
- O módulo SGA testa autenticação, lista Departamentos/Status/Tipos com seus códigos e consulta evento por placa.
- Variáveis novas de servidor: SGA_BASE_URL, SGA_INTEGRATION_TOKEN, SGA_API_USER e SGA_API_PASSWORD.
- Nenhuma credencial SGA é gravada no frontend ou no repositório.
- Nesta versão o Portal ainda NÃO cria histórico nem envia PDF ao SGA. Essa etapa será ativada somente depois de validar a chave e os códigos corretos do SGA.

### Importante ao publicar
Como as gravações de agendamento agora passam pelo backend, publique também o `firestore.rules` desta versão.
Na Vercel, configure as variáveis SGA apenas no ambiente Production. A senha e o token nunca devem usar prefixo `NEXT_PUBLIC_`.


## V1.39.9 - Envio operacional ao SGA
- O módulo SGA passou a testar também Situações de Evento e Tipos de Foto/Documento.
- A consulta de evento por placa agora exibe também o código do veículo, necessário para anexar documentos ao Evento.
- O modal do agendamento ganhou a área **Enviar coleta ao SGA**.
- O operador consulta os eventos da placa, confirma explicitamente o protocolo correto e escolhe a classificação do documento.
- O PDF do histórico de ligações pode ser enviado diretamente ao Evento pelo endpoint `veiculo/foto/cadastrar`.
- O PDF e o upload incluem a **Observação para o SGA** preenchida pelo operador.
- A observação também possui botão de cópia, pois a API v2 documentada não expõe um método de escrita para o campo `descricao_evento_area` / “Descrição Evento do Veículo (Controle Interno)”.
- O envio é validado novamente no backend: evento e veículo precisam continuar vinculados à placa do agendamento.
- O Portal bloqueia repetição acidental do mesmo PDF quando evento, classificação, última tentativa e observação não mudaram.
- Envios ao SGA entram nos Logs com a ação `SGA_DOCUMENT_SENT`.
- O último envio confirmado fica registrado no próprio agendamento.
- Nenhuma credencial SGA é enviada ao navegador.

### Permissão adicional para o upload
Além das permissões já liberadas em Evento, Veículo e Atendimento, o SGA exige o código do tipo/classificação do arquivo. A V1.39.9 consulta `listar/tipo-foto/ativo`; se o teste indicar falta de permissão, habilite **Vistoria → listar tipo foto** no token do Portal.

### Firestore
Esta versão não adiciona novas gravações diretas pelo navegador. As informações do envio ao SGA são persistidas pelo Firebase Admin no backend, portanto não há uma nova regra de Firestore específica para o SGA nesta versão.


## V1.39.10 — Resolução de veículo antes do evento
- A placa é normalizada sem hífen/caracteres especiais antes da integração com o SGA.
- O Portal tenta localizar o veículo pela placa e depois consulta o evento pelo código interno do veículo.
- A consulta direta de evento pela placa permanece como fallback.

## V1.39.11 — Validação estrita de placa
- O Portal nunca usa o primeiro veículo/evento retornado quando não houver correspondência exata da placa.
- Respostas de outras placas são descartadas antes de aparecer na interface ou serem usadas no envio de documentos.
- O envio ao SGA reutiliza a mesma validação estrita.

## V1.39.13 — Fallback automático pela listagem geral de eventos
- Mantém a busca estrita por veículo e a consulta específica `listar/evento-veiculo`.
- Se o endpoint específico do SGA responder de forma inconsistente, o Portal consulta automaticamente `POST listar/evento` em janelas de até 30 dias e filtra localmente somente a placa exata.
- O fallback pesquisa automaticamente eventos recentes sem pedir protocolo ao operador.
- Retornos do endpoint geral são normalizados para o mesmo formato usado no Portal, inclusive quando placa, veículo e associado vêm em objetos internos.
- O envio de PDF foi ajustado para validar diretamente placa + código do veículo do evento selecionado, inclusive quando o evento foi encontrado pelo fallback geral.
- Nenhuma nova variável de ambiente ou regra de Firestore é necessária nesta versão.


## V1.39.13 — busca histórica robusta de eventos SGA

- A data de referência da busca SGA passa a vir do navegador do usuário, evitando divergência do relógio do runtime da Vercel.
- O fallback geral pesquisa automaticamente em janelas consecutivas de até 30 dias, sem lacunas, até a data de contrato/cadastro do veículo.
- Cada janela percorre a paginação do endpoint `listar/evento` antes de avançar para o período anterior.
- A correspondência continua estrita: somente eventos cuja placa normalizada seja exatamente a placa consultada são aceitos.
- A mesma data de referência é usada na revalidação feita imediatamente antes do envio do PDF ao SGA.
- O diagnóstico exibe data de referência, data de contrato e quantidade de janelas pesquisadas.


## V1.39.14 — diagnóstico técnico da listagem de eventos SGA

- Mantém integralmente a busca histórica e a validação estrita de placa da V1.39.13.
- O teste de conexão agora valida também o endpoint **Evento → Listar**, ajudando a identificar permissão faltante no token ou no usuário exclusivo da API.
- Em consultas feitas pela conta Desenvolvedor, o backend registra um diagnóstico sanitizado de cada página retornada pelo `POST listar/evento`: janela, quantidade de registros, formato da resposta, paginação, chaves disponíveis, caminhos que contêm placa e códigos de veículo observados.
- Placas de terceiros são mascaradas no diagnóstico; a placa pesquisada permanece visível apenas quando houver correspondência exata.
- O diagnóstico técnico não é enviado para Administrador, Atendente ou Consulta.
- Nenhuma regra de segurança foi relaxada e nenhum evento é aceito por aproximação: o upload continua bloqueado sem correspondência confirmada da placa.


## V1.39.15 — busca adaptativa e erro HTTP real do SGA

- O fallback de `POST listar/evento` deixa de solicitar 500 registros e passa a começar em 100, limite padrão documentado para a listagem de eventos.
- Se o SGA rejeitar a requisição, o Portal reduz automaticamente a paginação (`100 → 50 → 25 → 10`) e, se necessário, a janela (`30 → 15 → 7 → 1 dia`) sem pedir protocolo ou qualquer ação manual ao operador.
- Uma tentativa que falhar no meio da paginação é descartada e refeita do início com parâmetros menores, evitando misturar retorno parcial com dados válidos.
- O diagnóstico exclusivo do Desenvolvedor passa a registrar HTTP, mensagem retornada pelo SGA, janela, tamanho de página e página exata de cada tentativa recusada.
- O teste de conexão compara uma chamada mínima (1 registro) com uma chamada de 100 registros para separar permissão de limitação operacional do endpoint.
- Depois que uma combinação é aceita pelo SGA, ela é reutilizada nas janelas históricas seguintes até a data de contrato/cadastro do veículo.
- A validação estrita de placa permanece inalterada: nenhum evento de outra placa pode ser selecionado ou receber PDF.
- Nenhuma nova ENV ou regra de Firestore é necessária.


## V1.39.16 — busca segmentada e diagnóstico de etapa

- A busca histórica do SGA passa a ser executada em blocos curtos, evitando que uma única requisição longa estoure o tempo do backend da Vercel.
- O usuário continua clicando apenas uma vez: o navegador avança automaticamente pelos blocos históricos até localizar o evento ou chegar à data de contrato do veículo.
- A varredura geral só começa depois que o veículo exato da placa foi localizado; sem veículo confiável, o Portal encerra com diagnóstico controlado em vez de pesquisar anos de histórico.
- Cada bloco possui orçamento de tempo e de chamadas ao SGA. Falhas isoladas são registradas e não derrubam a consulta inteira.
- O diagnóstico do Desenvolvedor mostra blocos automáticos, quantidade de chamadas, tempo acumulado, motivo da última parada, HTTP e etapa/endpoint que falhou.
- A tela de agendamento usa a mesma continuação automática ao carregar os eventos da placa.
- No envio do PDF, quando o Portal já conhece o protocolo do evento selecionado, a revalidação é feita diretamente pelo protocolo no backend, sem exigir que o operador digite ou pesquise protocolo no SGA.
- A validação final continua estrita: protocolo, código do evento, código do veículo e placa precisam continuar correspondendo antes do upload.
- Nenhuma nova variável de ambiente ou regra de Firestore é necessária.



## V1.39.18 — consulta direta de evento com máscara de placa antiga

- Placas no padrão antigo `ABC1234` passam a ser consultadas primeiro como `ABC-1234` no endpoint `listar/evento-veiculo`, conforme o formato documentado pela API de Evento da Hinova.
- Se a tentativa com hífen não localizar correspondência exata, o Portal tenta novamente a forma normalizada sem hífen antes de iniciar a busca histórica.
- Placas Mercosul continuam sendo consultadas no formato normalizado, sem criar máscara incorreta.
- Todos os retornos continuam sujeitos à validação estrita da placa normalizada antes de serem aceitos.
- O diagnóstico informa qual variação da placa foi chamada e mantém placas divergentes descartadas.
- Corrigida a mensagem visual que podia indicar “evento confirmado diretamente pela placa” após uma busca histórica terminar sem evento.

## V1.39.17 — correção de build TypeScript

- `getToken()` agora retorna `Promise<string>` de forma estrita e lança erro de sessão quando o usuário não está disponível.
- Corrige o erro TS2345 em `AppointmentModal.tsx` sem alterar a lógica da integração SGA da V1.39.16.
