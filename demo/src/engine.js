(() => {
  if (!("OffscreenCanvas" in window) || !("Worker" in window)) return;

  const worker = new Worker("js/segment-worker.js", { type: "module" });
  const pending = new Map();
  let nextId = 1;

  const status = document.createElement("div");
  status.className = "model-status";
  status.hidden = true;
  status.setAttribute("role", "status");
  status.innerHTML = '<span class="spinner"></span><span class="model-status-text"></span>' +
    '<span class="model-status-track"><span class="model-status-bar"></span></span>';
  document.body.append(status);
  const statusText = status.querySelector(".model-status-text");
  const statusBar = status.querySelector(".model-status-bar");

  const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");

  worker.addEventListener("message", ({ data }) => {
    if (data.type === "progress") {
      status.hidden = false;
      const percent = data.total ? Math.round((data.loaded / data.total) * 100) : 0;
      statusText.textContent = `Descargando el modelo ${data.label} · ${megabytes(data.loaded)} de ${megabytes(data.total)} MB`;
      statusBar.style.width = `${percent}%`;
      return;
    }
    if (data.type === "ready") {
      status.hidden = true;
      return;
    }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve({ blob: data.blob, duration: data.duration });
  });

  worker.addEventListener("error", () => {
    status.hidden = true;
    for (const request of pending.values()) request.reject(new Error("El navegador no pudo iniciar el modelo."));
    pending.clear();
  });

  window.QuitafondosEngine = {
    remove(file, settings) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, file, settings });
      });
    },
  };
})();
