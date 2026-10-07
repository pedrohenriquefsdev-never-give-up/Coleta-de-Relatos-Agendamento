"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { auth } from "@/lib/firebase";
import Plate from "@/components/Plate";

function LoginForm(){
  const router = useRouter();
  const params = useSearchParams();
  const [email,setEmail]=useState(""); const [cpf,setCpf]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setError("");setLoading(true);try{await signInWithEmailAndPassword(auth,email.trim(),cpf.replace(/\D/g,""));router.replace("/");}catch{setError("E-mail ou CPF inválido.");}finally{setLoading(false)}}
  return <div className="login-card">
    <div className="login-kicker">ACESSO INTERNO</div>
    <h2>Bem-vindo ao portal</h2>
    <p>Use seu e-mail cadastrado e CPF para acessar.</p>
    {params.get("blocked") && <div className="error" style={{marginBottom:14}}>Seu acesso está bloqueado. Procure um administrador.</div>}
    <form className="stack" onSubmit={submit}>
      {error&&<div className="error">{error}</div>}
      <div className="field"><label>E-mail</label><div className="input-icon"><Mail size={17}/><input className="input" type="email" autoComplete="username" placeholder="seuemail@empresa.com" value={email} onChange={e=>setEmail(e.target.value)} required/></div></div>
      <div className="field"><label>CPF</label><div className="input-icon"><LockKeyhole size={17}/><input className="input" inputMode="numeric" autoComplete="current-password" placeholder="Somente números" value={cpf} onChange={e=>setCpf(e.target.value.replace(/\D/g,"").slice(0,11))} required/></div></div>
      <button className="btn primary login-submit" disabled={loading}>{loading?"Entrando...":<>Entrar <ArrowRight size={17}/></>}</button>
    </form>
    <small className="login-help">Acesso restrito à equipe autorizada.</small>
  </div>
}

export default function LoginPage(){return <div className="login-page">
  <section className="login-visual">
    <div className="login-brand"><span className="brand-mark">CR</span><div><strong>Portal Coleta de Relatos</strong><small>Operação e atendimento</small></div></div>
    <div className="login-art">
      <div className="login-copy"><span>GESTÃO INTERNA</span><h1>Agendamentos, relatos e atendimento em um só lugar.</h1><p>Uma visão rápida da agenda, dos veículos e de cada etapa do contato com o associado.</p></div>
      <div className="car-stage"><div className="car-glow"/><img src="/login-vehicle.png" alt="Veículo" className="login-car"/><div className="login-plate"><Plate value="BRA2E19"/></div></div>
    </div>
    <div className="login-footer"><span>Portal Coleta de Relatos</span><span>Uso interno</span></div>
  </section>
  <section className="login-panel"><Suspense fallback={<div className="spinner"/>}><LoginForm/></Suspense></section>
</div>}
