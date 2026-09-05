'use client';

import { useEffect, useState } from 'react';

type RecordItem = Record<string, unknown>;

export default function CommercialPage() {
  const [data, setData] = useState<Record<string, RecordItem[]>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/data', { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o comercial.');
        setData({ opportunities: payload.data?.opportunities || [], quotes: payload.data?.quotes || [] });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar comercial.'));
  }, []);

  const list = (key: string, title: string) => <section className="group"><h2>{title}</h2>{data[key]?.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || item.nome || `${title} ${index + 1}`)}</strong><span>{String(item.status || item.stage || item.etapa || 'Sem status informado')}</span></article>)}{!error && !data[key]?.length && <p>Nenhum registro disponível.</p>}</section>;
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">COMERCIAL</p><h1>Comercial</h1><p className="intro">Oportunidades e orçamentos migrados inicialmente em modo somente leitura.</p>{error && <p className="error">{error}</p>}{list('opportunities', 'Oportunidades')}{list('quotes', 'Orçamentos')}</section><style jsx>{`.page{min-height:100vh;background:#f5f1eb;color:#262828;font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:#3b4a3a;color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.group>p{color:#66705f}.group{padding:10px 0}.group h2{font:500 23px Georgia,serif}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:#fff;box-shadow:0 5px 20px #26282812}.group span{font-size:12px;color:#66705f}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
