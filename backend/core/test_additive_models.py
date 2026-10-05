"""Fase 1A: dominio y migración aditiva, sin activar el alcance operativo V2."""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models.deletion import ProtectedError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from .models import (
    AsignacionTienda,
    CategoriaProblema,
    Cliente,
    ClienteEspecialidad,
    CoberturaUsuario,
    Rol,
    Tienda,
    Usuario,
    Zona,
)
from .permissions import tiendas_visibles_para


class AdditiveModelsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.cliente_a = Cliente.objects.create(razon_social="MASS", ruc="FASE1A-MASS")
        cls.cliente_b = Cliente.objects.create(razon_social="ENTEL", ruc="FASE1A-ENTEL")
        cls.zona = Zona.objects.create(cliente=cls.cliente_a, nombre="Lima Norte")
        cls.rol = Rol.objects.create(nombre="Tecnico")
        cls.usuario = Usuario.objects.create_user(username="tecnico-fase1a", rol=cls.rol)
        cls.categoria = CategoriaProblema.objects.create(nombre="Electricidad")

    def tienda(self, **overrides):
        fields = {
            "cliente": self.cliente_a,
            "nombre": "Tienda de prueba",
            "direccion": "Dirección registrada",
            "latitud": "-12.100000",
            "longitud": "-77.100000",
        }
        return Tienda(**{**fields, **overrides})

    def test_zonas_con_mismo_nombre_en_clientes_distintos(self):
        otra = Zona(cliente=self.cliente_b, nombre=self.zona.nombre)
        otra.full_clean()
        otra.save()
        self.assertNotEqual(otra.pk, self.zona.pk)
        self.assertEqual(Zona.objects.filter(nombre="Lima Norte").count(), 2)
        self.assertEqual(str(otra), "ENTEL / Lima Norte")

    def test_zona_duplicada_rechazada_por_dominio_y_db(self):
        duplicate = Zona(cliente=self.cliente_a, nombre=self.zona.nombre)
        with self.assertRaises(ValidationError):
            duplicate.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            duplicate.save()

    def test_cobertura_valida_es_una_combinacion_explicita(self):
        coverage = CoberturaUsuario(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona)
        coverage.full_clean()
        coverage.save()
        self.assertTrue(coverage.activo)
        self.assertIsNotNone(coverage.asignado_en)
        self.assertEqual(self.usuario.coberturas.get().zona_id, self.zona.pk)

    def test_cobertura_duplicada_rechazada_por_dominio_y_db(self):
        CoberturaUsuario.objects.create(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona)
        duplicate = CoberturaUsuario(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona, activo=False)
        with self.assertRaises(ValidationError):
            duplicate.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            duplicate.save()

    def test_cobertura_inconsistente_rechazada_por_clean_y_create(self):
        fields = {"usuario": self.usuario, "cliente": self.cliente_b, "zona": self.zona}
        with self.assertRaises(ValidationError) as error:
            CoberturaUsuario(**fields).full_clean()
        self.assertIn("zona", error.exception.message_dict)
        with self.assertRaises(ValidationError):
            CoberturaUsuario.objects.create(**fields)
        self.assertFalse(CoberturaUsuario.objects.exists())

    def test_cambio_de_cliente_en_cobertura_no_persiste_inconsistencia(self):
        coverage = CoberturaUsuario.objects.create(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona)
        coverage.cliente = self.cliente_b
        with self.assertRaises(ValidationError):
            coverage.save(update_fields=["cliente"])
        coverage.refresh_from_db()
        self.assertEqual(coverage.cliente_id, self.cliente_a.pk)

    def test_tienda_con_zona_de_su_cliente(self):
        store = self.tienda(zona=self.zona)
        store.full_clean()
        store.save()
        self.assertEqual(self.zona.tiendas.get().pk, store.pk)

    def test_tienda_con_zona_de_otro_cliente_rechazada(self):
        store = self.tienda(cliente=self.cliente_b, zona=self.zona)
        with self.assertRaises(ValidationError) as error:
            store.full_clean()
        self.assertIn("zona", error.exception.message_dict)
        with self.assertRaises(ValidationError):
            store.save()
        self.assertFalse(Tienda.objects.exists())

    def test_cambio_de_zona_en_tienda_no_persiste_inconsistencia(self):
        store = self.tienda()
        store.save()
        zona_b = Zona.objects.create(cliente=self.cliente_b, nombre="Lima Norte")
        store.zona = zona_b
        with self.assertRaises(ValidationError):
            store.save(update_fields=["zona"])
        store.refresh_from_db()
        self.assertIsNone(store.zona_id)

    def test_tienda_legacy_sin_zona_temporalmente_permitida(self):
        store = self.tienda()
        store.full_clean()
        store.save()
        store.refresh_from_db()
        self.assertIsNone(store.zona_id)

    def test_update_fields_valida_combinacion_persistida_en_tienda(self):
        store = self.tienda(zona=self.zona)
        store.save()
        zona_b = Zona.objects.create(cliente=self.cliente_b, nombre="Lima Norte")
        store.cliente = self.cliente_b
        store.zona = zona_b
        for field in ("cliente", "zona"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                store.save(update_fields=[field])
        store.save(update_fields=["cliente", "zona"])
        store.refresh_from_db()
        self.assertEqual((store.cliente_id, store.zona_id), (self.cliente_b.pk, zona_b.pk))

    def test_update_fields_valida_combinacion_persistida_en_cobertura(self):
        coverage = CoberturaUsuario.objects.create(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona)
        zona_b = Zona.objects.create(cliente=self.cliente_b, nombre="Lima Norte")
        coverage.cliente = self.cliente_b
        coverage.zona = zona_b
        for field in ("cliente", "zona"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                coverage.save(update_fields=[field])
        coverage.save(update_fields=["cliente", "zona"])
        coverage.refresh_from_db()
        self.assertEqual((coverage.cliente_id, coverage.zona_id), (self.cliente_b.pk, zona_b.pk))

    def test_zona_no_puede_cambiar_cliente_de_tiendas_existentes(self):
        self.tienda(zona=self.zona).save()
        self.zona.cliente = self.cliente_b
        with self.assertRaises(ValidationError):
            self.zona.save(update_fields=["cliente"])
        self.zona.refresh_from_db()
        self.assertEqual(self.zona.cliente_id, self.cliente_a.pk)

    def test_zona_no_puede_cambiar_cliente_de_coberturas_existentes(self):
        CoberturaUsuario.objects.create(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona)
        self.zona.cliente = self.cliente_b
        with self.assertRaises(ValidationError):
            self.zona.save(update_fields=["cliente"])
        self.zona.refresh_from_db()
        self.assertEqual(self.zona.cliente_id, self.cliente_a.pk)

    def test_especialidad_habilitada_para_cliente(self):
        relation = ClienteEspecialidad(cliente=self.cliente_a, categoria=self.categoria)
        relation.full_clean()
        relation.save()
        self.assertTrue(relation.activo)
        self.assertIsNotNone(relation.habilitada_en)

    def test_cliente_especialidad_duplicada_rechazada_por_dominio_y_db(self):
        ClienteEspecialidad.objects.create(cliente=self.cliente_a, categoria=self.categoria)
        duplicate = ClienteEspecialidad(cliente=self.cliente_a, categoria=self.categoria, activo=False)
        with self.assertRaises(ValidationError):
            duplicate.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            duplicate.save()

    def test_categoria_global_habilitable_en_dos_clientes(self):
        for cliente in (self.cliente_a, self.cliente_b):
            ClienteEspecialidad.objects.create(cliente=cliente, categoria=self.categoria)
        self.assertEqual(CategoriaProblema.objects.count(), 1)
        self.assertEqual(self.categoria.clientes_habilitados.count(), 2)

    def test_asignacion_tienda_sigue_siendo_el_alcance_vigente(self):
        store = self.tienda()
        store.save()
        assignment = AsignacionTienda.objects.create(usuario=self.usuario, tienda=store)
        self.assertIn(store, tiendas_visibles_para(self.usuario))
        assignment.activo = False
        assignment.save(update_fields=["activo"])
        self.assertNotIn(store, tiendas_visibles_para(self.usuario))

    def test_cobertura_nueva_no_concede_permisos_en_fase_1a(self):
        store = self.tienda(zona=self.zona)
        store.save()
        CoberturaUsuario.objects.create(usuario=self.usuario, cliente=self.cliente_a, zona=self.zona)
        self.assertNotIn(store, tiendas_visibles_para(self.usuario))

    def test_zona_y_categoria_referenciadas_estan_protegidas(self):
        self.tienda(zona=self.zona).save()
        ClienteEspecialidad.objects.create(cliente=self.cliente_a, categoria=self.categoria)
        with self.assertRaises(ProtectedError):
            self.zona.delete()
        with self.assertRaises(ProtectedError):
            self.categoria.delete()


class AdditiveMigrationTests(TransactionTestCase):
    migrate_from = [("core", "0016_remove_legacy_duplicate_fields")]
    migrate_to = [("core", "0017_zona_cobertura_usuario_cliente_especialidad")]

    def setUp(self):
        super().setUp()
        # MigrationExecutor solo opera sobre la base creada por el runner de tests.
        self.addCleanup(self.restore_latest_schema)
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        self.old_apps = executor.loader.project_state(self.migrate_from).apps

    def restore_latest_schema(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def apply_migration(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        return executor.loader.project_state(self.migrate_to).apps

    def test_esquema_nuevo_no_inventa_zonas_coberturas_o_habilitaciones(self):
        apps = self.apply_migration()
        for name in ("Zona", "CoberturaUsuario", "ClienteEspecialidad"):
            self.assertEqual(apps.get_model("core", name).objects.count(), 0)
        self.assertTrue(apps.get_model("core", "Tienda")._meta.get_field("zona").null)

    def test_upgrade_con_datos_preserva_tiendas_asignaciones_e_historial(self):
        def old(name):
            return self.old_apps.get_model("core", name)

        cliente = old("Cliente").objects.create(razon_social="Cliente anterior", ruc="LEGACY-0017")
        role = old("Rol").objects.create(nombre="Tecnico")
        usuario = old("Usuario").objects.create(username="legacy-tecnico", rol=role,
                                               password_initialized=True, auth_version=7)
        tienda = old("Tienda").objects.create(cliente=cliente, nombre="Tienda anterior", direccion="Dirección anterior",
                                              latitud="-12.123456", longitud="-77.123456", contacto="Contacto anterior")
        old("AsignacionTienda").objects.create(usuario=usuario, tienda=tienda)
        categoria = old("CategoriaProblema").objects.create(nombre="Categoría anterior")
        urgency = old("NivelUrgencia").objects.create(nombre="Alta", sla_primera_respuesta_horas=2, sla_resolucion_horas=24)
        ticket = old("Ticket").objects.create(tienda=tienda, categoria=categoria, urgencia=urgency,
                                              reportado_por=usuario, descripcion="Incidencia anterior")
        old("Visita").objects.create(tienda=tienda, origen="ticket", ticket_origen=ticket,
                                     fecha_programada=timezone.now(), tienda_snapshot={"name": "Nombre histórico"})
        names = ("Cliente", "Rol", "Usuario", "Tienda", "AsignacionTienda", "CategoriaProblema", "NivelUrgencia", "Ticket", "Visita")
        before = {name: list(old(name).objects.order_by("pk").values()) for name in names}
        apps = self.apply_migration()
        for name in names:
            with self.subTest(model=name):
                fields = list(before[name][0])
                self.assertEqual(list(apps.get_model("core", name).objects.order_by("pk").values(*fields)), before[name])
        self.assertIsNone(apps.get_model("core", "Tienda").objects.get(pk=tienda.pk).zona_id)
        for name in ("Zona", "CoberturaUsuario", "ClienteEspecialidad"):
            self.assertEqual(apps.get_model("core", name).objects.count(), 0)
