'use client';

import { useEffect, useMemo, useState } from 'react';

type Entry = Record<string, unknown>;

export default function FinancePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/data', { credentials: 'include' }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o financeiro.');
      setEntries(Array.isArray(payload.data?.financialEntries) ? payload.data.financialEntries : []);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar financeiro.'));
  }, []);
  const total = useMemo(() => entries.reduce((sum, item) => sum + Number(item.amount || item.value || item.valor || 0), 0), [entries]);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">FINANCEIRO</p><h1>Financeiro</h1><p className="intro">Lançamentos autorizados e total calculado localmente, em modo somente leitura.</p>{error && <p className="error">{error}</p>}<div className="total"><span>Total dos lançamentos</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div className="list">{entries.map((entry, index) => <article key={String(entry.id || index)}><strong>{String(entry.description || entry.name || entry.nome || `Lançamento ${index + 1}`)}</strong><span>{String(entry.type || entry.category || entry.categoria || 'Sem categoria')} · {Number(entry.amount || entry.value || entry.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></article>)}{!error && entries.length === 0 && <p>Nenhum lançamento disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:#f5f1eb;color:#262828;font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:#3b4a3a;color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:#66705f}.total{display:flex;justify-content:space-between;align-items:center;margin:28px 0;padding:20px;border-radius:10px;background:#fff;box-shadow:0 5px 20px #26282812}.total span{color:#66705f}.total strong{font-size:24px;color:#3b4a3a}.list{display:grid;gap:10px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:#fff;box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:#66705f}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
