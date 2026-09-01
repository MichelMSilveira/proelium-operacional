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
    """Return active opportunities with an overdue next action."""
    reference = _reference(em)
    result = []
    for opportunity in data.get("opportunities", []) or []:
        if _completed(opportunity):
            continue
        due = _as_date(opportunity.get("nextDue", opportunity.get("nextActionDate")))
        if due and due < reference:
            result.append(dict(opportunity))
    return result


def compromissos_do_dia(data: Mapping[str, Any], em: date | str | None = None) -> list[dict[str, Any]]:
    """Return appointments scheduled for *em*, ordered by time then title."""
    target = _reference(em).isoformat()
    result = [dict(item) for item in (data.get("appointments", []) or []) if str(item.get("date", ""))[:10] == target]
    return sorted(result, key=lambda item: (str(item.get("time", "")), str(item.get("title", ""))))


def analisar_operacao(data: Mapping[str, Any], em: date | str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Build the three read-only sections exposed to the future assistant."""
    return {
        "tarefas_atrasadas": tarefas_atrasadas(data, em),
        "oportunidades_paradas": oportunidades_paradas(data, em),
        "compromissos_do_dia": compromissos_do_dia(data, em),
    }
