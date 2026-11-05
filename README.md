# Viborita

A browser-based Snake game served by Django. The game runs in the browser, and Django stores the top scores in SQLite.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open http://127.0.0.1:8000/ to play. Use the arrow keys or WASD to steer, Space to pause, and Enter to start or restart.

For deployment, set `DJANGO_SECRET_KEY` to a secure secret, set `DJANGO_DEBUG=0`, and set `DJANGO_ALLOWED_HOSTS` to a comma-separated list of host names.
