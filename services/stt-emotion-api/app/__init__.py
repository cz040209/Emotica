from flask import Flask

from .config import Settings
from .routes import api
from .services import load_inference_bundle


def create_app() -> Flask:
    app = Flask(__name__)

    settings = Settings()
    app.config["MAX_CONTENT_LENGTH"] = settings.max_content_length_bytes
    app.config["INFERENCE_BUNDLE"] = load_inference_bundle(settings)

    app.register_blueprint(api)
    return app
