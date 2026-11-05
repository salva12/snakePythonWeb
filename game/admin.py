from django.contrib import admin

from .models import HighScore


@admin.register(HighScore)
class HighScoreAdmin(admin.ModelAdmin):
    list_display = ("player_name", "score", "created_at")
    ordering = ("-score", "created_at")
