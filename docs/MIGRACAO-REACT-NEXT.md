# Migração técnica do Proelium Operacional — histórico

> Esta migração foi concluída. O frontend principal atual está em `frontend/`, usando React, TypeScript e Next.js. Para o estado vigente, consulte [`frontend/README.md`](../frontend/README.md) e [`ARCHITECTURE-CURRENT.md`](ARCHITECTURE-CURRENT.md).

Este documento trata exclusivamente da evolução técnica do aplicativo descrito em `PROJECT.md`.

## Objetivo

Registrar o plano histórico que levou o frontend para React, TypeScript e Next.js, preservando o produto, os dados, a API, a segurança e os clientes PWA/Android/Windows.

## Preparação necessária

- mapa dos módulos e fluxos;
- modelo de domínio e relacionamentos;
- contrato da API e permissões;
- decisões arquiteturais e padrões de código;
- testes de comportamento e interface;
- inventário de dados, estados e integrações;
- critérios de aceite;
- plano de migração incremental.

Nenhuma reescrita ampla deve começar antes de a primeira fatia estar especificada e validada no sistema atual.
