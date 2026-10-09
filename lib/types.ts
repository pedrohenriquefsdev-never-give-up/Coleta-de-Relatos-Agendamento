export type UserRole = "desenvolvedor" | "admin" | "atendente" | "consulta";
export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "em_contato"
  | "nao_atendeu"
  | "reagendar"
  | "concluido"
  | "atendido"
  | "cancelado"
  | "nao_compareceu";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  photoUrl?: string;
  department?: string;
  vtcallConfigured?: boolean;
  vtcallExtension?: string;
  cpfLast4?: string;
  createdAt?: unknown;
  lastAccessAt?: unknown;
}

export interface Appointment {
  id: string;
  plate: string;
  fullName: string;
  phone: string;
  phoneDigits?: string;
  email: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedDepartment?: string;
  createdBy: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  call?: {
    provider?: "vtcall";
    callId?: string;
    status?: string;
    duration?: number;
    recordingUrl?: string;
    startedAt?: unknown;
    endedAt?: unknown;
    requestedAt?: unknown;
    lastAttemptId?: string;
    extension?: string;
    phone?: string;
    preExistingCall?: boolean;
    showpeerBefore?: {
      ok?: boolean;
      status?: number | null;
      active?: boolean;
      count?: number;
    };
    showpeerAfter?: {
      ok?: boolean;
      status?: number | null;
      active?: boolean;
      count?: number;
    };
  };
}
