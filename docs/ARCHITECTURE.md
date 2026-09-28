# Arquitetura proposta — histórico e direção futura

> Este documento mistura propostas de evolução e partes já implementadas. Para entender os serviços, portas, roteamento e fontes de dados **atuais**, consulte [Arquitetura atual](ARCHITECTURE-CURRENT.md). Os caminhos `/api/v1`, OIDC e storage S3 abaixo são propostas, não contratos de produção confirmados. A migração por recurso está em [MIGRATION-NEST.md](MIGRATION-NEST.md).

## Visão

```text
App web responsivo
        │
        ▼
API REST versionada (/api/v1)
        │
  ┌─────┴──────────────┐
  ▼                    ▼
Serviços de domínio   Eventos/auditoria
  │                    │
  └─────┬──────────────┘
        ▼
PostgreSQL + armazenamento de arquivos
        ▲
        │ OAuth/API key de serviço
        │
     N.E.M.O.
```

## Stack sugerida para produção

- Frontend: React + TypeScript.
- Backend: API TypeScript (Fastify/NestJS) ou Python (FastAPI).
- Banco: PostgreSQL.
- Arquivos: storage compatível com S3.
- Autenticação: provedor OIDC, com RBAC por organização.
- Jobs/eventos: fila transacional quando surgirem notificações e integrações.

O frontend e o contrato agregado de `/api/data` permanecem no protótipo atual. O armazenamento principal já utiliza PostgreSQL com transações, histórico de revisões, migrações e espelho JSON temporário. A normalização por recurso e a API `/api/v1` continuam como evolução posterior.

## Dimensionamento técnico

O fluxo comercial passa a reservar uma etapa entre levantamento e orçamento: `Levantamento → Regras técnicas → Solução técnica → Produtos compatíveis → Orçamento`. O núcleo inicial está em `technical-dimensioning.js`, como função pura compartilhada pelo shell e pelo NestJS. Ele recebe necessidades e pontos, produz requisitos genéricos e mantém a origem dos pontos em `trace`; não conhece catálogo, marcas, custos ou preços. `technical-compatibility.js` recebe o resultado do dimensionamento e o catálogo, devolvendo referências compatíveis e justificativas sem expor preço ou custo. A rota `GET /api/survey/{id}/dimensioning` expõe as duas prévias para a tela Next.js, e `POST /api/survey/{id}/dimensioning/confirm` registra os IDs escolhidos em `extra_data.technicalSolution`, com validação de compatibilidade e revisão concorrente. A seleção de itens no orçamento e a precificação permanecem como próxima etapa, evitando acoplamento com o orçamento atual.

## Preparação para o N.E.M.O.

### Automação inicial

A primeira regra de Automação foi adicionada ao mesmo núcleo puro: pontos de iluminação geram um controlador genérico e requisitos separados por relé ou dimmer, com rastreabilidade em `trace`. A camada de compatibilidade valida o modo e os canais dos módulos cadastrados; somente a seleção confirmada atravessa a camada comercial.

O motor de Áudio interpreta configurações mono, estéreo e cinema sem conhecer marcas: 7.1.4, por exemplo, gera 11 canais, 7 canais principais, 4 de altura, subwoofer e sinalização de amplificação externa. Processamento, caixas e subwoofer são requisitos separados da compatibilidade e do preço.

O requisito de rack registra unidades ocupadas e reserva técnica. A regra também produz organizadores de cabos por bloco de até 24 portas; o tipo é genérico, não conhece fabricante e só chega ao orçamento quando uma referência compatível é confirmada.

Para a infraestrutura de rede, o motor também produz um requisito de nobreak senoidal com potência e VA mínimos derivados da carga PoE conhecida, além de autonomia mínima de 10 minutos. Ele registra separadamente circuito dedicado, aterramento e DPS; esses requisitos de instalação não são tratados como produtos. A compatibilidade do nobreak compara capacidade cadastrada e permanece independente de marca.

- API versionada e documentada.
- IDs UUID, timestamps e campos estruturados.
- endpoint de resumo operacional, evitando que o agente precise juntar dezenas de chamadas;
- busca textual na base de conhecimento;
- trilha de auditoria com `actor_type = user | service | nemo`;
- ações mutáveis idempotentes e com confirmação para operações sensíveis;
- webhooks/eventos futuros como `task.overdue`, `project.blocked` e `budget.approved`.

## Fases

1. Validar o protótipo e os campos com 2–3 projetos reais.
2. Implementar autenticação e PostgreSQL mantendo compatibilidade com a API atual. **Concluído.**
3. Normalizar recursos gradualmente e adicionar anexos/auditoria estruturada.
4. Conectar o N.E.M.O. primeiro em modo somente leitura.
5. Liberar ações assistidas com permissões e registro completo.

## Integração da solução técnica com o orçamento

Quando o levantamento possui uma solução técnica confirmada, o mapeador comercial usa as referências selecionadas para gerar os itens do orçamento. A camada comercial consulta os preços atuais do catálogo somente nessa etapa; levantamentos sem confirmação continuam usando o mapeamento legado como fallback. Assim, regras e requisitos permanecem independentes de marcas e preços.

A confirmação de compatibilidade consolida uma referência por requisito técnico. Alternativas permanecem disponíveis para consulta, mas não são gravadas juntas na solução nem enviadas simultaneamente ao orçamento.

O primeiro requisito adicional implementado é `access-point`: a regra calcula quantidade e origem dos pontos Wi-Fi, a compatibilidade filtra referências de access point e o mapeador comercial aplica a quantidade por ambiente somente depois da confirmação.

Para switches PoE, a compatibilidade também compara o orçamento de potência cadastrado no produto com o requisito calculado. Produtos sem orçamento informado ficam pendentes de validação, enquanto produtos conhecidos abaixo do mínimo são excluídos.

Quando existem portas de rede dimensionadas, as regras também produzem requisitos genéricos de patch panel com a mesma capacidade do switch e de rack técnico com reserva mínima de 6U. A camada de compatibilidade consulta esses tipos sem acoplar a regra a marca ou modelo.
