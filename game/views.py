import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_http_methods

from .models import HighScore


@require_GET
def index(request):
    scores = HighScore.objects.all()[:10]
    return render(request, "game/index.html", {"high_scores": scores})


@require_http_methods(["GET", "POST"])
def scores(request):
    if request.method == "GET":
        return JsonResponse({"scores": _top_scores()})

    try:
        payload = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Send valid JSON."}, status=400)

    if not isinstance(payload, dict):
        return JsonResponse({"error": "Expected a JSON object."}, status=400)

    score = payload.get("score")
    player_name = payload.get("name", "Player")
    if type(score) is not int or not 0 <= score <= 1_000_000:
        return JsonResponse({"error": "Score must be a whole number from 0 to 1,000,000."}, status=400)
    if not isinstance(player_name, str):
        return JsonResponse({"error": "Name must be text."}, status=400)

    player_name = player_name.strip()[:16] or "Player"
    HighScore.objects.create(player_name=player_name, score=score)
    return JsonResponse({"scores": _top_scores()}, status=201)


def _top_scores():
    return [
        {"name": entry.player_name, "score": entry.score}
        for entry in HighScore.objects.all()[:10]
    ]
