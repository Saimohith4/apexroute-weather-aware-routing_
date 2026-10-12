#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
# Ensure production tables exist before serving requests. For multi-instance production,
# move this command to the platform's pre-deploy migration step instead.
python manage.py migrate --noinput
exec gunicorn config.wsgi:application --workers 1 --threads 2 --timeout 120
