"""Regresiones del traspaso: contraseñas, usuarios y supervisor MASS único."""
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
from threading import Barrier

from django.core.management import call_command
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from .models import AsignacionTienda, Evento, Tienda, Usuario
from .tests import PASSWORD, fixtures


class DeliveryFixTests(TestCase):
    def setUp(self):
        self.users, self.store, *_ = fixtures()
        self.client = APIClient()
        self.client.force_authenticate(self.users["admin"])

    def save_user(self, data, user=None):
        path = "/api/admin/usuarios/"
        method = self.client.post
        if user:
            path += f"{user.pk}/"
            method = self.client.patch
        return method(path, data, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))

    def payload(self, **extra):
        return {"username": "new-mass", "name": "Nuevo supervisor", "email": "",
                "password": PASSWORD, "role": "store_supervisor", "active": True,
                "storeIds": [self.store.pk], **extra}

    def free_store(self):
        return Tienda.objects.create(cliente=self.store.cliente, zona=self.store.zona,
            nombre="Tienda libre", direccion="Dirección", latitud="-12.1", longitud="-77.1")

    def test_first_password_must_change_for_every_role_without_mutating_session(self):
        for name in ("tech", "store", "account", "admin"):
            with self.subTest(role=name):
                user = self.users[name]
                user.password_initialized = False
                user.save(update_fields=["password_initialized"])
                previous_version = user.auth_version
                self.client.force_authenticate(user)
                response = self.client.post("/api/auth/password/",
                    {"password": PASSWORD, "confirmation": PASSWORD}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("diferente", str(response.data["password"]))
                user.refresh_from_db()
                self.assertFalse(user.password_initialized)
                self.assertEqual(user.auth_version, previous_version)
                self.assertTrue(user.check_password(PASSWORD))

    def test_distinct_first_password_initializes_and_revokes_old_session(self):
        user = self.users["tech"]
        user.password_initialized = False
        user.save(update_fields=["password_initialized"])
        self.client.force_authenticate(user)
        previous_version = user.auth_version
        new_password = "A-different-secure-2026!"
        response = self.client.post("/api/auth/password/",
            {"password": new_password, "confirmation": new_password}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertTrue(user.password_initialized)
        self.assertTrue(user.check_password(new_password))
        self.assertEqual(user.auth_version, previous_version + 1)

    def test_initialized_user_cannot_reuse_current_password(self):
        self.client.force_authenticate(self.users["tech"])
        response = self.client.post("/api/auth/password/",
            {"currentPassword": PASSWORD, "password": PASSWORD, "confirmation": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("password", response.data)

    def test_username_whitespace_has_explicit_error_and_is_not_trimmed(self):
        for username in ("new mass", " new-mass", "new-mass ", "new\tmass", "new\u00a0mass"):
            with self.subTest(username=username):
                response = self.save_user(self.payload(username=username, role="administrator", storeIds=[]))
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("espacios", str(response.data["username"]))
        self.assertFalse(Usuario.objects.filter(username="new-mass").exists())

    def test_username_edit_rejects_spaces_and_preserves_existing_user(self):
        response = self.save_user({"username": "bad user"}, self.users["tech"])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("espacios", str(response.data["username"]))
        self.users["tech"].refresh_from_db()
        self.assertEqual(self.users["tech"].username, "tech")

    def test_valid_username_and_unique_validation_still_work(self):
        payload = self.payload(username="válido.user+_@-1", role="administrator", storeIds=[])
        self.assertEqual(self.save_user(payload).status_code, 201)
        self.assertEqual(self.save_user(payload).status_code, 400)

    def test_occupied_store_rejects_second_active_supervisor_without_partial_records(self):
        before_events = Evento.objects.count()
        response = self.save_user(self.payload())
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("supervisor", str(response.data["storeIds"]))
        self.assertFalse(Usuario.objects.filter(username="new-mass").exists())
        self.assertEqual(Evento.objects.count(), before_events)

    def test_free_store_accepts_one_supervisor_and_self_edit(self):
        store = self.free_store()
        response = self.save_user(self.payload(storeIds=[store.pk]))
        self.assertEqual(response.status_code, 201, response.data)
        user = Usuario.objects.get(pk=response.data["id"])
        response = self.save_user({"name": "Nombre corregido", "storeIds": [store.pk]}, user)
        self.assertEqual(response.status_code, 200, response.data)

    def test_assignment_edit_cannot_take_occupied_store(self):
        store = self.free_store()
        response = self.save_user(self.payload(storeIds=[store.pk]))
        user = Usuario.objects.get(pk=response.data["id"])
        response = self.save_user({"storeIds": [self.store.pk]}, user)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(list(user.tiendas_asignadas.filter(activo=True).values_list("tienda_id", flat=True)), [store.pk])

    def test_inactive_supervisor_does_not_reserve_store_but_reactivation_is_checked(self):
        response = self.save_user(self.payload(active=False))
        self.assertEqual(response.status_code, 201, response.data)
        user = Usuario.objects.get(pk=response.data["id"])
        response = self.save_user({"active": True}, user)
        self.assertEqual(response.status_code, 400, response.data)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_deactivation_releases_store_and_old_supervisor_cannot_reactivate(self):
        existing = self.users["store"]
        self.assertEqual(self.save_user({"active": False}, existing).status_code, 200)
        self.assertEqual(self.save_user(self.payload()).status_code, 201)
        self.assertEqual(self.save_user({"active": True}, existing).status_code, 400)

    def test_inactive_assignment_does_not_reserve_store(self):
        AsignacionTienda.objects.filter(usuario=self.users["store"]).update(activo=False)
        self.assertEqual(self.save_user(self.payload()).status_code, 201)

    def test_role_change_into_store_supervisor_checks_occupancy(self):
        response = self.save_user({"role": "store_supervisor", "storeIds": [self.store.pk], "coverages": []}, self.users["tech"])
        self.assertEqual(response.status_code, 400, response.data)
        self.users["tech"].refresh_from_db()
        self.assertEqual(self.users["tech"].rol.nombre, "Tecnico")

    def test_audit_reports_legacy_duplicates_without_changing_assignments(self):
        duplicate = Usuario.objects.create_user(username="legacy-mass", password=PASSWORD,
            rol=self.users["store"].rol, password_initialized=True)
        AsignacionTienda.objects.create(usuario=duplicate, tienda=self.store)
        output = StringIO()
        call_command("audit_integrity", stdout=output)
        result = json.loads(output.getvalue())
        self.assertEqual(result["multipleActiveStoreSupervisors"],
            [{"storeId": self.store.pk, "userIds": sorted([self.users["store"].pk, duplicate.pk])}])
        self.assertEqual(AsignacionTienda.objects.filter(tienda=self.store, activo=True).count(), 2)


class ConcurrentSupervisorTests(TransactionTestCase):
    def test_concurrent_creates_cannot_assign_two_supervisors_to_free_store(self):
        users, store, *_ = fixtures()
        AsignacionTienda.objects.filter(tienda=store).update(activo=False)
        barrier = Barrier(2)

        def create(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(Usuario.objects.get(pk=users["admin"].pk))
                barrier.wait(timeout=10)
                response = client.post("/api/admin/usuarios/", {
                    "username": f"concurrent-mass-{index}", "name": "Supervisor concurrente",
                    "password": PASSWORD, "role": "store_supervisor", "active": True,
                    "storeIds": [store.pk]}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(create, range(2)))
        self.assertEqual(sorted(statuses), [201, 400])
        self.assertEqual(AsignacionTienda.objects.filter(tienda=store, activo=True, usuario__is_active=True).count(), 1)
