import io

import pytest
from PIL import Image

from processing import InvalidImageError, InvalidOptionsError, Options, allowed_file, process_image


def open_result(data):
    return Image.open(io.BytesIO(data))


@pytest.mark.parametrize("name", ["foto.jpg", "foto.JPEG", "a.b.png", "x.webp", "scan.tif"])
def test_allowed_file_accepts_images(name):
    assert allowed_file(name)


@pytest.mark.parametrize("name", ["documento.pdf", "sin_extension", "script.py", ".png.exe"])
def test_allowed_file_rejects_other_files(name):
    assert not allowed_file(name)


def test_options_defaults():
    options = Options.from_form({})
    assert options == Options()
    assert options.mimetype == "image/png"


def test_options_parse_all_fields():
    options = Options.from_form(
        {
            "model": "isnet-general-use",
            "format": "WEBP",
            "background": "#ff0000",
            "crop": "1",
            "alpha_matting": "on",
            "max_size": "1024",
        }
    )
    assert options.model == "isnet-general-use"
    assert options.output_format == "webp"
    assert options.background == "#ff0000"
    assert options.crop and options.alpha_matting
    assert options.max_size == 1024


def test_options_jpg_forces_white_background():
    options = Options.from_form({"format": "jpeg", "background": "transparent"})
    assert options.output_format == "jpg"
    assert options.background == "#ffffff"


@pytest.mark.parametrize(
    "form",
    [
        {"model": "desconocido"},
        {"format": "gif"},
        {"background": "no-es-un-color"},
        {"max_size": "abc"},
        {"max_size": "10"},
        {"max_size": "999999"},
    ],
)
def test_options_reject_invalid_values(form):
    with pytest.raises(InvalidOptionsError):
        Options.from_form(form)


def test_process_image_returns_transparent_png(image_file):
    result = open_result(process_image(image_file().getvalue()))
    assert result.format == "PNG"
    assert result.mode == "RGBA"
    assert result.getpixel((0, 0))[3] == 0
    assert result.getpixel((40, 30))[3] == 255


def test_process_image_crop(image_file):
    result = open_result(process_image(image_file((80, 60)).getvalue(), Options(crop=True)))
    assert result.size == (40, 30)


def test_process_image_background_color(image_file):
    result = open_result(process_image(image_file().getvalue(), Options(background="#00ff00")))
    assert result.getpixel((0, 0)) == (0, 255, 0, 255)


def test_process_image_jpg_output(image_file):
    result = open_result(process_image(image_file().getvalue(), Options.from_form({"format": "jpg"})))
    assert result.format == "JPEG"
    assert result.mode == "RGB"


def test_process_image_max_size(image_file, mock_rembg):
    process_image(image_file((400, 200)).getvalue(), Options(max_size=100))
    assert mock_rembg[-1]["size"] == (100, 50)


def test_process_image_passes_alpha_matting(image_file, mock_rembg):
    process_image(image_file().getvalue(), Options(alpha_matting=True, model="silueta"))
    assert mock_rembg[-1]["alpha_matting"] is True
    assert mock_rembg[-1]["session"] == "silueta"


def test_process_image_rejects_invalid_data():
    with pytest.raises(InvalidImageError):
        process_image(b"esto no es una imagen")
