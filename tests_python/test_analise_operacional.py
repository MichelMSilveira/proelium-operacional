import json
import unittest
from pathlib import Path

from Sistema.analise_operacional import analisar_operacao, compromissos_do_dia, oportunidades_paradas, tarefas_atrasadas


class AnaliseOperacionalTest(unittest.TestCase):
    DATA = {
        "tasks": [{"id": "t1", "title": "Vencida", "dueDate": "2026-08-31", "status": "Aberta"}, {"id": "t2", "dueDate": "2026-08-30", "status": "Concluída"}],
        "opportunities": [{"id": "o1", "company": "Parada", "stage": "Qualificação", "nextDue": "2026-08-29"}, {"id": "o2", "nextDue": "2026-09-01", "stage": "Visita"}],
        "appointments": [{"id": "a2", "title": "Tarde", "date": "2026-09-01", "time": "14:00"}, {"id": "a1", "title": "Manhã", "date": "2026-09-01", "time": "09:00"}, {"id": "a3", "date": "2026-09-02", "time": "10:00"}],
    }

    def test_tarefas_atrasadas_ignora_concluidas(self):
        self.assertEqual(["t1"], [item["id"] for item in tarefas_atrasadas(self.DATA, "2026-09-01")])

    def test_oportunidades_paradas_exige_proxima_acao_vencida(self):
        self.assertEqual(["o1", "o2"], [item["id"] for item in oportunidades_paradas(self.DATA, "2026-09-01")])

    def test_compromissos_do_dia_ordena_por_horario(self):
        self.assertEqual(["a1", "a2"], [item["id"] for item in compromissos_do_dia(self.DATA, "2026-09-01")])

    def test_oportunidade_sem_proxima_acao_esta_parada(self):
        self.assertIn("o2", [item["id"] for item in oportunidades_paradas(self.DATA, "2026-09-01")])

    def test_resumo_tem_as_tres_secoes(self):
        self.assertEqual({"tarefas_atrasadas", "oportunidades_paradas", "compromissos_do_dia", "recomendacoes"}, set(analisar_operacao(self.DATA, "2026-09-01")))

    def test_recomendacoes_sao_fundamentadas_e_nao_executam_acoes(self):
        recommendations = analisar_operacao(self.DATA, "2026-09-01")["recomendacoes"]
        self.assertTrue(all({"fato", "consequencia", "acao_sugerida", "incerteza"} <= set(item) for item in recommendations))

    def test_fixture_sanitizada_tem_formato_aceito(self):
        fixture = json.loads((Path(__file__).with_name("fixture_data.json")).read_text(encoding="utf-8"))
        summary = analisar_operacao(fixture, "2026-09-01")
        self.assertEqual(["appointment-demo-1"], [item["id"] for item in summary["compromissos_do_dia"]])

    def test_data_invalida_nao_cria_alerta(self):
        self.assertEqual([], tarefas_atrasadas({"tasks": [{"id": "x", "dueDate": "sem-data"}]}, "2026-09-01"))


if __name__ == "__main__":
    unittest.main()
