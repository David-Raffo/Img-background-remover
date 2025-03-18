import io
import os
import gc
import zipfile
import tempfile
from flask import Flask, render_template, request, send_file, Response
from rembg import remove
from werkzeug.utils import secure_filename

app = Flask(__name__)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_TOTAL_SIZE = 30 * 1024 * 1024  # 30MB

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        if 'images' not in request.files:
            return "No se encontró el archivo.", 400
            
        files = request.files.getlist('images')
        if not files or files[0].filename == '':
            return "No se seleccionó ningún archivo.", 400

        # Validar tamaño total
        total_size = 0
        for file in files:
            file.seek(0, os.SEEK_END)
            total_size += file.tell()
            file.seek(0)
            if file.tell() > MAX_FILE_SIZE:
                return f"Archivo {file.filename} excede 5MB", 400
        
        if total_size > MAX_TOTAL_SIZE:
            return "Límite total excedido (30MB)", 400

        # Procesar single file
        if len(files) == 1:
            file = files[0]
            try:
                with tempfile.NamedTemporaryFile(delete=True) as temp_input:
                    file.save(temp_input.name)
                    with open(temp_input.name, 'rb') as f:
                        output_data = remove(f.read())
                    
                    processed_filename = secure_filename(
                        os.path.splitext(file.filename)[0] + ".png"
                    )
                    gc.collect()
                    return send_file(
                        io.BytesIO(output_data),
                        mimetype='image/png',
                        as_attachment=True,
                        download_name=processed_filename
                    )
            except Exception as e:
                return f"Error procesando imagen: {str(e)}", 500

        # Procesar múltiples archivos (streaming)
        def generate_zip():
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file in files:
                    try:
                        with tempfile.NamedTemporaryFile(delete=True) as temp_input:
                            file.save(temp_input.name)
                            with open(temp_input.name, 'rb') as f:
                                output_data = remove(f.read())
                            
                            processed_filename = secure_filename(
                                os.path.splitext(file.filename)[0] + ".png"
                            )
                            zf.writestr(processed_filename, output_data)
                    except Exception as e:
                        print(f"Error procesando {file.filename}: {str(e)}")
            memory_file.seek(0)
            yield memory_file.getvalue()
            gc.collect()

        return Response(
            generate_zip(),
            mimetype='application/zip',
            headers={'Content-Disposition': 'attachment; filename=imagenes_procesadas.zip'}
        )

    return render_template('index.html')

if __name__ == '__main__':
    from waitress import serve
    serve(
        app, 
        host="0.0.0.0", 
        port=5000,
        threads=2,
        connection_limit=50,
        asyncore_use_poll=True
    )
