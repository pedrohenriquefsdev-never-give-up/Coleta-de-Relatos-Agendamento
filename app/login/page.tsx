"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, CalendarClock, LockKeyhole, Mail, ShieldCheck, UsersRound } from "lucide-react";
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
    <div className="login-card upgraded gpv">
      <div className="login-card-head gpv">
        <div className="login-head-copy">
          <div className="login-kicker">ACESSO INTERNO</div>
          <h2>Entrar no portal</h2>
          <p>Use seu e-mail cadastrado e o CPF para acessar o ambiente interno.</p>
        </div>
        <div className="login-plate-right">
          <Plate value="GPV Associados" wide />
        </div>
      </div>

      <div className="login-tip gpv">
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
          <UsersRound size={16} />
          <span>Atendimento e operação conectados</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <section className="login-visual upgraded gpv-visual">
        <img src="/assets/gpv-symbol.png" alt="Símbolo GPV" className="bg-logo watermark-one" />
        <img src="/assets/gpv-truck.png" alt="GPV Truck" className="bg-logo watermark-two" />
        <img src="/assets/app-symbol.png" alt="Símbolo do aplicativo" className="bg-logo watermark-symbol" />

        <div className="login-brand gpv-brand">
          <span className="brand-mark image-mark"><img src="/assets/app-symbol.png" alt="Ícone do aplicativo" /></span>
          <div>
            <strong>Portal Coleta de Relatos</strong>
            <small>Operação e atendimento</small>
          </div>
        </div>

        <div className="login-art upgraded gpv-art">
          <div className="login-copy">
            <span>GESTÃO INTERNA</span>
            <h1>Agendamentos, relatos e atendimento com mais clareza operacional.</h1>
            <p>Uma visão interna para acompanhar contatos, veículos e registros com uma identidade conectada à GPV Associados.</p>
            <div className="login-bullets gpv-bullets">
              <div><UsersRound size={16} /><span>Equipe, operação e atendimento integrados</span></div>
              <div><CalendarClock size={16} /><span>Agenda semanal organizada para a rotina</span></div>
              <div><ShieldCheck size={16} /><span>Ambiente interno estruturado para controle</span></div>
            </div>
          </div>

          <div className="login-graphic-board">
            <div className="login-graphic-surface">
              <div className="board-topline">
                <span>VISÃO TÉCNICA</span>
                <span>GPV ASSOCIADOS</span>
              </div>
              <div className="tech-lines" />
              <img src="/assets/tech-car.png" alt="Diagrama técnico do carro" className="tech-car-art" />
              <div className="graphic-badge badge-one">
                <img src="/assets/app-symbol.png" alt="Símbolo do aplicativo" />
                <span>Operação conectada</span>
              </div>
              <div className="graphic-badge badge-two">
                <img src="/assets/gpv-symbol.png" alt="Símbolo GPV" />
                <span>Identidade GPV</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-footer">
          <span>Portal Coleta de Relatos</span>
          <span>Uso interno</span>
        </div>
      </section>

      <section className="login-panel upgraded gpv-panel">
        <div className="login-panel-wrap">
          <div className="login-panel-brand">
            <img src="/assets/gpv-logo-yellow.jpg" alt="GPV Associados" />
          </div>
          <Suspense fallback={<div className="spinner" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
