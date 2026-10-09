# Portal Coleta de Relatos — V1.39.4

Portal interno para agenda, gestão de acessos, auditoria e futura integração com VTCall.

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
