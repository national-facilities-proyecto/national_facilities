from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0015_remove_cliente_nombre_comercial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="usuario",
            name="password_inicializada",
        ),
        migrations.RemoveField(
            model_name="itemplantilla",
            name="foto_requerida",
        ),
        migrations.RemoveField(
            model_name="visita",
            name="iniciada_en",
        ),
        migrations.RemoveField(
            model_name="visita",
            name="completada_en",
        ),
    ]
