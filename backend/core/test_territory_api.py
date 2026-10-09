"""Fase 1B: alcance territorial y administración, con barreras server-side."""
import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (Cliente, Zona, Tienda, Usuario, AsignacionTienda, CoberturaUsuario,
                     CategoriaProblema, ClienteEspecialidad, Ticket, Visita)
from .permissions import tiendas_visibles_para
from .services import visible_visits
from .tests import fixtures, PASSWORD


class TerritoryAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.users, cls.north, _, _, _, cls.category, cls.priority = fixtures()
        cls.client_a = cls.north.cliente
        cls.zone_north = cls.north.zona
        cls.zone_south = Zona.objects.create(cliente=cls.client_a, nombre="Sur")
        cls.client_b = Cliente.objects.create(razon_social="Otro cliente", ruc="TERRITORY-B")
        cls.zone_b = Zona.objects.create(cliente=cls.client_b, nombre=cls.zone_north.nombre)
        cls.south = cls.store(cls.client_a, cls.zone_south, "Sur")
        cls.foreign = cls.store(cls.client_b, cls.zone_b, "Norte de otro cliente")
        cls.legacy = cls.store(cls.client_a, None, "Legacy explícita")
        cls.disabled = cls.store(cls.client_a, cls.zone_north, "Inactiva", activo=False)
        cls.hidden_category = CategoriaProblema.objects.create(nombre="No habilitada")
        CoberturaUsuario.objects.filter(usuario=cls.users["othertech"]).update(activo=False)
        CoberturaUsuario.objects.create(usuario=cls.users["othertech"], cliente=cls.client_a, zona=cls.zone_south)
        CoberturaUsuario.objects.create(usuario=cls.users["outsider"], cliente=cls.client_b, zona=cls.zone_b)

    @staticmethod
    def store(client, zone, name, **extra):
        return Tienda.objects.create(cliente=client, zona=zone, nombre=name, direccion="Dirección explícita",
            latitud="-12.100000", longitud="-77.100000", **extra)

    def setUp(self):
        self.client = APIClient()
        self.as_user("admin")

    def as_user(self, name):
        self.client.force_authenticate(self.users[name])

    def mutate(self, path, data, method="post"):
        return getattr(self.client, method)("/api/" + path, data, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))

    def visible_ids(self, name):
        return set(tiendas_visibles_para(self.users[name]).values_list("pk", flat=True))

    def coverage(self, zone=None):
        zone = zone or self.zone_north
        return {"clientId": zone.cliente_id, "zoneId": zone.pk}

    def user_payload(self, role="technician"):
        return {"username": "created-user", "name": "Usuario creado", "email": "", "password": PASSWORD,
            "role": role, "active": True}

    def store_payload(self):
        return {"name": "Tienda V2", "address": "Dirección", "latitude": "-12.1", "longitude": "-77.1",
            "clientId": self.client_a.pk, "active": True}

    def ticket(self, store=None):
        return Ticket.objects.create(tienda=store or self.north, categoria=self.category, urgencia=self.priority,
            reportado_por=self.users["store"], descripcion="Incidencia para programación")

    def schedule(self, ticket, technician="tech"):
        self.as_user("account")
        return self.mutate(f"tickets/{ticket.pk}/programar/", {"technicianId": self.users[technician].pk,
            "scheduledAt": (timezone.now() + timedelta(days=1)).isoformat(), "priorityId": self.priority.pk,
            "reason": "", "revision": 0})

    def report(self, category, store=None):
        self.as_user("store")
        return self.mutate("tickets/", {"storeId": (store or self.north).pk, "categoryId": category.pk,
            "priorityId": self.priority.pk, "description": "Descripción de incidencia completa", "evidenceIds": []})

    def test_technician_sees_exact_north_pair(self):
        self.assertIn(self.north.pk, self.visible_ids("tech"))

    def test_technician_does_not_see_south_without_coverage(self):
        self.assertNotIn(self.south.pk, self.visible_ids("tech"))

    def test_same_zone_name_does_not_grant_another_client(self):
        self.assertNotIn(self.foreign.pk, self.visible_ids("tech"))

    def test_account_supervisor_uses_same_exact_scope(self):
        self.assertEqual(self.visible_ids("account"), {self.north.pk})

    def test_store_supervisor_sees_only_assigned_store(self):
        self.assertEqual(self.visible_ids("store"), {self.north.pk})

    def test_administrator_sees_all_including_legacy_and_disabled(self):
        self.assertEqual(self.visible_ids("admin"), set(Tienda.objects.values_list("pk", flat=True)))

    def test_new_explicit_coverage_grants_operational_access(self):
        CoberturaUsuario.objects.create(usuario=self.users["tech"], cliente=self.client_a, zona=self.zone_south)
        self.assertIn(self.south.pk, self.visible_ids("tech"))

    def test_direct_assignment_alone_no_longer_authorizes_technician(self):
        CoberturaUsuario.objects.filter(usuario=self.users["tech"]).update(activo=False)
        AsignacionTienda.objects.create(usuario=self.users["tech"], tienda=self.north)
        self.assertEqual(self.visible_ids("tech"), set())

    def test_direct_assignment_alone_no_longer_authorizes_account_supervisor(self):
        CoberturaUsuario.objects.filter(usuario=self.users["account"]).update(activo=False)
        AsignacionTienda.objects.create(usuario=self.users["account"], tienda=self.north)
        self.assertEqual(self.visible_ids("account"), set())

    def test_schedule_accepts_exact_pair_without_direct_store_assignment(self):
        self.assertFalse(AsignacionTienda.objects.filter(usuario=self.users["tech"]).exists())
        response = self.schedule(self.ticket())
        self.assertEqual(response.status_code, 200, response.data)

    def test_wrong_zone_technician_not_returned_or_accepted(self):
        self.as_user("account")
        response = self.client.get("/api/tecnicos/", {"storeId": self.north.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual({u["id"] for u in response.data}, {self.users["tech"].pk})
        response = self.schedule(self.ticket(), "othertech")
        self.assertEqual(response.status_code, 400, response.data)

    def test_legacy_store_has_no_eligible_technicians_and_clear_error(self):
        self.as_user("account")
        self.assertEqual(self.client.get("/api/tecnicos/", {"storeId": self.legacy.pk}).data, [])
        response = self.schedule(self.ticket(self.legacy))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("storeId", response.data)

    def test_enabled_category_visible_to_store_supervisor(self):
        self.as_user("store")
        ids = {c["id"] for c in self.client.get("/api/catalogos/").data["categories"]}
        self.assertIn(self.category.pk, ids)

    def test_non_enabled_category_not_visible(self):
        self.as_user("store")
        ids = {c["id"] for c in self.client.get("/api/catalogos/").data["categories"]}
        self.assertNotIn(self.hidden_category.pk, ids)

    def test_manipulated_category_rejected_server_side(self):
        response = self.report(self.hidden_category)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Ticket.objects.exists())

    def test_admin_zone_create_list_edit_and_safe_delete(self):
        response = self.mutate("admin/zonas/", {"clientId": self.client_a.pk, "name": "Nueva zona", "active": True})
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        self.assertIn(pk, {z["id"] for z in self.client.get("/api/admin/zonas/").data})
        response = self.mutate(f"admin/zonas/{pk}/", {"name": "Zona editada", "active": False}, "patch")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.delete(f"/api/admin/zonas/{self.zone_north.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(Zona.objects.filter(pk=self.zone_north.pk, activo=False).exists())
        self.assertTrue(Tienda.objects.filter(pk=self.north.pk).exists())

    def test_store_rejects_foreign_zone(self):
        response = self.mutate("admin/tiendas/", {**self.store_payload(), "zoneId": self.zone_b.pk})
        self.assertEqual(response.status_code, 400, response.data)

    def test_new_store_requires_zone_and_contact_is_optional(self):
        response = self.mutate("admin/tiendas/", self.store_payload())
        self.assertEqual(response.status_code, 400, response.data)
        response = self.mutate("admin/tiendas/", {**self.store_payload(), "zoneId": self.zone_north.pk})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["contact"], "")

    def test_technician_accepts_multiple_explicit_coverages(self):
        response = self.mutate("admin/usuarios/", {**self.user_payload(), "coverages": [self.coverage(), self.coverage(self.zone_south)]})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data["coverages"]), 2)
        self.assertFalse(AsignacionTienda.objects.filter(usuario_id=response.data["id"]).exists())

    def test_duplicate_coverage_rejected(self):
        response = self.mutate("admin/usuarios/", {**self.user_payload(), "coverages": [self.coverage(), self.coverage()]})
        self.assertEqual(response.status_code, 400, response.data)

    def test_store_supervisor_requires_exactly_one_store(self):
        for ids in ([], [self.north.pk, self.south.pk]):
            with self.subTest(ids=ids):
                response = self.mutate("admin/usuarios/", {**self.user_payload("store_supervisor"), "storeIds": ids})
                self.assertEqual(response.status_code, 400, response.data)
        response = self.mutate("admin/usuarios/", {**self.user_payload("store_supervisor"), "storeIds": [self.south.pk]})
        self.assertEqual(response.status_code, 201, response.data)

    def test_administrator_requires_no_coverage(self):
        response = self.mutate("admin/usuarios/", self.user_payload("administrator"))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["coverages"], [])

    def test_coverage_change_increments_auth_version_once(self):
        user = self.users["tech"]
        before = user.auth_version
        data = {"coverages": [self.coverage(), self.coverage(self.zone_south)]}
        response = self.mutate(f"admin/usuarios/{user.pk}/", data, "patch")
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertEqual(user.auth_version, before + 1)
        response = self.mutate(f"admin/usuarios/{user.pk}/", data, "patch")
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertEqual(user.auth_version, before + 1)

    def test_coverage_change_invalidates_previous_access_token(self):
        authenticated = APIClient()
        login = authenticated.post("/api/auth/login/", {"username": "tech", "password": PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        authenticated.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
        self.assertEqual(authenticated.get("/api/tiendas/").status_code, 200)
        response = self.mutate(f"admin/usuarios/{self.users['tech'].pk}/", {"coverages": [self.coverage(self.zone_south)]}, "patch")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(authenticated.get("/api/tiendas/").status_code, 401)

    def test_started_visit_idempotent_retry_survives_coverage_change(self):
        import hashlib
        from .models import Operacion
        from .serializers import visit_data
        visit = Visita.objects.create(tienda=self.north, tecnico=self.users["tech"], origen="checklist",
            fecha_programada=timezone.now(), iniciado_en=timezone.now(), estado="en_curso")
        path = f"visitas/{visit.pk}/borrador/"
        key = str(uuid.uuid4())
        Operacion.objects.create(usuario=self.users["tech"], clave=key, accion="/api/" + path,
            huella=hashlib.sha256(b"{}").hexdigest(), respuesta=visit_data(visit))
        CoberturaUsuario.objects.filter(usuario=self.users["tech"]).update(activo=False)
        self.as_user("tech")
        response = self.client.post("/api/" + path, {}, format="json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], visit.pk)

    def test_cross_tenant_ids_not_readable_or_schedulable(self):
        self.as_user("account")
        self.assertEqual(self.client.get(f"/api/tiendas/{self.foreign.pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/tecnicos/", {"storeId": self.foreign.pk}).status_code, 404)
        self.assertEqual(self.schedule(self.ticket(self.foreign)).status_code, 404)

    def test_pairs_never_form_a_cartesian_product(self):
        south_b = Zona.objects.create(cliente=self.client_b, nombre="Sur")
        authorized_b = self.store(self.client_b, south_b, "Sur de otro cliente")
        CoberturaUsuario.objects.create(usuario=self.users["tech"], cliente=self.client_b, zona=south_b)
        self.assertEqual(self.visible_ids("tech"), {self.north.pk, authorized_b.pk})

    def test_invalid_coverage_update_preserves_user_and_previous_rows(self):
        user = self.users["tech"]
        before = user.auth_version
        response = self.mutate(f"admin/usuarios/{user.pk}/", {"name": "No debe persistir",
            "coverages": [self.coverage(), {"clientId": self.client_a.pk, "zoneId": self.zone_b.pk}]}, "patch")
        self.assertEqual(response.status_code, 400, response.data)
        user.refresh_from_db()
        self.assertEqual(user.auth_version, before)
        self.assertNotEqual(user.first_name, "No debe persistir")
        self.assertEqual(user.coberturas.filter(activo=True).count(), 1)

    def test_other_client_coverages_redacted_in_users_and_eligible_lists(self):
        CoberturaUsuario.objects.create(usuario=self.users["tech"], cliente=self.client_b, zona=self.zone_b)
        self.as_user("account")
        for path in ("/api/usuarios/", "/api/tecnicos/"):
            with self.subTest(path=path):
                response = self.client.get(path)
                technician = next(u for u in response.data if u["id"] == self.users["tech"].pk)
                self.assertEqual(technician["coverages"], [self.coverage()])
                self.assertEqual(technician["storeIds"], [self.north.pk])

    def test_zone_name_unique_only_within_client(self):
        response = self.mutate("admin/zonas/", {"clientId": self.client_a.pk, "name": self.zone_north.nombre, "active": True})
        self.assertEqual(response.status_code, 400, response.data)
        response = self.mutate("admin/zonas/", {"clientId": self.client_b.pk, "name": "Sur", "active": True})
        self.assertEqual(response.status_code, 201, response.data)

    def test_legacy_store_can_be_edited_and_assigned_explicit_zone(self):
        response = self.mutate(f"admin/tiendas/{self.legacy.pk}/", {"name": "Legacy editada"}, "patch")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data["zoneId"])
        response = self.mutate(f"admin/tiendas/{self.legacy.pk}/", {"zoneId": self.zone_north.pk}, "patch")
        self.assertEqual(response.status_code, 200, response.data)

    def test_non_admin_cannot_manage_territory_or_coverages(self):
        for actor in ("tech", "account", "store"):
            self.as_user(actor)
            for resource in ("zonas", "especialidades", "cliente-especialidades", "usuarios"):
                with self.subTest(actor=actor, resource=resource):
                    self.assertEqual(self.client.get(f"/api/admin/{resource}/").status_code, 403)

    def test_specialty_admin_enable_disable_and_global_active(self):
        response = self.mutate("admin/especialidades/", {"name": "Especialidad creada", "active": True})
        self.assertEqual(response.status_code, 201, response.data)
        category_id = response.data["id"]
        response = self.mutate("admin/cliente-especialidades/", {"clientId": self.client_a.pk, "categoryId": category_id, "active": True})
        self.assertEqual(response.status_code, 201, response.data)
        relation_id = response.data["id"]
        self.as_user("store")
        self.assertIn(category_id, {c["id"] for c in self.client.get("/api/catalogos/").data["categories"]})
        self.as_user("admin")
        response = self.mutate(f"admin/cliente-especialidades/{relation_id}/", {"active": False}, "patch")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.report(CategoriaProblema.objects.get(pk=category_id)).status_code, 400)
        self.as_user("admin")
        self.mutate(f"admin/especialidades/{self.category.pk}/", {"active": False}, "patch")
        self.assertEqual(self.report(self.category).status_code, 400)

    def test_coverage_removal_preserves_only_started_own_work(self):
        started = Visita.objects.create(tienda=self.north, tecnico=self.users["tech"], origen="checklist",
            fecha_programada=timezone.now(), iniciado_en=timezone.now(), estado="en_curso")
        new = Visita.objects.create(tienda=self.north, tecnico=self.users["tech"], origen="checklist",
            fecha_programada=timezone.now())
        CoberturaUsuario.objects.filter(usuario=self.users["tech"]).update(activo=False)
        self.as_user("tech")
        self.assertTrue(visible_visits(self.users["tech"]).filter(pk=started.pk).exists())
        self.assertEqual(self.client.get(f"/api/visitas/{started.pk}/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/tiendas/{self.north.pk}/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/visitas/{new.pk}/").status_code, 404)
        started.estado = "no_realizada"
        started.save(update_fields=["estado"])
        self.assertEqual(self.client.get(f"/api/visitas/{started.pk}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/tiendas/{self.north.pk}/").status_code, 404)

    def test_manipulated_store_and_coverage_ids_rejected(self):
        self.assertEqual(self.report(self.category, self.foreign).status_code, 404)
        self.as_user("admin")
        response = self.mutate("admin/usuarios/", {**self.user_payload(), "coverages": [{"clientId": self.client_a.pk, "zoneId": 999999}]})
        self.assertEqual(response.status_code, 400, response.data)
        response = self.mutate("admin/usuarios/", {**self.user_payload("not-a-role"), "coverages": [self.coverage()]})
        self.assertEqual(response.status_code, 400, response.data)
