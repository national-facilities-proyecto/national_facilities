"""Replacement at the five-photo limit must be atomic and remain authorized."""

import uuid
from unittest.mock import patch
from django.test import TestCase
from . import tests as integration
from .models import Evidencia, Ticket


class TicketEvidenceReplacementTests(TestCase):
    setUp = integration.IntegrationTests.setUp
    login_as = integration.IntegrationTests.login_as

    def upload(self, replace_id=None, client_id=None):
        data = {
            "id": client_id or str(uuid.uuid4()),
            "foto": integration.image_file(),
            "source": "gallery",
        }
        if replace_id:
            data["replaceId"] = replace_id
        return self.client.post("/api/evidencias/", data, format="multipart")

    def test_replacement_at_limit_and_retry_preserve_five_rows_and_original_audit(self):
        self.login_as("store")
        originals = [self.upload().data["id"] for _ in range(5)]
        self.assertEqual(self.upload().status_code, 400)
        new_id = str(uuid.uuid4())
        result = self.upload(originals[0], new_id)
        self.assertEqual(result.status_code, 201, result.data)
        count = Evidencia.objects.count()
        self.assertEqual(self.upload(originals[0], new_id).status_code, 200)
        self.assertEqual(Evidencia.objects.count(), count)
        original = Evidencia.objects.get(client_id=originals[0])
        self.assertIsNotNone(original.eliminada_en)
        self.assertTrue(original.foto.name)
        ids = {item["id"] for item in self.client.get("/api/evidencias/").data}
        self.assertEqual(ids, set(originals[1:] + [new_id]))

    def test_foreign_and_associated_files_cannot_be_replaced(self):
        self.login_as("store")
        original = self.upload().data["id"]
        file = Evidencia.objects.get(client_id=original)
        file.autor = self.users["othertech"]
        file.save()
        self.assertIn(self.upload(original).status_code, (400, 404))
        file.autor = self.users["store"]
        file.ticket = Ticket.objects.create(
            tienda=self.store,
            categoria=self.category,
            urgencia=self.urgency,
            reportado_por=self.users["store"],
            descripcion="Reporte asociado de prueba",
        )
        file.save()
        self.assertEqual(self.upload(original).status_code, 400)
        file.refresh_from_db()
        self.assertIsNone(file.eliminada_en)

    def test_storage_failure_rolls_back_replacement_and_keeps_original(self):
        self.login_as("store")
        original = self.upload().data["id"]
        with patch(
            "core.evidence_views.Evidencia.save", side_effect=OSError("Storage failed")
        ):
            with self.assertRaises(OSError):
                self.upload(original)
        self.assertIsNone(Evidencia.objects.get(client_id=original).eliminada_en)
        self.assertEqual(Evidencia.objects.count(), 1)
