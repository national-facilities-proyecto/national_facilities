from rest_framework import serializers
from .models import Evidencia
from .models import Tienda


class TiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = ["id", "nombre", "direccion", "latitud", "longitud", "cliente"]

class EvidenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidencia
        fields = ["id", "checklist", "foto", "descripcion", "subida_en"]
        read_only_fields = ["subida_en"]

    def validate_checklist(self, checklist):
        usuario = self.context["request"].user
        if checklist.visita.tecnico != usuario:
            raise serializers.ValidationError("No puedes subir evidencia a un checklist que no es tuyo.")
        return checklist