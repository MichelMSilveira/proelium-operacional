'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Profile = Record<string, unknown>;
export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ company?: Profile }>('/api/company/profile').then((payload) => setProfile(payload.company || null)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar empresa.')); }, []);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">CONFIGURAÇÕES</p><h1>Empresa</h1><p className="intro">Identidade e situação da empresa autenticada.</p>{error && <p className="error">{error}</p>}{profile && <div className="card"><strong>{String(profile.name || profile.companyName || 'Empresa')}</strong><span>Responsável: {String(profile.responsible || 'Não informado')}</span><span>Telefone: {String(profile.phone || 'Não informado')}</span><span>Status: {String(profile.status || 'Não informado')}</span><span>Licença: {String(profile.licenseStatus || 'Não informado')}</span></div>}{!error && !profile && <p>Empresa não disponível para esta sessão.</p>}</section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro{color:var(--proelium-muted)}.card{display:grid;gap:12px;margin-top:28px;padding:24px;border-radius:12px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.card strong{font:500 24px Georgia,serif;color:var(--proelium-olive)}.card span{font-size:13px;color:var(--proelium-muted)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
