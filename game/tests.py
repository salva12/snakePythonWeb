import json

from django.test import TestCase
from django.urls import reverse

from .models import HighScore


class GameViewTests(TestCase):
    def test_home_page_loads(self):
        response = self.client.get(reverse("home"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Ready to play?")
        self.assertRegex(
            response.content.decode(),
            r'<meta name="csrf-token" content="[^"]+">',
        )
        self.assertContains(response, 'id="music-toggle"')
        self.assertContains(response, 'aria-pressed="true"')
        self.assertContains(response, 'type="image/svg+xml"')
        self.assertContains(response, "game/snake.svg")
        self.assertContains(response, "Collect eggs to grow")
        self.assertContains(response, "cracks after 6.5 seconds")
        self.assertContains(response, "Portals stay in place")

    def test_score_is_saved_and_returned(self):
        response = self.client.post(
            reverse("scores"),
            data=json.dumps({"score": 40, "name": "  Snake  "}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["scores"][0], {"name": "Snake", "score": 40})
        self.assertEqual(HighScore.objects.count(), 1)

    def test_score_rejects_non_integer_values(self):
        for score in (True, -1, 1.5, "20", 1_000_001):
            with self.subTest(score=score):
                response = self.client.post(
                    reverse("scores"),
                    data=json.dumps({"score": score}),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 400)
        self.assertEqual(HighScore.objects.count(), 0)

    def test_score_rejects_invalid_json(self):
        response = self.client.post(
            reverse("scores"), data="{", content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
