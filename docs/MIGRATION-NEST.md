# Controle de migração — legado, NestJS e Next.js

Esta página é um **modelo de acompanhamento**, não uma declaração de que todos os recursos foram cortados para NestJS. O estado real depende do código, do roteamento publicado e dos testes. Preencher uma linha por domínio antes de remover qualquer caminho legado.

| Recurso | Serviço que atende hoje | Fonte de dados | Consumidores | Fallback | Teste de contrato/integração | Critério de corte | Reversão |
|---|---|---|---|---|---|---|---|
| [a mapear] | [verificar no código e ambiente] | [verificar] | [web/PWA/Android/Windows] | [verificar] | [evidência/pendência] | [aceite observável] | [procedimento] |

## Critério de saída por recurso

1. Confirmar o serviço dono e o caminho público, sem inferir a partir da presença de um controller.
2. Registrar consumidores, contrato atual, persistência, dependências e fallback.
3. Testar sucesso, erros, acesso, separação de dados e concorrência conforme o risco do recurso, em ambiente isolado.
4. Revisar diferenças em relação ao legado, atualizar clientes afetados e preparar retorno seguro.
5. Aprovar a publicação, observar o ambiente real e registrar versão e resultado antes de retirar o caminho antigo.

A suíte atual compila o Nest; testes dedicados de contrato e integração ainda devem ser adicionados conforme cada domínio for cortado. Consulte [Arquitetura atual](ARCHITECTURE-CURRENT.md) e [Processo de entrega](RELEASE-PROCESS.md).
