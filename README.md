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
