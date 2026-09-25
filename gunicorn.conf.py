import os

bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
workers = int(os.getenv("WORKERS", "1"))
threads = int(os.getenv("THREADS", "4"))
timeout = int(os.getenv("TIMEOUT", "300"))
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
