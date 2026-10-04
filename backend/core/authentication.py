from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from .permissions import rol_de


class SessionAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not rol_de(user) or validated_token.get("version") != user.auth_version:
            raise AuthenticationFailed("Sesión revocada o rol inválido.")
        return user
