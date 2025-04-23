import io
import threading

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif"}

_sessions = {}
_sessions_lock = threading.Lock()


class InvalidImageError(ValueError):
    pass


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_session(model):
    with _sessions_lock:
        if model not in _sessions:
            from rembg import new_session

            _sessions[model] = new_session(model)
        return _sessions[model]


def _rembg_remove(image, session):
    from rembg import remove

    return remove(image, session=session)


def load_image(data):
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        return image.convert("RGBA")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidImageError("El archivo no es una imagen válida.") from exc


def process_image(data, model="u2net"):
    image = load_image(data)
    result = _rembg_remove(image, get_session(model))
    buffer = io.BytesIO()
    result.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()
