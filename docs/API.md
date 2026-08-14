# Contrato inicial da API

Base: `/api/v1`. Respostas em JSON. Listagens usam `page`, `limit`, `sort` e filtros específicos.

## Recursos

| Método | Rota | Uso |
|---|---|---|
| GET/POST | `/clients` | listar/criar clientes |
| GET/PATCH | `/clients/{id}` | detalhe/alteração |
| DELETE | `/clients/{id}` | excluir cliente e registros vinculados após confirmação |
| GET/POST | `/projects` | listar/criar projetos |
| GET/PATCH | `/projects/{id}` | detalhe/alteração |
| GET/POST | `/tasks` | pendências e tarefas |
| PATCH | `/tasks/{id}` | responsável, prazo, prioridade, status |
| GET/POST | `/quotes` | orçamentos e versões |
| GET/POST | `/products` | catálogo de produtos, materiais e serviços |
| GET/POST | `/quotes/{id}/rooms` | cômodos ou ambientes do orçamento |
| POST | `/quotes/{id}/rooms/{roomId}/items` | adicionar item do catálogo ao ambiente |
| GET | `/quotes/{id}/analysis` | custo, venda e margem por ambiente |
| POST | `/quotes/{id}/approve` | registrar aprovação |
| GET/POST | `/work-orders` | ordens de serviço |
| GET/POST | `/installations` | planejamento e controle de instalações |
| GET/PATCH | `/installations/{id}` | etapa, progresso, prazo e entrega |
| GET/POST | `/clients/{id}/activities` | histórico cronológico do cliente |
| GET/POST | `/transactions` | receitas e despesas |
| GET/POST | `/equipment` | estoque e equipamentos instalados |
| GET/POST | `/knowledge` | artigos e documentos |
| GET | `/search?q=` | busca transversal |
| GET | `/operational-summary` | resumo otimizado para painel/N.E.M.O. |
| GET | `/analytics/projects?groupBy=` | indicadores agrupados para Business Intelligence |
| GET | `/audit-events` | trilha de alterações |

## Exemplo: resumo operacional

```json
{
  "generatedAt": "2026-08-14T16:00:00Z",
  "projects": { "active": 8, "blocked": 1, "late": 2 },
  "tasks": { "open": 19, "overdue": 4, "dueToday": 3 },
  "finance": { "approvedCents": 24500000, "costCents": 15740000 },
  "attention": [
    { "type": "task", "id": "...", "reason": "overdue" }
  ]
}
```

## Segurança para o N.E.M.O.

O N.E.M.O. recebe credencial de serviço com escopos explícitos, por exemplo `projects:read`, `tasks:read` e, numa fase posterior, `tasks:write`. Toda escrita aceita `Idempotency-Key`, registra autor/origem e retorna o evento de auditoria criado.
