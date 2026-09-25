import io
import threading
from dataclasses import dataclass

from PIL import Image, ImageColor, ImageOps, UnidentifiedImageError

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif"}

MODELS = {
    "u2net": "General (U²-Net)",
    "isnet-general-use": "Alta precisión (ISNet)",
    "u2net_human_seg": "Personas",
    "isnet-anime": "Anime e ilustraciones",
    "silueta": "Rápido (Silueta)",
}

OUTPUT_FORMATS = {
    "png": ("PNG", "image/png"),
    "webp": ("WEBP", "image/webp"),
    "jpg": ("JPEG", "image/jpeg"),
}

TRUE_VALUES = {"1", "true", "on", "yes"}

_sessions = {}
_sessions_lock = threading.Lock()


class InvalidImageError(ValueError):
    pass


class InvalidOptionsError(ValueError):
    pass


@dataclass(frozen=True)
class Options:
    model: str = "u2net"
    output_format: str = "png"
    background: str | None = None
    crop: bool = False
    alpha_matting: bool = False
    max_size: int | None = None

    @classmethod
    def from_form(cls, form, default_model="u2net"):
        model = form.get("model") or default_model
        if model not in MODELS:
            raise InvalidOptionsError(f"Modelo desconocido: {model}")

        output_format = (form.get("format") or "png").lower()
        if output_format == "jpeg":
            output_format = "jpg"
        if output_format not in OUTPUT_FORMATS:
            raise InvalidOptionsError(f"Formato de salida no soportado: {output_format}")

        background = (form.get("background") or "").strip() or None
        if background in {"transparent", "none"}:
            background = None
        if background:
            try:
                ImageColor.getcolor(background, "RGBA")
            except ValueError as exc:
                raise InvalidOptionsError(f"Color de fondo no válido: {background}") from exc
        if output_format == "jpg" and background is None:
            background = "#ffffff"

        max_size = form.get("max_size") or None
        if max_size is not None:
            try:
                max_size = int(max_size)
            except ValueError as exc:
                raise InvalidOptionsError("El tamaño máximo debe ser un número entero.") from exc
            if not 64 <= max_size <= 10000:
                raise InvalidOptionsError("El tamaño máximo debe estar entre 64 y 10000 px.")

        return cls(
            model=model,
            output_format=output_format,
            background=background,
            crop=str(form.get("crop", "")).lower() in TRUE_VALUES,
            alpha_matting=str(form.get("alpha_matting", "")).lower() in TRUE_VALUES,
            max_size=max_size,
        )

    @property
    def extension(self):
        return self.output_format

    @property
    def mimetype(self):
        return OUTPUT_FORMATS[self.output_format][1]


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_session(model):
    with _sessions_lock:
        if model not in _sessions:
            from rembg import new_session

            _sessions[model] = new_session(model)
        return _sessions[model]


def _rembg_remove(image, session, alpha_matting=False):
    from rembg import remove

    if alpha_matting:
        return remove(
            image,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )
    return remove(image, session=session)


def load_image(data):
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        return image.convert("RGBA")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidImageError("El archivo no es una imagen válida.") from exc


def apply_options(result, options):
    result = result.convert("RGBA")
    if options.crop:
        bbox = result.getchannel("A").getbbox()
        if bbox:
            result = result.crop(bbox)
    if options.background:
        canvas = Image.new("RGBA", result.size, ImageColor.getcolor(options.background, "RGBA"))
        canvas.alpha_composite(result)
        result = canvas
    return result


def encode(image, output_format):
    pil_format = OUTPUT_FORMATS[output_format][0]
    buffer = io.BytesIO()
    if pil_format == "JPEG":
        image.convert("RGB").save(buffer, pil_format, quality=95, optimize=True)
    elif pil_format == "WEBP":
        image.save(buffer, pil_format, quality=95, method=6)
    else:
        image.save(buffer, pil_format, optimize=True)
    return buffer.getvalue()


def process_image(data, options=None):
    options = options or Options()
    image = load_image(data)
    if options.max_size and max(image.size) > options.max_size:
        image.thumbnail((options.max_size, options.max_size), Image.Resampling.LANCZOS)
    result = _rembg_remove(image, get_session(options.model), options.alpha_matting)
    return encode(apply_options(result, options), options.output_format)
