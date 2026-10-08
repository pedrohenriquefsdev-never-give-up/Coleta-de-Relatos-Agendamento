export type UserRole = "admin" | "atendente" | "consulta";
export type AppointmentStatus = "agendado" | "confirmado" | "atendido" | "cancelado" | "nao_compareceu";

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
  };
}
