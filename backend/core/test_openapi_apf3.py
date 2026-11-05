"""Comprobaciones de contrato OpenAPI/Swagger para APF3.

No requieren usuarios ni alterar datos: solo consultan el esquema público.
"""
from django.test import SimpleTestCase


class OpenAPISmokeTests(SimpleTestCase):
    def test_schema_serves_openapi_3(self):
        response = self.client.get("/api/schema/?format=json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("openapi", "").startswith("3.0."))
        self.assertIn("paths", data)
        self.assertIn("/api/health/", data["paths"])

    def test_swagger_ui_is_reachable(self):
        response = self.client.get("/api/docs/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "swagger", status_code=200)
