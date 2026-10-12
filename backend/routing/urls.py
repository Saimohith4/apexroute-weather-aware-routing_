from django.urls import path
from .views import (
    health_check,
    analyze_route_view,
    location_suggestions_view,
)

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("analyze-route/", analyze_route_view, name="analyze-route"),
    path(
        "location-suggestions/",
        location_suggestions_view,
        name="location-suggestions",
    ),
    
]
