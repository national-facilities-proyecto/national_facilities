from rest_framework import serializers

from .models import (
    Evidencia, Tienda, Visita, Cliente, Contrato,
    PlantillaChecklist, ItemPlantilla, Usuario,
)


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


class VisitaSerializer(serializers.ModelSerializer):
    tienda = TiendaSerializer(read_only=True)

    class Meta:
        model = Visita
        fields = [
            "id", "tienda", "origen", "tecnico", "ticket_origen",
            "fecha_programada", "estado", "justificacion",
        ]
        read_only_fields = fields


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ["id", "razon_social", "ruc", "contacto_nombre", "contacto_email"]


class TiendaAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = ["id", "cliente", "nombre", "direccion", "latitud", "longitud"]


class ContratoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contrato
        fields = [
            "id", "cliente", "plantilla_checklist", "frecuencia_visitas_mensual",
            "minimo_intervenciones_mensual", "radio_validacion_metros",
            "fecha_inicio", "fecha_fin", "activo",
        ]


class PlantillaChecklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantillaChecklist
        fields = ["id", "nombre", "version", "activa"]


class ItemPlantillaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemPlantilla
        fields = ["id", "plantilla", "descripcion", "orden", "activo"]


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "telefono", "rol", "is_active", "password",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "La contraseña es obligatoria al crear un usuario."})
        usuario = Usuario(**validated_data)
        usuario.set_password(password)
        usuario.save()
        return usuario

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        if password:
            instance.set_password(password)
        instance.save()
        return instance