import io
import os
import zipfile
from flask import Flask, render_template, request, send_file
from rembg import remove

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        # Verifica que se haya subido al menos un archivo con la clave "images"
        if 'images' not in request.files:
            return "No se encontró el archivo.", 400
        files = request.files.getlist('images')
        if not files or files[0].filename == '':
            return "No se seleccionó ningún archivo.", 400

        # Si se sube un solo archivo, se procesa y se envía individualmente
        if len(files) == 1:
            file = files[0]
            original_filename = file.filename
            try:
                input_data = file.read()
                output_data = remove(input_data)
                # Se mantiene el nombre original, cambiando la extensión a .png
                processed_filename = os.path.splitext(original_filename)[0] + ".png"
                return send_file(io.BytesIO(output_data),
                                 mimetype='image/png',
                                 as_attachment=True,
                                 download_name=processed_filename)
            except Exception as e:
                return f"Error procesando la imagen {original_filename}: {str(e)}", 500
        else:
            # Para múltiples archivos, se procesan y se agregan a un ZIP para facilitar la descarga
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file in files:
                    original_filename = file.filename
                    try:
                        input_data = file.read()
                        output_data = remove(input_data)
                        processed_filename = os.path.splitext(original_filename)[0] + ".png"
                        zf.writestr(processed_filename, output_data)
                    except Exception as e:
                        # Si se produce algún error con un archivo, se puede omitir o registrar el error.
                        print(f"Error procesando {original_filename}: {str(e)}")
            memory_file.seek(0)
            return send_file(memory_file,
                             mimetype='application/zip',
                             as_attachment=True,
                             download_name='imagenes_procesadas.zip')
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=False, host="0.0.0.0", port=os.getenv("PORT", default=4000))
