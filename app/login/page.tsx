"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { auth } from "@/lib/firebase";

function LoginForm(){
  const router = useRouter();
  const params = useSearchParams();
  const [email,setEmail]=useState(""); const [cpf,setCpf]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setError("");setLoading(true);try{await signInWithEmailAndPassword(auth,email.trim(),cpf.replace(/\D/g,""));router.replace("/");}catch{setError("E-mail ou CPF inválido.");}finally{setLoading(false)}}
  return <div className="login-card"><h2>Acesso interno</h2><p>Entre com seu e-mail corporativo e CPF.</p>{params.get("blocked") && <div className="error" style={{marginBottom:14}}>Seu acesso está bloqueado. Procure um administrador.</div>}<form className="stack" onSubmit={submit}>{error&&<div className="error">{error}</div>}<div className="field"><label>E-mail</label><input className="input" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field"><label>CPF</label><input className="input" inputMode="numeric" autoComplete="current-password" value={cpf} onChange={e=>setCpf(e.target.value.replace(/\D/g,"").slice(0,11))} required/></div><button className="btn primary" disabled={loading}>{loading?"Entrando...":"Entrar"}</button></form></div>
}
export default function LoginPage(){return <div className="login-page"><section className="login-visual"><div className="brand"><span className="brand-mark">A</span> Agenda GPV</div><div><h1>Agendamentos organizados. Atendimento mais simples.</h1><p>Calendário, equipe, histórico e auditoria em um único lugar.</p></div><small>Uso interno • GPV Associados</small></section><section className="login-panel"><Suspense fallback={<div className="spinner"/>}><LoginForm/></Suspense></section></div>}
