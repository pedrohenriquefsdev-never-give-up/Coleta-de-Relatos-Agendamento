"use client";

import { Check, Clipboard, Download, Eye, EyeOff, PhoneCall, Settings2 } from "lucide-react";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import Modal from "./Modal";

type Config = { configured: boolean; host: string; extension: string; password: string; port: number; transport: string };

export default function VTCallSidebarModule() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState("");

  async function load() {
    setOpen(true);
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/vtcall/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await res.json();
      setConfig(res.ok ? data : null);
    } finally { setLoading(false); }
  }

  async function copy(label: string, value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1300);
  }

  const CopyRow = ({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) => (
    <div className="vt-copy-row">
      <div><small>{label}</small><strong>{secret && !showPassword ? "••••••••••••" : value || "Não configurado"}</strong></div>
      <div className="vt-copy-actions">
        {secret && <button className="icon-btn mini" onClick={() => setShowPassword(v => !v)} title={showPassword ? "Ocultar" : "Mostrar"}>{showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}</button>}
        <button className="icon-btn mini" onClick={() => copy(label, value)} disabled={!value} title="Copiar">{copied === label ? <Check size={14}/> : <Clipboard size={14}/>}</button>
      </div>
    </div>
  );

  return <>
    <div className="vt-sidebar-module">
      <div className="vt-sidebar-head"><span><PhoneCall size={16}/></span><div><strong>VTCall</strong><small>Aplicativo de ligações</small></div></div>
      <div className="vt-sidebar-actions">
        <a className="vt-sidebar-btn primary" href="/downloads/VTCALL.exe" download><Download size={14}/> Baixar</a>
        <button className="vt-sidebar-btn" onClick={load}><Settings2 size={14}/> Configurar</button>
      </div>
    </div>

    {open && <Modal title="Instalar e configurar o VTCall" onClose={() => setOpen(false)} footer={<button className="btn primary" onClick={() => setOpen(false)}>Concluir</button>}>
      <div className="stack vt-setup-modal">
        <div className="vt-download-banner"><div><PhoneCall size={22}/><span><strong>VTCall para Windows</strong><small>Baixe o executável disponibilizado pela equipe.</small></span></div><a className="btn primary" href="/downloads/VTCALL.exe" download><Download size={15}/> Baixar VTCall</a></div>

        <div className="vt-steps">
          <div><b>1</b><span>Baixe e abra o <strong>VTCALL.exe</strong>.</span></div>
          <div><b>2</b><span>Na janela <strong>Account</strong>, copie os dados abaixo nos campos correspondentes.</span></div>
          <div><b>3</b><span>Mantenha <strong>Remember Details</strong> marcado e clique em <strong>Connect</strong>.</span></div>
          <div><b>4</b><span>Com o ramal conectado, volte ao portal e utilize o botão de ligação no agendamento.</span></div>
        </div>

        <div className="vt-credentials-box">
          <div className="vt-credentials-title"><Settings2 size={16}/><div><strong>Seus dados de conexão</strong><small>Use os botões para copiar e colar no VTCall.</small></div></div>
          {loading ? <div className="empty">Carregando configuração...</div> : config?.configured ? <>
            <CopyRow label="Host" value={config.host}/>
            <CopyRow label="Extension" value={config.extension}/>
            <CopyRow label="Password" value={config.password} secret/>
            <CopyRow label="Port" value={String(config.port)}/>
            <CopyRow label="Transport" value={config.transport}/>
          </> : <div className="info-note">Seu VTCall ainda não foi configurado pelo administrador. Solicite o cadastro do seu ramal.</div>}
        </div>
      </div>
    </Modal>}
  </>;
}
