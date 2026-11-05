from django.urls import path

from . import views


urlpatterns = [
    path("", views.index, name="home"),
    path("scores/", views.scores, name="scores"),
]
