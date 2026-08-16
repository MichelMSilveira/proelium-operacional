# Cliente desktop

Este cliente abre o Proelium em uma janela própria, sem navegador visível, e mantém a base central na VPS. Ele não cria uma cópia local dos dados.

## Desenvolvimento

```powershell
npm install
npm start
```

## Gerar instalador e portátil Windows

```powershell
npm run dist
```

Os artefatos aparecem em `desktop/dist/`.
