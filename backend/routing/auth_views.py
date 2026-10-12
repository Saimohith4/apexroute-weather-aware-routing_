import json
import re

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.middleware.csrf import get_token

import logging
logger = logging.getLogger(__name__)

User = get_user_model()



def serialize_user(user):
    return {
        "id": user.id,
        "username": user.get_username(),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


def read_json(request):
    try:
        return json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})

@require_GET
@ensure_csrf_cookie
def current_user(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Not authenticated."}, status=401)
    return JsonResponse({"user": serialize_user(request.user)})



@require_POST
@csrf_protect
def register(request):
    try:
        data = read_json(request)
        if not isinstance(data, dict):
            return JsonResponse({"error": "Send valid JSON."}, status=400)

        full_name = str(data.get("full_name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))

        if not full_name:
            return JsonResponse({"error": "Enter your full name."}, status=400)
        if not email or not re.fullmatch(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            return JsonResponse({"error": "Enter a valid email address."}, status=400)
        if len(password) < 8:
            return JsonResponse({"error": "Password must contain at least 8 characters."}, status=400)
        if User.objects.filter(email__iexact=email).exists():
            return JsonResponse({"error": "An account with this email already exists."}, status=409)

        base_username = re.sub(r"[^a-zA-Z0-9_.@+-]", "", email.split("@")[0]) or "user"
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base_username}{suffix}"

        names = full_name.split(maxsplit=1)
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=names[0],
            last_name=names[1] if len(names) > 1 else "",
        )
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return JsonResponse({"user": serialize_user(user)}, status=201)
    except Exception:
        logger.exception("Unexpected error in register")
        return JsonResponse(
            {"error": "Account creation failed due to a server error."},
            status=500,
        )


@require_POST
@csrf_protect
def login_user(request):
    try:
        data = read_json(request)
        if not isinstance(data, dict):
            return JsonResponse({"error": "Send valid JSON."}, status=400)

        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))

        if not email or not password:
            return JsonResponse(
                {"error": "Enter your email and password."},
                status=400,
            )

        user_record = User.objects.filter(email__iexact=email).first()
        if user_record is None:
            return JsonResponse(
                {"error": "Invalid email or password."},
                status=401,
            )

        user = authenticate(
            request,
            username=user_record.get_username(),
            password=password,
        )

        if user is None:
            return JsonResponse(
                {"error": "Invalid email or password."},
                status=401,
            )

        login(
            request,
            user,
            backend="django.contrib.auth.backends.ModelBackend",
        )

        return JsonResponse({"user": serialize_user(user)})

    except Exception:
        logger.exception("Unexpected error in login_user")
        return JsonResponse(
            {"error": "Login failed due to a server error."},
            status=500,
        )



@require_POST
@csrf_protect
def logout_user(request):
    logout(request)
    return JsonResponse({"message": "Signed out successfully."})
