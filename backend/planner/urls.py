from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("routes/plan", views.plan_routes, name="plan-routes"),
    path("routes/analyze", views.analyze_routes, name="analyze-routes"),
    path("locations/search", views.search_locations, name="search-locations"),
]
