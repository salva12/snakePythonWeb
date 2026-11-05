from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="HighScore",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("player_name", models.CharField(default="Player", max_length=16)),
                ("score", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-score", "created_at"]},
        ),
    ]
