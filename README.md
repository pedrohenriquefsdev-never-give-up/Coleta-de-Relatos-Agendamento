# Agenda GPV — V1

Web app de agendamento com calendário, usuários internos, logs de auditoria e foto de perfil via ImageKit.

## Stack
- Next.js 16 / React 19
- Vercel
- Firebase Authentication
- Cloud Firestore
- Firebase Admin SDK nas rotas de servidor
- ImageKit para fotos de perfil

## O que já existe nesta V1
- Login por e-mail + CPF como senha
- Perfis: `admin`, `atendente`, `consulta`
- Agenda semanal com cards
- Criar e editar agendamentos
- Campos: placa, nome, telefone, e-mail, data, horário, duração, status e observações
- Busca por placa, nome ou telefone
- Status: agendado, confirmado, atendido, cancelado e não compareceu
- Painel de usuários
- Criar usuário com CPF como senha
- Bloquear/reativar usuário
- Logs de auditoria
- Upload de foto para ImageKit
- Estrutura preparada para guardar `call.callId` do VTCall futuramente

## 1. Criar projeto Firebase
Ative **Authentication > Email/Password** e crie um banco **Cloud Firestore**.

Copie a configuração Web do Firebase para as variáveis `NEXT_PUBLIC_FIREBASE_*` do `.env.local`.

## 2. Firebase Admin
No Firebase Console, gere uma chave de conta de serviço e preencha:

```env
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Nunca exponha a private key em variável `NEXT_PUBLIC_`.

## 3. ImageKit
Crie a conta/projeto e configure:

```env
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/SEU_ID
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=
```

A private key é usada somente em `/api/imagekit-auth`.

## 4. Regras do Firestore
Publique o conteúdo de `firestore.rules` no Firebase Console.

## 5. Instalação

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 6. Criar o primeiro administrador
O painel só permite que um administrador crie outros usuários. Para inicializar o primeiro:

```bash
npm run bootstrap-admin
```

O script pede nome, e-mail e CPF.

## 7. Deploy na Vercel
Suba o repositório no GitHub e importe na Vercel. Cadastre todas as variáveis do `.env.example` em **Settings > Environment Variables**.

## Estrutura Firestore

```text
users/{uid}
appointments/{appointmentId}
auditLogs/{logId}
settings/{settingId}
```

### Appointment

```json
{
  "plate": "ABC1D23",
  "fullName": "Nome Completo",
  "phone": "81999999999",
  "email": "cliente@email.com",
  "date": "2026-10-07",
  "time": "14:30",
  "durationMinutes": 30,
  "status": "agendado",
  "notes": "",
  "call": {
    "provider": "vtcall",
    "callId": "futuro"
  }
}
```

## Próximas versões sugeridas
- Configuração visual de dias/horários disponíveis
- Bloqueios/feriados
- Prevenção transacional de choque de horário
- Integração Google Calendar
- Integração VTCall
- Histórico detalhado por placa/cliente
- Dashboard de indicadores
- Notificações e confirmação de agendamento
