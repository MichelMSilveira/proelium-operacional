# Sincronização entre aparelhos

## Fonte única dos dados

O arquivo `data/shared-data.json`, armazenado no PC `homehell`, é a base central do ambiente de testes. Computadores e celulares devem acessar somente:

`https://homehell.tail99a9b2.ts.net`

O endereço do Tailscale precisa encaminhar para `http://127.0.0.1:4173`. Live Server e a porta 5500 servem apenas arquivos e não possuem a API de dados.

## Fluxo

1. O navegador carrega `/api/data` e recebe `data`, `revision` e `updatedAt`.
2. Uma alteração envia a base com a revisão usada como origem.
3. O servidor grava primeiro em arquivo temporário e depois substitui o arquivo central.
4. O servidor incrementa a revisão e avisa os aparelhos conectados por `/api/events`.
5. Como contingência, cada aparelho consulta a base a cada 5 segundos e quando volta ao primeiro plano.
6. Se outro aparelho já tiver gravado uma versão mais nova, o servidor responde `409`, atualiza a tela e pede que a última ação seja repetida.

## Teste de funcionamento

1. Execute `Reiniciar-App.ps1` no PC servidor.
2. Abra `http://127.0.0.1:4173/api/data` e confirme que existe um número em `revision`.
3. Abra `https://homehell.tail99a9b2.ts.net/api/data` e confirme que a resposta também é JSON.
4. Abra o aplicativo em dois aparelhos e aguarde 10 segundos.
5. Cadastre `Teste de sincronização` no primeiro aparelho.
6. Confirme que ele aparece no segundo sem recarregar; depois exclua o teste e confirme o desaparecimento.

## Diagnóstico

| Sintoma | Causa provável | Correção |
|---|---|---|
| `Cannot GET /api/data` pelo endereço Tailscale | encaminhamento para Live Server ou porta errada | executar `tailscale serve --bg 4173` como administrador |
| `/api/events` retorna `404` | processo antigo na porta 4173 | executar `Reiniciar-App.ps1` |
| somente um aparelho muda | aparelho em modo local ou URL diferente | fechar o app e abrir o endereço `.ts.net` |
| alteração recebe aviso de conflito | outro aparelho gravou primeiro | aguardar a atualização e repetir a ação |

## Limites do protótipo

O arquivo JSON é adequado para testes com poucos usuários. Antes do uso operacional definitivo, a base deverá migrar para PostgreSQL com autenticação, permissões, auditoria e backup automatizado.
