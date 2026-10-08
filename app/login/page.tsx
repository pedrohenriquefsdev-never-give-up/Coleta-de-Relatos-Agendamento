"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, CalendarClock, FileText, LockKeyhole, Mail, ShieldCheck, UsersRound } from "lucide-react";
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
    <div className="login-card minimal gpv-clean">
      <div className="login-card-topline">
        <div>
          <div className="login-kicker">ACESSO INTERNO</div>
          <h2>Entrar no portal</h2>
        </div>
        <Plate value="GPV Associados" wide />
      </div>

      <p className="login-intro">Use seu e-mail cadastrado e o CPF para acessar o ambiente interno.</p>

      <div className="login-tip clean">
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

      <div className="login-mini-features">
        <div><CalendarClock size={16} /> <span>Agenda organizada</span></div>
        <div><UsersRound size={16} /> <span>Operação integrada</span></div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page clean-layout v15-layout">
      <section className="login-visual v15-visual">
        <div className="v15-grid" />
        <div className="v15-glow glow-a" />
        <div className="v15-glow glow-b" />
        <div className="v15-orbit orbit-a" />
        <div className="v15-orbit orbit-b" />

        <div className="login-brand clean-brand v15-brand">
          <span className="brand-mark image-mark"><img src="/assets/app-symbol.png" alt="Ícone do aplicativo" /></span>
          <div>
            <strong>Portal Coleta de Relatos</strong>
            <small>Operação e atendimento</small>
          </div>
        </div>

        <div className="v15-copy-block">
          <span className="clean-eyebrow">GESTÃO INTERNA</span>
          <h1>Controle interno com mais clareza.</h1>
          <p>Agendamentos, contatos e registros reunidos em um só portal.</p>
        </div>

        <div className="v16-microcards" aria-hidden="true">
          <div className="v16-microcard card-a">
            <span className="micro-icon"><CalendarClock size={16} /></span>
            <div>
              <strong>Agendamentos</strong>
              <small>Organize e acompanhe a agenda interna.</small>
            </div>
          </div>
          <div className="v16-microcard card-b">
            <span className="micro-icon"><FileText size={16} /></span>
            <div>
              <strong>Relatos</strong>
              <small>Registre e consulte informações com agilidade.</small>
            </div>
          </div>
          <div className="v16-microcard card-c">
            <span className="micro-icon"><UsersRound size={16} /></span>
            <div>
              <strong>Operação</strong>
              <small>Equipe conectada para uma rotina mais clara.</small>
            </div>
          </div>
        </div>

        <div className="v15-feature-stack">
          <div><UsersRound size={16} /><span>Equipe, operação e atendimento conectados</span></div>
          <div><CalendarClock size={16} /><span>Visão organizada da agenda interna</span></div>
          <div><ShieldCheck size={16} /><span>Ambiente interno com acesso controlado</span></div>
        </div>

        <div className="login-footer clean-footer v15-footer">
          <span>Portal Coleta de Relatos</span>
          <span>Uso interno</span>
        </div>
      </section>

      <section className="login-panel clean-panel v15-panel">
        <div className="login-panel-wrap clean-wrap">
          <Suspense fallback={<div className="spinner" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
