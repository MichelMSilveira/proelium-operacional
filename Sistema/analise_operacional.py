"""Read-only operational summaries for the future N.E.M.O. assistant.

The functions accept the same aggregate shape used by the web application and
never mutate it or access the network. Dates are ISO-8601 calendar dates.
"""

from datetime import date
from typing import Any, Mapping


def _as_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _reference(value: date | str | None) -> date:
    parsed = _as_date(value)
    return parsed or date.today()


def _completed(item: Mapping[str, Any]) -> bool:
    status = str(item.get("status", item.get("stage", ""))).strip().lower()
    return status in {"concluída", "concluida", "concluído", "concluido", "done", "completed", "ganho", "perdido", "cancelada", "cancelado"}


def tarefas_atrasadas(data: Mapping[str, Any], em: date | str | None = None) -> list[dict[str, Any]]:
    """Return open tasks whose due date is before *em*."""
    reference = _reference(em)
    result = []
    for task in data.get("tasks", []) or []:
        due = _as_date(task.get("dueDate", task.get("deadline", task.get("date"))))
        if due and due < reference and not _completed(task):
            result.append(dict(task))
    return result


def oportunidades_paradas(data: Mapping[str, Any], em: date | str | None = None) -> list[dict[str, Any]]:
    """Return active opportunities without a next action or with one overdue."""
    reference = _reference(em)
    result = []
    for opportunity in data.get("opportunities", []) or []:
        if _completed(opportunity):
            continue
        due = _as_date(opportunity.get("nextDue", opportunity.get("nextActionDate")))
        if not str(opportunity.get("nextAction", "")).strip() or not due or due < reference:
            result.append(dict(opportunity))
    return result


def compromissos_do_dia(data: Mapping[str, Any], em: date | str | None = None) -> list[dict[str, Any]]:
    """Return appointments scheduled for *em*, ordered by time then title."""
    target = _reference(em).isoformat()
    result = [dict(item) for item in (data.get("appointments", []) or []) if str(item.get("date", ""))[:10] == target and not _completed(item)]
    return sorted(result, key=lambda item: (str(item.get("time", "")), str(item.get("title", ""))))


def _recomendacoes(data: Mapping[str, Any], reference: date) -> list[dict[str, Any]]:
    recommendations = []
    for task in tarefas_atrasadas(data, reference):
        recommendations.append({"tipo": "tarefa_atrasada", "fato": task.get("title", task.get("id")), "responsavel": task.get("assignee", task.get("owner")), "prazo": task.get("dueDate", task.get("deadline", task.get("date"))), "consequencia": "A pendência pode continuar afetando o prazo operacional.", "acao_sugerida": "Revisar a tarefa e definir o próximo passo.", "incerteza": "A consequência depende do vínculo da tarefa com o projeto."})
    for opportunity in oportunidades_paradas(data, reference):
        recommendations.append({"tipo": "oportunidade_parada", "fato": opportunity.get("company", opportunity.get("id")), "responsavel": opportunity.get("owner"), "prazo": opportunity.get("nextDue"), "consequencia": "A oportunidade pode perder continuidade comercial.", "acao_sugerida": "Definir ou revisar a próxima ação.", "incerteza": "O impacto financeiro não é calculado sem valor estimado."})
    return recommendations


def analisar_operacao(data: Mapping[str, Any], em: date | str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Build the read-only sections and grounded recommendations."""
    reference = _reference(em)
    return {
        "tarefas_atrasadas": tarefas_atrasadas(data, em),
        "oportunidades_paradas": oportunidades_paradas(data, em),
        "compromissos_do_dia": compromissos_do_dia(data, reference),
        "recomendacoes": _recomendacoes(data, reference),
    }
