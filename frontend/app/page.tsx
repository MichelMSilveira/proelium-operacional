'use client';

import { FormEvent, useEffect, useState } from 'react';

type User = { name?: string; username?: string; email?: string };

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [master, setMaster] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setUser(payload?.user || null))
      .catch(() => setError('Não foi possível conectar ao servidor.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || 'Não foi possível entrar.'); return; }
    setUser(payload.user);
  }

  if (loading) return <main className="auth-page"><section className="card">Carregando…</section></main>;
  if (user) return <main className="auth-page"><section className="card"><p className="eyebrow">PROELIUM OPERACIONAL</p><h1>Olá, {user.name || user.username}</h1><p>Você já está autenticado.</p></section></main>;
  return (
    <main className="auth-page"><section className="card">
      <p className="eyebrow">PROELIUM OPERACIONAL</p><h1>{master ? 'Acesso mestre da plataforma' : 'Entrar no sistema'}</h1>
      <p>{master ? 'Use o usuário mestre para administrar a plataforma.' : 'Entre com sua conta Google para acessar o sistema.'}</p>
      {error && <p className="error">{error}</p>}
      {!master ? <a className="google" href="/api/auth/google">Entrar com Google</a> : <form onSubmit={submit}>
        <label>Usuário<input name="username" required autoComplete="username" /></label>
        <label>Senha<input name="password" type="password" required autoComplete="current-password" /></label>
        <button type="submit">Entrar na plataforma</button>
      </form>}
      <button className="secondary" onClick={() => { setMaster(!master); setError(''); }}>{master ? 'Voltar para login Google' : 'Acesso mestre da plataforma'}</button>
      <style jsx>{`.auth-page{min-height:100vh;display:grid;place-items:center;background:#e6dfd6;color:#262828;font-family:Arial,sans-serif}.card{width:min(410px,calc(100% - 40px));padding:32px;border-radius:18px;background:#fffdfa;box-shadow:0 28px 80px #26282838;text-align:center}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.card h1{font:500 27px Georgia,serif}.card p{color:#66705f;line-height:1.45}.google,button{display:block;width:100%;box-sizing:border-box;margin-top:18px;padding:12px;border-radius:7px;font-weight:700;text-decoration:none;cursor:pointer}.google{border:1px solid #747775;color:#1f1f1f;background:#fff}.secondary{border:1px solid #d6cec3;background:#f8f4ee;color:#262828;font-size:12px}.card form{text-align:left}.card label{display:grid;gap:6px;margin:14px 0;font-size:12px;font-weight:700}.card input{padding:11px;border:1px solid #cfc5b8;border-radius:7px;font:inherit}.card form button{border:0;background:#3b4a3a;color:#fff}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b!important;font-size:12px}`}</style>
    </section></main>
  );
}
