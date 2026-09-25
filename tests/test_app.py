import io
import zipfile

from PIL import Image


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_index_renders_models(client):
    response = client.get("/")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Quitafondos" in html
    assert 'value="isnet-general-use"' in html


def test_models_endpoint(client):
    data = client.get("/api/models").get_json()
    assert data["default"] == "u2net"
    assert "u2net" in data["models"]


def test_api_remove_png(client, image_file):
    response = client.post("/api/remove", data={"image": (image_file(), "foto.jpg")})
    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert "foto.png" in response.headers["Content-Disposition"]
    assert Image.open(io.BytesIO(response.data)).mode == "RGBA"


def test_api_remove_reports_processing_time(client, image_file):
    response = client.post("/api/remove", data={"image": (image_file(), "foto.jpg")})
    assert float(response.headers["X-Processing-Time"]) >= 0
    assert response.headers["Cache-Control"] == "no-store"


def test_security_headers(client):
    response = client.get("/")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_api_remove_webp_with_options(client, image_file):
    response = client.post(
        "/api/remove",
        data={
            "image": (image_file(), "foto.jpg"),
            "format": "webp",
            "crop": "1",
        },
    )
    assert response.status_code == 200
    assert response.mimetype == "image/webp"
    assert Image.open(io.BytesIO(response.data)).size == (40, 30)


def test_api_remove_without_file(client):
    response = client.post("/api/remove", data={})
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_api_remove_unsupported_extension(client):
    response = client.post("/api/remove", data={"image": (io.BytesIO(b"%PDF"), "doc.pdf")})
    assert response.status_code == 415


def test_api_remove_invalid_image(client):
    response = client.post("/api/remove", data={"image": (io.BytesIO(b"basura"), "foto.png")})
    assert response.status_code == 422


def test_api_remove_invalid_option(client, image_file):
    response = client.post("/api/remove", data={"image": (image_file(), "foto.jpg"), "model": "nope"})
    assert response.status_code == 400
    assert "Modelo" in response.get_json()["error"]


def test_api_remove_too_large(client):
    payload = io.BytesIO(b"0" * (3 * 1024 * 1024))
    response = client.post("/api/remove", data={"image": (payload, "grande.png")})
    assert response.status_code == 413
    assert "error" in response.get_json()


def test_batch_single_file_returns_image(client, image_file):
    response = client.post("/", data={"images": [(image_file(), "uno.jpg")]})
    assert response.status_code == 200
    assert response.mimetype == "image/png"


def test_batch_returns_zip_with_unique_names_and_errors(client, image_file):
    response = client.post(
        "/",
        data={
            "images": [
                (image_file(), "foto.jpg"),
                (image_file(color="blue"), "foto.png"),
                (io.BytesIO(b"basura"), "rota.jpg"),
                (io.BytesIO(b"texto"), "notas.txt"),
            ]
        },
    )
    assert response.status_code == 200
    assert response.mimetype == "application/zip"
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        names = sorted(archive.namelist())
        errors = archive.read("errores.txt").decode()
    assert names == ["errores.txt", "foto.png", "foto_1.png"]
    assert "rota.jpg" in errors
    assert "notas.txt" in errors


def test_batch_limits_number_of_files(client, image_file):
    files = [(image_file(), f"img{i}.jpg") for i in range(6)]
    response = client.post("/", data={"images": files})
    assert response.status_code == 400


def test_batch_without_files(client):
    response = client.post("/", data={})
    assert response.status_code == 400
