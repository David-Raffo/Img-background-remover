# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    U2NET_HOME=/models \
    NUMBA_CACHE_DIR=/var/cache/numba \
    PORT=5000

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt \
    && python -c "import os, pathlib, sysconfig; [os.utime(p, (int(p.stat().st_mtime),) * 2) for p in pathlib.Path(sysconfig.get_paths()['purelib']).rglob('*.py')]"

ARG PRELOAD_MODELS="u2net"
RUN mkdir -p /models "$NUMBA_CACHE_DIR" \
    && for model in $PRELOAD_MODELS; do python -c "from rembg import new_session; new_session('$model')"; done

RUN useradd --create-home --uid 1000 app && chown -R app:app /models "$NUMBA_CACHE_DIR"

COPY --chown=app:app app.py processing.py gunicorn.conf.py ./
COPY --chown=app:app templates ./templates
COPY --chown=app:app static ./static

USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health', timeout=4)"

CMD ["gunicorn", "app:app"]
