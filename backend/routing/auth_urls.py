from django.urls import path
from . import auth_views

urlpatterns = [
    path("me/", auth_views.current_user, name="auth-current-user"),
    path("register/", auth_views.register, name="auth-register"),
    path("login/", auth_views.login_user, name="auth-login"),
    path("logout/", auth_views.logout_user, name="auth-logout"),
    path("csrf/", auth_views.csrf_token, name="auth-csrf"),
]
