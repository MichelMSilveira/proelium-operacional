# N.E.M.O. em desenvolvimento

O módulo `Sistema/analise_operacional.py` é uma primeira camada somente leitura e ainda não é chamado pelo Proelium Operacional. Ele trabalha sobre um dicionário agregado com as coleções `tasks`, `opportunities` e `appointments`.

A fixture sanitizada em `tests_python/fixture_data.json` representa esse formato sem dados reais. `analisar_operacao` produz alertas e recomendações fundamentadas, mas não confirma, executa ou registra alterações no Proelium.

Para preparar o Windows, instale Python 3.12+ com `winget install Python.Python.3.12` e abra um novo terminal. Os testes não têm dependências externas:

```powershell
python -m unittest discover -s tests_python -p "test_*.py"
```

O contrato `Documentacao/Arquitetura/Contrato_Assistente_Operacional.md` e o commit `35407b5` não estão presentes neste clone; as regras acima devem ser reconciliadas quando a fonte oficial for disponibilizada.
