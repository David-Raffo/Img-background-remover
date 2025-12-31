# Contributing

Thanks for your interest in improving Quitafondos.

## Development setup

```bash
git clone https://github.com/David-Raffo/Img-background-remover.git
cd Img-background-remover
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python app.py
```

Open <http://localhost:5000>. The first processed image downloads the selected model into `~/.u2net`.

The frontend is plain HTML, CSS and JavaScript served from `static/` and `templates/`, so there is no build step: reload the page to see changes.

## Before opening a pull request

```bash
ruff check .
ruff format --check .
pytest
node --check static/js/app.js static/js/zip.js
docker build -t quitafondos:dev .
```

- Keep pull requests focused on a single change.
- Add or update tests for any change in `app.py` or `processing.py`. The tests mock rembg, so they never download a model.
- Describe what changed and how you tested it.
- Use clear commit messages (`feat: add AVIF output`, `fix: keep EXIF orientation when cropping`).

## Adding a model

Models are listed in `MODELS` in `processing.py`. Any model supported by [rembg](https://github.com/danielgatis/rembg) can be added there with a short label; it will appear in the settings panel automatically.

## Reporting bugs

Open an issue and include the browser, how you run the app (Docker or local), the container logs and, if possible, an image that reproduces the problem.
