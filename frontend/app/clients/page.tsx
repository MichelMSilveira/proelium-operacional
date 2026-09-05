"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModuleLayout } from "../components/ModuleLayout";
import { apiGet, apiPut } from "../../lib/api";

type Client = Record<string, unknown>;
type Payload = { revision?: number; data?: Record<string, Client[]> };
export default function ClientsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiGet<Payload>("/api/data")
      .then(setPayload)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar clientes.",
        ),
      );
  }, []);
  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload?.data) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const client = {
      id: crypto.randomUUID(),
      name: String(form.get("name") || "").trim(),
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      const result = await apiPut<{ revision?: number }>("/api/data", {
        data: {
          ...payload.data,
          clients: [...(payload.data.clients || []), client],
        },
        baseRevision: payload.revision || 0,
      });
      setPayload({
        ...payload,
        revision: result.revision,
        data: {
          ...payload.data,
          clients: [...(payload.data.clients || []), client],
        },
      });
      event.currentTarget.reset();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o cliente.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeClient(id: unknown) {
    if (!payload?.data || !window.confirm("Excluir este cliente?")) return;
    setSaving(true);
    setError("");
    const clients = (payload.data.clients || []).filter(
      (client) => client.id !== id,
    );
    try {
      const result = await apiPut<{ revision?: number }>("/api/data", {
        data: { ...payload.data, clients },
        baseRevision: payload.revision || 0,
      });
      setPayload({
        ...payload,
        revision: result.revision,
        data: { ...payload.data, clients },
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir o cliente.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function editClient(client: Client) {
    if (!payload?.data) return;
    const name = window.prompt("Nome do cliente", String(client.name || client.nome || ""));
    if (!name?.trim()) return;
    const email = window.prompt("E-mail do cliente", String(client.email || ""));
    if (email === null) return;
    const phone = window.prompt("Telefone do cliente", String(client.phone || client.telefone || ""));
    if (phone === null) return;
    const clients = (payload.data.clients || []).map((item) => item.id === client.id ? { ...item, name: name.trim(), email: email.trim(), phone: phone.trim() } : item);
    setSaving(true); setError("");
    try { const result = await apiPut<{ revision?: number }>("/api/data", { data: { ...payload.data, clients }, baseRevision: payload.revision || 0 }); setPayload({ ...payload, revision: result.revision, data: { ...payload.data, clients } }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível editar o cliente."); } finally { setSaving(false); }
  }
  const clients = payload?.data?.clients || [];
  return (
    <ModuleLayout
      eyebrow="CRM"
      title="Clientes"
      description="Consulta e cadastro inicial de clientes, com controle de revisão."
    >
      {error && <p className="error">{error}</p>}
      <form className="create-form" onSubmit={createClient}>
        <input name="name" placeholder="Nome do cliente" required />
        <input name="email" type="email" placeholder="E-mail" />
        <input name="phone" placeholder="Telefone" />
        <button disabled={saving}>
          {saving ? "Salvando…" : "Adicionar cliente"}
        </button>
      </form>
      <div className="record-list">
        {clients.map((client, index) => (
          <article key={String(client.id || index)}>
            <div>
              <strong>
                {String(client.name || client.nome || "Cliente sem nome")}
              </strong>
              <span>
                {String(
                  client.email ||
                    client.phone ||
                    client.telefone ||
                    "Sem contato informado",
                )}
              </span>
            </div>
              <button className="edit"
                type="button"
                disabled={saving}
                onClick={() => editClient(client)}
              >Editar</button><button
                type="button"
                className="delete"
              disabled={saving}
              onClick={() => removeClient(client.id)}
            >
              Excluir
            </button>
          </article>
        ))}
        {!error && !clients.length && <p>Nenhum cliente disponível.</p>}
      </div>
      <style jsx>{`
        .create-form {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr auto;
          gap: 8px;
          margin-top: 24px;
        }
        .create-form input {
          min-width: 0;
          padding: 11px;
          border: 1px solid var(--proelium-line);
          border-radius: 7px;
        }
        .create-form button,
        .delete {
          border: 0;
          border-radius: 7px;
          padding: 10px 14px;
          background: var(--proelium-orange);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .create-form button:disabled,
        .delete:disabled {
          opacity: 0.6;
        }
        .record-list {
          display: grid;
          gap: 10px;
          margin-top: 28px;
        }
        .record-list article {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px;
          border-radius: 10px;
          background: var(--proelium-card);
          box-shadow: 0 5px 20px #26282812;
        }
        .record-list article div {
          display: grid;
          gap: 6px;
        }
        .record-list span,
        .record-list > p {
          font-size: 12px;
          color: var(--proelium-muted);
        }
        .delete {
          background: transparent;
          color: #9d423b;
          border: 1px solid #e6b9af;
          font-size: 12px;
        }
        @media (max-width: 700px) {
          .create-form {
            grid-template-columns: 1fr;
          }
          .create-form button {
            width: 100%;
          }
        }
      `}</style>
    </ModuleLayout>
  );
}
