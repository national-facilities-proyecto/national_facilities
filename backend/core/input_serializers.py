from rest_framework import serializers


class AnswerSerializer(serializers.Serializer):
    taskId = serializers.IntegerField(min_value=1)
    result = serializers.ChoiceField(choices=["conforme", "no_conforme", "no_aplica"], required=False, allow_null=True)
    observation = serializers.CharField(allow_blank=True, max_length=500, trim_whitespace=False)
    evidenceIds = serializers.ListField(child=serializers.UUIDField(), max_length=5)


class DraftSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    answers = AnswerSerializer(many=True)
    workDescription = serializers.CharField(allow_blank=True, max_length=5000, trim_whitespace=False)
    evidenceIds = serializers.ListField(child=serializers.UUIDField(), max_length=5)


class ExceptionInputSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["time_limit", "location"])
    reason = serializers.CharField(min_length=10, max_length=500)
    failure = serializers.CharField(max_length=50, required=False, allow_blank=True)
    revision = serializers.IntegerField(min_value=0, required=False)


class ReviewInputSerializer(serializers.Serializer):
    exceptionId = serializers.IntegerField(min_value=1)
    approved = serializers.BooleanField()
    reason = serializers.CharField(min_length=10, max_length=500)
    revision = serializers.IntegerField(min_value=0)
    exceptionRevision = serializers.IntegerField(min_value=0)


class ReviewSubmissionSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    location = serializers.JSONField(required=False)
    exceptions = ExceptionInputSerializer(many=True)
