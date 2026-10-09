from rest_framework import serializers


class AnswerSerializer(serializers.Serializer):
    taskId = serializers.IntegerField(min_value=1)
    result = serializers.ChoiceField(
        choices=["conforme", "no_conforme", "no_aplica"],
        required=False,
        allow_null=True,
    )
    observation = serializers.CharField(
        allow_blank=True, max_length=500, trim_whitespace=False
    )
    evidenceIds = serializers.ListField(child=serializers.UUIDField(), max_length=5)


class DraftSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    answers = AnswerSerializer(many=True)
    workDescription = serializers.CharField(
        allow_blank=True, max_length=5000, trim_whitespace=False
    )
    evidenceIds = serializers.ListField(child=serializers.UUIDField(), max_length=5)


class ExceptionInputSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["time_limit", "location"])
    reason = serializers.CharField(min_length=10, max_length=500)
    failure = serializers.CharField(max_length=50, required=False, allow_blank=True)
    revision = serializers.IntegerField(min_value=0, required=False)
    scope = serializers.ChoiceField(
        choices=["arrival", "closure", "form", "legacy"], required=False
    )
    location = serializers.JSONField(required=False, allow_null=True)
    evidenceId = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if attrs["type"] == "time_limit":
            if attrs.get("scope", "form") not in ("form", "legacy"):
                raise serializers.ValidationError(
                    {"scope": "La demora corresponde al formulario."}
                )
            if "location" in attrs:
                raise serializers.ValidationError(
                    {"location": "La demora no recibe GPS."}
                )
            attrs.setdefault("scope", "form")
        elif "scope" not in attrs:
            raise serializers.ValidationError(
                {"scope": "Indica arrival o closure; no se infiere la etapa GPS."}
            )
        elif attrs["scope"] not in ("arrival", "closure", "legacy"):
            raise serializers.ValidationError(
                {"scope": "El GPS corresponde a llegada o cierre."}
            )
        return attrs


class ReviewInputSerializer(serializers.Serializer):
    exceptionId = serializers.IntegerField(min_value=1)
    approved = serializers.BooleanField()
    reason = serializers.CharField(min_length=10, max_length=500)
    revision = serializers.IntegerField(min_value=0)
    exceptionRevision = serializers.IntegerField(min_value=0)


class ReviewSubmissionSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    exceptions = ExceptionInputSerializer(many=True, required=False, default=list)

    def to_internal_value(self, data):
        if isinstance(data, dict) and "location" in data:
            raise serializers.ValidationError(
                {
                    "location": "El envío usa el cierre físico persistido; no recibe GPS nuevo."
                }
            )
        return super().to_internal_value(data)


class CompletionSerializer(ReviewSubmissionSerializer):
    pass
