import io
import logging
import os
import zipfile

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from processing import MODELS, InvalidImageError, InvalidOptionsError, Options, allowed_file, process_image

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("bgremover")


def output_name(filename, extension, used=None):
    stem = os.path.splitext(secure_filename(filename) or "imagen")[0] or "imagen"
    name = f"{stem}.{extension}"
    if used is not None:
        counter = 1
        while name in used:
            name = f"{stem}_{counter}.{extension}"
            counter += 1
        used.add(name)
    return name


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(
        MAX_CONTENT_LENGTH=int(os.getenv("MAX_UPLOAD_MB", "200")) * 1024 * 1024,
        MAX_FILES=int(os.getenv("MAX_FILES", "50")),
        DEFAULT_MODEL=os.getenv("REMBG_MODEL", "u2net"),
    )
    if config:
        app.config.update(config)

    def api_error(message, status):
        return jsonify(error=message), status

    @app.errorhandler(413)
    def too_large(_):
        message = f"Los archivos superan el límite de {app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)} MB."
        if request.path.startswith("/api/"):
            return api_error(message, 413)
        return message, 413

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.post("/api/remove")
    def api_remove():
        file = request.files.get("image")
        if not file or not file.filename:
            return api_error("No se recibió ninguna imagen.", 400)
        if not allowed_file(file.filename):
            return api_error(f"Formato no soportado: {file.filename}", 415)
        try:
            options = Options.from_form(request.form, app.config["DEFAULT_MODEL"])
        except InvalidOptionsError as exc:
            return api_error(str(exc), 400)
        try:
            output = process_image(file.read(), options)
        except InvalidImageError as exc:
            return api_error(str(exc), 422)
        except Exception:
            logger.exception("Error procesando %s", file.filename)
            return api_error("Error interno al procesar la imagen.", 500)
        return send_file(
            io.BytesIO(output), mimetype=options.mimetype, download_name=output_name(file.filename, options.extension)
        )

    @app.get("/api/models")
    def api_models():
        return jsonify(default=app.config["DEFAULT_MODEL"], models=MODELS)

    @app.route("/", methods=["GET", "POST"])
    def index():
        if request.method == "GET":
            return render_template(
                "index.html",
                models=MODELS,
                default_model=app.config["DEFAULT_MODEL"],
                max_files=app.config["MAX_FILES"],
                max_mb=app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024),
            )

        files = [f for f in request.files.getlist("images") if f and f.filename]
        if not files:
            return "No se seleccionó ningún archivo.", 400
        if len(files) > app.config["MAX_FILES"]:
            return f"Máximo {app.config['MAX_FILES']} imágenes por lote.", 400

        try:
            options = Options.from_form(request.form, app.config["DEFAULT_MODEL"])
        except InvalidOptionsError as exc:
            return str(exc), 400

        if len(files) == 1:
            file = files[0]
            if not allowed_file(file.filename):
                return f"Formato no soportado: {file.filename}", 415
            try:
                output = process_image(file.read(), options)
            except InvalidImageError as exc:
                return f"{file.filename}: {exc}", 422
            except Exception:
                logger.exception("Error procesando %s", file.filename)
                return f"Error procesando la imagen {file.filename}.", 500
            return send_file(
                io.BytesIO(output),
                mimetype=options.mimetype,
                as_attachment=True,
                download_name=output_name(file.filename, options.extension),
            )

        memory_file = io.BytesIO()
        used, errors = set(), []
        with zipfile.ZipFile(memory_file, "w", zipfile.ZIP_DEFLATED) as zf:
            for file in files:
                if not allowed_file(file.filename):
                    errors.append(f"{file.filename}: formato no soportado")
                    continue
                try:
                    output = process_image(file.read(), options)
                    zf.writestr(output_name(file.filename, options.extension, used), output)
                except InvalidImageError as exc:
                    errors.append(f"{file.filename}: {exc}")
                except Exception:
                    logger.exception("Error procesando %s", file.filename)
                    errors.append(f"{file.filename}: error interno")
            if errors:
                zf.writestr("errores.txt", "\n".join(errors))
        memory_file.seek(0)
        return send_file(
            memory_file, mimetype="application/zip", as_attachment=True, download_name="imagenes_procesadas.zip"
        )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
