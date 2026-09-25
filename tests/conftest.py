import io

import pytest
from PIL import Image, ImageDraw

import processing
from app import create_app


def fake_remove(image, session, alpha_matting=False):
    result = image.convert("RGBA")
    mask = Image.new("L", result.size, 0)
    width, height = result.size
    ImageDraw.Draw(mask).rectangle((width // 4, height // 4, width * 3 // 4 - 1, height * 3 // 4 - 1), fill=255)
    result.putalpha(mask)
    return result


@pytest.fixture(autouse=True)
def mock_rembg(monkeypatch):
    calls = []

    def remove(image, session, alpha_matting=False):
        calls.append({"session": session, "alpha_matting": alpha_matting, "size": image.size})
        return fake_remove(image, session, alpha_matting)

    monkeypatch.setattr(processing, "get_session", lambda model: model)
    monkeypatch.setattr(processing, "_rembg_remove", remove)
    return calls


@pytest.fixture
def app():
    return create_app({"TESTING": True, "MAX_FILES": 5, "MAX_CONTENT_LENGTH": 2 * 1024 * 1024})


@pytest.fixture
def client(app):
    return app.test_client()


def make_image(size=(80, 60), color="red", fmt="JPEG"):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, fmt)
    buffer.seek(0)
    return buffer


@pytest.fixture
def image_file():
    return make_image
