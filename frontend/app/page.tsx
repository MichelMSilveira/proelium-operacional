"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { name?: string; username?: string; email?: string };
type Data = { data?: Record<string, unknown[]> };

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [master, setMaster] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [view, setView] = useState("dashboard");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setUser(payload?.user || null))
      .catch(() => setError("Não foi possível conectar ao servidor."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.querySelectorAll("nav button").forEach((button) => {
      if (button.textContent === "Clientes")
        button.addEventListener("click", () => {
          window.location.href = "/clients";
        });
      if (button.textContent === "Projetos")
        button.addEventListener("click", () => {
          window.location.href = "/projects";
        });
      if (button.textContent === "Comercial")
        button.addEventListener("click", () => {
          window.location.href = "/commercial";
        });
      if (button.textContent === "Financeiro")
        button.addEventListener("click", () => {
          window.location.href = "/finance";
        });
      if (button.textContent === "Indicadores")
        button.addEventListener("click", () => {
          window.location.href = "/bi";
        });
      const routes: Record<string, string> = {
        Operação: "/operations",
        Agenda: "/agenda",
        Catálogo: "/products",
        Qualidade: "/quality",
        Conhecimento: "/knowledge",
        Equipamentos: "/equipment",
        Compras: "/purchases",
        Levantamento: "/survey",
        Relatórios: "/reports",
        Colaboradores: "/collaborators",
        Usuários: "/users",
        Convites: "/invites",
        Configurações: "/settings",
      };
      Object.entries(routes).forEach(([label, route]) => {
        if (button.textContent === label)
          button.addEventListener("click", () => {
            window.location.href = route;
          });
      });
      const nav = document.querySelector("nav");
      if (nav && !nav.querySelector("[data-expanded-navigation]")) {
        const marker = document.createElement("span");
        marker.dataset.expandedNavigation = "true";
        marker.hidden = true;
        nav.appendChild(marker);
        Object.entries(routes).forEach(([label, route]) => {
          const link = document.createElement("button");
          link.textContent = label;
          link.onclick = () => {
            window.location.href = route;
          };
          nav.appendChild(link);
        });
      }
    });
  }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Não foi possível entrar.");
      return;
    }
    setUser(payload.user);
  }

  if (loading)
    return (
      <main className="auth-page">
        <section className="card">Carregando…</section>
      </main>
    );
  if (user) {
    const navigation = [
      ["dashboard", "Visão geral"],
      ["clients", "Clientes"],
      ["projects", "Projetos"],
      ["commercial", "Comercial"],
      ["finance", "Financeiro"],
      ["bi", "Indicadores"],
    ];
    const statDefinitions = [
      ["clients", "Clientes"],
      ["projects", "Projetos"],
      ["tasks", "Tarefas"],
      ["financialEntries", "Lançamentos financeiros"],
    ];
    return (
      <main className="app-page">
        <aside>
          <span className="eyebrow">PROELIUM</span>
          <nav>
            {navigation.map(([key, label]) => (
              <button
                className={view === key ? "active" : ""}
                key={key}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            className="logout"
            onClick={async () => {
              await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
              });
              setUser(null);
            }}
          >
            Sair
          </button>
        </aside>
        <section className="workspace">
          <header>
            <span>{user.name || user.username}</span>
          </header>
          <section className="content">
            <p className="eyebrow">
              {navigation.find(([key]) => key === view)?.[1]}
            </p>
            <h1>
              {view === "dashboard"
                ? `Olá, ${user.name || user.username}`
                : "Módulo em transição"}
            </h1>
            <p>
              {view === "dashboard"
                ? "Visão inicial conectada à API atual. Os módulos operacionais continuam disponíveis no aplicativo legado."
                : "Esta área será migrada em uma próxima fatia, com seus testes e permissões preservados."}
            </p>
            {view === "dashboard" && (
              <>
                <button
                  disabled={dataLoading}
                  onClick={async () => {
                    setDataLoading(true);
                    setDataError("");
                    try {
                      const response = await fetch("/api/data", {
                        credentials: "include",
                      });
                      const payload = await response.json().catch(() => ({}));
                      if (!response.ok)
                        throw new Error(
                          payload.error ||
                            "Não foi possível carregar o resumo.",
                        );
                      setData(payload);
                    } catch (error) {
                      setDataError(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível carregar o resumo.",
                      );
                    } finally {
                      setDataLoading(false);
                    }
                  }}
                >
                  {dataLoading ? "Carregando…" : "Carregar resumo operacional"}
                </button>
                {dataError && <p className="error">{dataError}</p>}
                {data && (
                  <div className="stats">
                    {statDefinitions.map(([key, label]) => (
                      <article key={key}>
                        <strong>{data.data?.[key]?.length || 0}</strong>
                        <span>{label}</span>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </section>
        <style jsx>{`
          .app-page {
            min-height: 100vh;
            display: flex;
            background: #f5f1eb;
            color: #262828;
            font-family: Arial, sans-serif;
          }
          aside {
            width: 210px;
            display: flex;
            flex-direction: column;
            gap: 28px;
            padding: 28px 16px;
            background: #3b4a3a;
            color: #fff;
          }
          nav {
            display: grid;
            gap: 6px;
          }
          nav button,
          .logout {
            padding: 11px 12px;
            border: 0;
            border-radius: 7px;
            text-align: left;
            background: transparent;
            color: #fff;
            cursor: pointer;
          }
          nav button.active,
          nav button:hover {
            background: #cb6445;
          }
          .logout {
            margin-top: auto;
            background: #ffffff1c;
          }
          .workspace {
            flex: 1;
          }
          .workspace header {
            padding: 18px 6%;
            text-align: right;
            background: #fff;
            border-bottom: 1px solid #ded6cb;
          }
          .content {
            max-width: 1000px;
            margin: auto;
            padding: 48px 6%;
          }
          .content h1 {
            font:
              500 34px Georgia,
              serif;
          }
          .content p {
            color: #66705f;
          }
          .content > button {
            border: 0;
            border-radius: 7px;
            padding: 10px 14px;
            background: #cb6445;
            color: #fff;
            font-weight: 700;
            cursor: pointer;
          }
          .content > button:disabled {
            opacity: 0.65;
            cursor: wait;
          }
          .error {
            padding: 10px;
            border-radius: 7px;
            background: #fbe8e4;
            color: #9d423b !important;
            font-size: 12px;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-top: 28px;
          }
          .stats article {
            display: grid;
            gap: 6px;
            padding: 20px;
            border-radius: 12px;
            background: #fff;
            box-shadow: 0 5px 20px #26282812;
          }
          .stats strong {
            font-size: 28px;
            color: #3b4a3a;
          }
          .stats span {
            font-size: 12px;
            color: #66705f;
          }
          @media (max-width: 650px) {
            aside {
              width: 145px;
              padding: 20px 9px;
            }
            .stats {
              grid-template-columns: repeat(2, 1fr);
            }
          }
        `}</style>
      </main>
    );
  }
  return (
    <main className="auth-page">
      <section className="card">
        <p className="eyebrow">PROELIUM OPERACIONAL</p>
        <h1>{master ? "Acesso mestre da plataforma" : "Entrar no sistema"}</h1>
        <p>
          {master
            ? "Use o usuário mestre para administrar a plataforma."
            : "Entre com sua conta Google para acessar o sistema."}
        </p>
        {error && <p className="error">{error}</p>}
        {!master ? (
          <a className="google" href="/api/auth/google">
            Entrar com Google
          </a>
        ) : (
          <form onSubmit={submit}>
            <label>
              Usuário
              <input name="username" required autoComplete="username" />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button type="submit">Entrar na plataforma</button>
          </form>
        )}
        <button
          className="secondary"
          onClick={() => {
            setMaster(!master);
            setError("");
          }}
        >
          {master ? "Voltar para login Google" : "Acesso mestre da plataforma"}
        </button>
        <style jsx>{`
          .auth-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #e6dfd6;
            color: #262828;
            font-family: Arial, sans-serif;
          }
          .card {
            width: min(410px, calc(100% - 40px));
            padding: 32px;
            border-radius: 18px;
            background: #fffdfa;
            box-shadow: 0 28px 80px #26282838;
            text-align: center;
          }
          .eyebrow {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.2em;
          }
          .card h1 {
            font:
              500 27px Georgia,
              serif;
          }
          .card p {
            color: #66705f;
            line-height: 1.45;
          }
          .google,
          button {
            display: block;
            width: 100%;
            box-sizing: border-box;
            margin-top: 18px;
            padding: 12px;
            border-radius: 7px;
            font-weight: 700;
            text-decoration: none;
            cursor: pointer;
          }
          .google {
            border: 1px solid #747775;
            color: #1f1f1f;
            background: #fff;
          }
          .secondary {
            border: 1px solid #d6cec3;
            background: #f8f4ee;
            color: #262828;
            font-size: 12px;
          }
          .card form {
            text-align: left;
          }
          .card label {
            display: grid;
            gap: 6px;
            margin: 14px 0;
            font-size: 12px;
            font-weight: 700;
          }
          .card input {
            padding: 11px;
            border: 1px solid #cfc5b8;
            border-radius: 7px;
            font: inherit;
          }
          .card form button {
            border: 0;
            background: #3b4a3a;
            color: #fff;
          }
          .error {
            padding: 10px;
            border-radius: 7px;
            background: #fbe8e4;
            color: #9d423b !important;
            font-size: 12px;
          }
        `}</style>
      </section>
    </main>
  );
}
