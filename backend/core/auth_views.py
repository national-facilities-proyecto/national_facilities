from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from .models import Usuario
from .permissions import rol_de, tiendas_visibles_para
from rest_framework.authentication import BaseAuthentication
from rest_framework import serializers


class LoginInput(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=4096, trim_whitespace=False)


class RefreshInput(serializers.Serializer):
    refresh = serializers.CharField(max_length=16384, required=False, default="", allow_blank=True)


class PasswordInput(serializers.Serializer):
    password = serializers.CharField(max_length=4096, trim_whitespace=False)
    confirmation = serializers.CharField(max_length=4096, trim_whitespace=False)
    currentPassword = serializers.CharField(max_length=4096, trim_whitespace=False,
                                            required=False, default="", allow_blank=True)


class PublicAuthentication(BaseAuthentication):
    def authenticate(self, request):
        return None

    def authenticate_header(self, request):
        return "Bearer"


def identity(user):
    return {"id": user.pk, "username": user.username, "name": user.get_full_name() or user.username,
            "email": user.email, "role": rol_de(user), "storeIds": list(tiendas_visibles_para(user).values_list("id", flat=True)),
            "active": user.is_active, "passwordInitialized": user.password_initialized}


def session(user):
    token = RefreshToken.for_user(user)
    token["version"] = user.auth_version
    access = token.access_token
    return {"access": str(access), "refresh": str(token), "expiresAt": access["exp"] * 1000, "user": identity(user)}


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [PublicAuthentication]

    def post(self, request):
        serializer = LoginInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(**serializer.validated_data)
        if not user or not user.is_active or not rol_de(user):
            raise AuthenticationFailed("Usuario, contraseña o rol inválidos.")
        return Response(session(user))


class MeView(APIView):
    allow_password_setup = True

    def get(self, request):
        return Response(identity(request.user))


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [PublicAuthentication]

    @transaction.atomic
    def post(self, request):
        serializer = RefreshInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            user = Usuario.objects.select_for_update().get(pk=token["user_id"])
            token.check_blacklist()
            if not user.is_active or not rol_de(user) or token.get("version") != user.auth_version:
                raise AuthenticationFailed("Sesión revocada.")
            token.blacklist()
            return Response(session(user))
        except (TokenError, Usuario.DoesNotExist, KeyError):
            raise AuthenticationFailed("La sesión ha expirado.")


class LogoutView(APIView):
    allow_password_setup = True

    @transaction.atomic
    def post(self, request):
        user = Usuario.objects.select_for_update().get(pk=request.user.pk)
        user.auth_version += 1
        user.save(update_fields=["auth_version"])
        return Response(status=204)


class PasswordView(APIView):
    allow_password_setup = True

    @transaction.atomic
    def post(self, request):
        serializer = PasswordInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = Usuario.objects.select_for_update().get(pk=request.user.pk)
        if user.password_initialized and not user.check_password(data["currentPassword"]):
            raise ValidationError({"currentPassword": "La contraseña actual no es correcta."})
        password = data["password"]
        if password != data["confirmation"]:
            raise ValidationError({"confirmation": "Las contraseñas no coinciden."})
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise ValidationError({"password": exc.messages})
        user.set_password(password)
        user.password_initialized = True
        user.auth_version += 1
        user.save(update_fields=["password", "password_initialized", "auth_version"])
        return Response(session(user))
