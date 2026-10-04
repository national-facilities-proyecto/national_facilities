import os

# Solo pruebas/entorno aislado; nunca cambia el motor a SQLite.
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-that-is-long-enough-for-jwt")
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver")
os.environ.setdefault("POSTGRES_DB", "nf_integration")
os.environ.setdefault("POSTGRES_USER", "nf_test")
os.environ.setdefault("POSTGRES_PASSWORD", "")
os.environ.setdefault("POSTGRES_HOST", "127.0.0.1")
os.environ.setdefault("POSTGRES_PORT", "55432")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5174")
from .settings import *  # noqa: F403, E402

if DATABASES["default"]["NAME"] != "nf_integration":  # noqa: F405
    raise RuntimeError("config.test_settings requiere la base aislada nf_integration.")

MEDIA_ROOT = BASE_DIR.parent / ".integration" / "media"  # noqa: F405
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
