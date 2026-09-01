# Privacidade e publicação

Este repositório é público para apresentação profissional. Ele não deve conter dados operacionais reais.

## Regra de ouro

Somente código, documentação técnica, imagens institucionais e dados fictícios podem ser versionados. Clientes, contatos, propostas, contratos, endereços, documentos, credenciais e registros de operação ficam fora do Git.

## Antes de inserir informação relevante

1. Confirmar que existe autorização para publicar o material.
2. Preferir dados sintéticos ou anonimizados, sem possibilidade razoável de reidentificação.
3. Remover CPF, CNPJ, telefone, e-mail, endereço, número de série, valores comerciais e nomes de pessoas.
4. Não copiar `data/`, exports, backups, bancos locais ou relatórios de produção para o projeto.
5. Guardar segredos em variáveis de ambiente; usar `.env.example` somente com nomes e exemplos não funcionais.
6. Revisar também o histórico do Git antes de publicar um arquivo que já conteve informação privada.

## Ambientes

- Desenvolvimento: dados fictícios e `SESSION_SECRET` local.
- Testes: diretórios temporários descartáveis e credenciais efêmeras.
- Produção: PostgreSQL, segredos e dados mantidos no servidor/VPS; nunca no repositório público.

## Checklist antes de cada publicação

- [ ] `git status` não mostra `data/`, `.env`, banco, dump, backup ou chave.
- [ ] Não há credenciais, tokens ou URLs privadas nos arquivos alterados.
- [ ] Imagens não exibem telas, documentos ou dados de clientes.
- [ ] Exemplos e relatórios estão explicitamente marcados como fictícios.
- [ ] `npm run check` passou.
- [ ] O diff foi revisado com `git diff --check`.

## Ponto pendente

O cliente Android ainda contém o endereço IP do VPS. Ele deve ser substituído por um domínio HTTPS somente depois que `app.proeliumservicos.com.br` estiver configurado e testado, para não interromper o acesso ao sistema.
