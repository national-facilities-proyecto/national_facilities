import os
from django.conf import settings
from django.core.checks import Error, register


@register()
def durable_storage_in_cloud(app_configs, **kwargs):
    if os.environ.get("K_SERVICE") and settings.STORAGES["default"]["BACKEND"] == "django.core.files.storage.FileSystemStorage":
        return [Error("Cloud Run requiere almacenamiento duradero privado. Configura GS_BUCKET_NAME y las credenciales de servicio.", id="core.E001")]
    return []
