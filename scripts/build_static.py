import os
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "snake_site.settings")
    import django

    django.setup()

    from django.template.loader import render_to_string

    output = ROOT / "_site"
    output.mkdir(exist_ok=True)

    html = render_to_string(
        "game/index.html",
        {"high_scores": [], "csrf_token": "", "score_storage": "local"},
    )
    html = html.replace('="/static/', '="static/')
    (output / "index.html").write_text(html, encoding="utf-8")
    shutil.copytree(
        ROOT / "game" / "static" / "game",
        output / "static" / "game",
        dirs_exist_ok=True,
    )


if __name__ == "__main__":
    main()
