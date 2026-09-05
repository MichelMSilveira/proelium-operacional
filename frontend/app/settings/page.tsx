'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Profile = Record<string, unknown>;
export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ company?: Profile }>('/api/company/profile').then((payload) => setProfile(payload.company || null)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar empresa.')); }, []);
  return <ModuleLayout eyebrow="CONFIGURAÇÕES" title="Empresa" description="Identidade e situação da empresa autenticada.">{error && <p className="error">{error}</p>}{profile && <div className="profile"><strong>{String(profile.name || profile.companyName || 'Empresa')}</strong><span>Responsável: {String(profile.responsible || 'Não informado')}</span><span>Telefone: {String(profile.phone || 'Não informado')}</span><span>Status: {String(profile.status || 'Não informado')}</span><span>Licença: {String(profile.licenseStatus || 'Não informado')}</span></div>}{!error && !profile && <p>Empresa não disponível para esta sessão.</p>}<style jsx>{`.profile{display:grid;gap:12px;margin-top:28px;padding:24px;border-radius:12px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.profile strong{font:500 24px Georgia,serif;color:var(--proelium-olive)}.profile span{font-size:13px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
