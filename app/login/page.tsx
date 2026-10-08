"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, CalendarClock, CarFront } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { auth } from "@/lib/firebase";
import Plate from "@/components/Plate";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), cpf.replace(/\D/g, ""));
      router.replace("/");
    } catch {
      setError("E-mail ou CPF inválido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-card upgraded">
      <div className="login-card-head">
        <div>
          <div className="login-kicker">ACESSO INTERNO</div>
          <h2>Entrar no portal</h2>
          <p>Use seu e-mail cadastrado e o CPF para acessar o ambiente interno.</p>
        </div>
        <Plate value="BRA2E19" compact />
      </div>

      <div className="login-tip">
        <ShieldCheck size={16} />
        <span>Acesso restrito à equipe autorizada.</span>
      </div>

      {params.get("blocked") && <div className="error" style={{ marginBottom: 14 }}>Seu acesso está bloqueado. Procure um administrador.</div>}

      <form className="stack" onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>E-mail</label>
          <div className="input-icon">
            <Mail size={17} />
            <input className="input" type="email" autoComplete="username" placeholder="seuemail@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>

        <div className="field">
          <label>CPF</label>
          <div className="input-icon">
            <LockKeyhole size={17} />
            <input className="input" inputMode="numeric" autoComplete="current-password" placeholder="Somente números" value={cpf} onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))} required />
          </div>
        </div>

        <button className="btn primary login-submit" disabled={loading}>
          {loading ? "Entrando..." : <>Entrar <ArrowRight size={17} /></>}
        </button>
      </form>

      <div className="login-meta-grid">
        <div>
          <CalendarClock size={16} />
          <span>Agendamentos centralizados</span>
        </div>
        <div>
          <CarFront size={16} />
          <span>Placas e veículos em destaque</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <section className="login-visual upgraded">
        <div className="login-brand">
          <span className="brand-mark">CR</span>
          <div>
            <strong>Portal Coleta de Relatos</strong>
            <small>Operação e atendimento</small>
          </div>
        </div>

        <div className="login-art upgraded">
          <div className="login-copy">
            <span>GESTÃO INTERNA</span>
            <h1>Agendamentos, relatos e atendimento com uma visualização mais clara.</h1>
            <p>Organize a agenda, acompanhe veículos e mantenha cada etapa do contato registrada em um só lugar.</p>
            <div className="login-bullets">
              <div><ShieldCheck size={16} /><span>Acesso seguro para a equipe</span></div>
              <div><CalendarClock size={16} /><span>Agenda semanal organizada</span></div>
              <div><CarFront size={16} /><span>Visual com foco em veículos e placas</span></div>
            </div>
          </div>

          <div className="car-stage upgraded">
            <div className="car-card-shell">
              <div className="car-card-top">
                <span>VISÃO RÁPIDA</span>
                <span>PORTAL INTERNO</span>
              </div>
              <div className="car-card-main">
                <div className="car-glow" />
                <img src="/login-vehicle.png" alt="Veículo" className="login-car" />
                <div className="login-plate"><Plate value="BRA2E19" /></div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-footer">
          <span>Portal Coleta de Relatos</span>
          <span>Uso interno</span>
        </div>
      </section>

      <section className="login-panel upgraded">
        <div className="login-panel-wrap">
          <Suspense fallback={<div className="spinner" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
