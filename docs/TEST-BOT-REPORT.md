# Relatório do bot funcional — 2026-08-29

## Resultado

- ambiente utilizado: servidor JSON temporário, criado em pasta descartável;
- PostgreSQL e arquivos reais em `data/`: não acessados pelo cenário;
- verificações automáticas: 21 de 21 aprovadas;
- módulos abertos no navegador: 26 de 26 renderizados;
- erros de console durante a navegação: nenhum;
- fluxo real de interface: contato, proposta, ambiente, item, aprovação da venda, cliente e projeto criados com sucesso no ambiente isolado.

## Fluxo comercial simulado

O navegador criou um contato fictício, abriu a proposta correspondente, adicionou o ambiente `Sala Interface`, incluiu uma caixa acústica Morel de referência por R$ 6.500 e aprovou a venda. O CRM passou a mostrar o cliente e a área de Projetos passou a mostrar o projeto gerado pela aprovação.

## Áreas cobertas automaticamente

Autenticação, usuário administrador, perfil Leitura, saúde do servidor, PWA, proteção da API, CRM, histórico do cliente, oportunidades, produtos, pacotes, levantamento técnico, orçamento por ambiente, venda, projeto, tarefas, agenda, instalação, checklist, OS, relatório de serviço, entrega, pós-venda, colaboradores, avaliações, equipamentos, financeiro, execução, compras, diagrama técnico, conhecimento, auditoria, sincronização e conflito de revisão.

## Correções encontradas e aplicadas

1. A presença online exibia `vocÃª`, `DisponÃ­vel` e `IndisponÃ­vel`. Os textos foram corrigidos para UTF-8 e ganharam teste de regressão.
2. O fixture funcional não informava a versão do catálogo. Ao abrir o cenário no app, a normalização removia os itens personalizados do orçamento por considerá-los de catálogo antigo. O bot agora usa `catalogVersion: 2`, preservando produtos, ambientes e totais durante a simulação pela interface.
3. A mensagem de heartbeat inválido no servidor também continha codificação quebrada e foi corrigida.

## Limite consciente

O bot valida os fluxos atuais com registros fictícios e relacionamentos coerentes. Ele não apaga registros reais, não executa migrações, não acessa o PostgreSQL e não tenta reproduzir integrações físicas como câmera, contatos do aparelho ou hardware de rede.
