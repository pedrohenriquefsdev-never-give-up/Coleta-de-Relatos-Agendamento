"use client";

import { Check, Clipboard, Download, Eye, EyeOff, PhoneCall, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

type Config = {
  configured: boolean;
  host: string;
  extension: string;
  password: string;
  port: number;
  transport: string;
};

export default function VTCallPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/vtcall/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (active) setConfig(res.ok ? data : null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function copy(label: string, value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1300);
  }

  const CopyRow = ({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) => (
    <div className="vt-page-copy-row">
      <div className="vt-page-copy-value">
        <small>{label}</small>
        <strong>{secret && !showPassword ? "••••••••••••" : value || "Não configurado"}</strong>
      </div>
      <div className="vt-page-copy-actions">
        {secret && (
          <button className="icon-btn mini" onClick={() => setShowPassword((v) => !v)} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        <button className="icon-btn mini" onClick={() => copy(label, value)} disabled={!value} title="Copiar">
          {copied === label ? <Check size={15} /> : <Clipboard size={15} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="vt-page stack">
      <div className="vt-page-hero">
        <div>
          <span className="eyebrow">TELEFONIA</span>
          <h2>VTCall</h2>
          <p>Instale o aplicativo e configure o seu ramal com os dados cadastrados no portal.</p>
        </div>
        <a className="btn primary vt-page-download" href="/downloads/VTCALL.exe" download>
          <Download size={16} /> Baixar VTCall
        </a>
      </div>

      <div className="vt-page-main-grid">
        <section className="vt-page-guide-card">
          <div className="vt-page-section-head">
            <div className="vt-page-icon"><PhoneCall size={18} /></div>
            <div>
              <h3>Onde configurar</h3>
              <p>No VTCall, abra o menu e escolha <strong>Edit Account</strong>. Depois preencha os campos da janela <strong>Account</strong>.</p>
            </div>
          </div>
          <div className="vt-page-guide-image-wrap">
            <img src="/assets/vtcall/vtcall-config-guide.png" alt="VTCall mostrando Edit Account e os campos de configuração do ramal" />
          </div>
          <div className="vt-page-caption">O print foi recortado para mostrar somente as áreas necessárias da configuração.</div>
        </section>

        <section className="vt-page-credentials-card">
          <div className="vt-page-section-head">
            <div className="vt-page-icon"><ShieldCheck size={18} /></div>
            <div>
              <h3>Dados do seu ramal</h3>
              <p>Copie cada informação e cole no campo correspondente do VTCall.</p>
            </div>
          </div>

          {loading ? (
            <div className="empty">Carregando dados do seu ramal...</div>
          ) : config?.configured ? (
            <div className="vt-page-copy-list">
              <CopyRow label="Host" value={config.host} />
              <CopyRow label="Extension / Ramal" value={config.extension} />
              <CopyRow label="Password" value={config.password} secret />
              <CopyRow label="Port" value={String(config.port)} />
              <CopyRow label="Transport" value={config.transport} />
            </div>
          ) : (
            <div className="info-note">
              Seu ramal ainda não foi configurado pelo administrador. Assim que os dados forem cadastrados no seu usuário, eles aparecerão aqui automaticamente.
            </div>
          )}
        </section>
      </div>

      <section className="vt-page-steps-card">
        <div className="vt-page-section-head compact">
          <div className="vt-page-icon"><PhoneCall size={18} /></div>
          <div>
            <h3>Passo a passo rápido</h3>
            <p>Depois de conectado, mantenha o VTCall aberto no computador durante o atendimento.</p>
          </div>
        </div>
        <div className="vt-page-steps">
          <div><b>1</b><span>Baixe e abra o <strong>VTCALL.exe</strong>.</span></div>
          <div><b>2</b><span>No menu do aplicativo, acesse <strong>Edit Account</strong>.</span></div>
          <div><b>3</b><span>Copie os dados do seu ramal exibidos nesta página.</span></div>
          <div><b>4</b><span>Mantenha <strong>Remember Details</strong> marcado e clique em <strong>Connect</strong>.</span></div>
          <div><b>5</b><span>Com o ramal online, volte aos agendamentos e use o botão de ligação no telefone do associado.</span></div>
        </div>
      </section>
    </div>
  );
}
