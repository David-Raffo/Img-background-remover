(() => {
  const MAX_FILES = Number(document.body.dataset.maxFiles) || 50;
  const MAX_BYTES = (Number(document.body.dataset.maxMb) || 200) * 1024 * 1024;
  const CONCURRENCY = 2;
  const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff"];
  const ACCEPTED_NAMES = /\.(png|jpe?g|webp|bmp|tiff?)$/i;
  const EXTENSIONS = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };
  const SETTINGS_KEY = "quitafondos:settings";
  const THEME_KEY = "quitafondos:theme";
  const STATUS_LABELS = { pending: "Pendiente", processing: "Procesando…", done: "Listo", error: "Error" };

  const $ = (selector, root = document) => root.querySelector(selector);

  const els = {
    dropzone: $("#dropzone"),
    input: $("#file-input"),
    gallery: $("#gallery"),
    empty: $("#empty-state"),
    toolbar: $("#toolbar"),
    counter: $("#counter"),
    progress: $("#progress"),
    progressBar: $("#progress-bar"),
    progressText: $("#progress-text"),
    process: $("#btn-process"),
    processLabel: $("#btn-process-label"),
    reprocess: $("#btn-reprocess"),
    zip: $("#btn-zip"),
    clear: $("#btn-clear"),
    settings: $("#settings"),
    colorRow: $("#color-row"),
    colorInput: $("#bg-color"),
    colorValue: $("#bg-color-value"),
    jpgHint: $("#jpg-hint"),
    theme: $("#btn-theme"),
    toasts: $("#toasts"),
    template: $("#card-template"),
  };

  const items = [];
  let nextId = 1;
  let batch = null;

  const formatBytes = (bytes) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const stem = (filename) => filename.replace(/\.[^.]+$/, "") || "imagen";

  const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    els.toasts.append(el);
    setTimeout(() => {
      el.classList.add("leaving");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }, 4500);
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function readSettings() {
    const data = new FormData(els.settings);
    const mode = data.get("bg_mode");
    return {
      model: data.get("model"),
      format: data.get("format"),
      background: mode === "color" ? data.get("bg_color") : mode === "white" ? "#ffffff" : "transparent",
      max_size: data.get("max_size") || "",
      crop: data.get("crop") ? "1" : "",
      alpha_matting: data.get("alpha_matting") ? "1" : "",
    };
  }

  function syncSettingsUI() {
    const data = new FormData(els.settings);
    els.colorRow.classList.toggle("inactive", data.get("bg_mode") !== "color");
    els.colorValue.textContent = els.colorInput.value;
    els.jpgHint.hidden = !(data.get("format") === "jpg" && data.get("bg_mode") === "transparent");
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.fromEntries(new FormData(els.settings))));
    } catch {}
  }

  function restoreSettings() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    } catch {}
    if (!saved) return;
    for (const field of els.settings.elements) {
      if (!field.name) continue;
      if (field.type === "checkbox") {
        field.checked = field.name in saved;
      } else if (!(field.name in saved)) {
        continue;
      } else if (field.type === "radio") {
        field.checked = saved[field.name] === field.value;
      } else if (field.tagName === "SELECT") {
        if ([...field.options].some((option) => option.value === saved[field.name])) field.value = saved[field.name];
      } else {
        field.value = saved[field.name];
      }
    }
  }

  function currentTheme() {
    return document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

  const isAccepted = (file) => ACCEPTED_TYPES.includes(file.type) || ACCEPTED_NAMES.test(file.name);

  const isDuplicate = (file) =>
    items.some((item) => item.file.name === file.name && item.file.size === file.size &&
      item.file.lastModified === file.lastModified);

  function addFiles(fileList) {
    let rejected = 0;
    let tooBig = 0;
    let overLimit = 0;
    for (const file of fileList) {
      if (!isAccepted(file)) {
        rejected++;
      } else if (file.size > MAX_BYTES) {
        tooBig++;
      } else if (items.length >= MAX_FILES) {
        overLimit++;
      } else if (!isDuplicate(file)) {
        const item = { id: nextId++, file, status: "pending", resultBlob: null, resultUrl: null, error: null };
        item.originalUrl = URL.createObjectURL(file);
        item.el = createCard(item);
        items.push(item);
        els.gallery.append(item.el);
      }
    }
    if (rejected) toast(`${plural(rejected, "archivo ignorado", "archivos ignorados")}: formato no soportado.`, "warning");
    if (tooBig) toast(`${plural(tooBig, "archivo supera", "archivos superan")} el tamaño máximo.`, "warning");
    if (overLimit) toast(`Se alcanzó el límite de ${MAX_FILES} imágenes.`, "warning");
    render();
  }

  function createCard(item) {
    const el = els.template.content.firstElementChild.cloneNode(true);
    const original = $(".img-original", el);
    original.src = item.originalUrl;
    original.alt = item.file.name;
    $(".img-result", el).alt = `${item.file.name} sin fondo`;
    $(".card-name", el).textContent = item.file.name;
    $(".card-name", el).title = item.file.name;
    $(".compare", el).addEventListener("input", (event) => {
      $(".card-media", el).style.setProperty("--pos", `${event.target.value}%`);
    });
    $(".btn-download", el).addEventListener("click", () => triggerDownload(item.resultUrl, item.outputName));
    $(".btn-retry", el).addEventListener("click", () => run([item]));
    $(".btn-remove", el).addEventListener("click", () => removeItem(item));
    updateCard(item, el);
    return el;
  }

  function updateCard(item, el = item.el) {
    el.dataset.status = item.status;
    const badge = $(".badge", el);
    badge.textContent = STATUS_LABELS[item.status];
    badge.title = item.error || "";
    const result = $(".img-result", el);
    if (item.resultUrl) result.src = item.resultUrl;
    else result.removeAttribute("src");
    $(".btn-download", el).hidden = item.status !== "done";
    $(".btn-retry", el).hidden = item.status !== "error";
    const duration = item.duration ? ` · ${item.duration.toFixed(1)} s` : "";
    $(".card-size", el).textContent = item.resultBlob
      ? `${formatBytes(item.file.size)} → ${formatBytes(item.resultBlob.size)}${duration}`
      : item.error || formatBytes(item.file.size);
  }

  function releaseItem(item) {
    URL.revokeObjectURL(item.originalUrl);
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    item.el.remove();
  }

  function removeItem(item) {
    const index = items.indexOf(item);
    if (index === -1) return;
    items.splice(index, 1);
    releaseItem(item);
    render();
  }

  function clearAll() {
    if (batch) return;
    items.splice(0).forEach(releaseItem);
    render();
  }

  async function processItem(item, settings) {
    item.status = "processing";
    item.error = null;
    updateCard(item);

    const body = new FormData();
    body.append("image", item.file);
    Object.entries(settings).forEach(([key, value]) => body.append(key, value));

    try {
      const response = await fetch("api/remove", { method: "POST", body });
      if (!response.ok) {
        let message = `Error ${response.status}`;
        try {
          message = (await response.json()).error || message;
        } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      item.duration = Number(response.headers.get("X-Processing-Time")) || null;
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      item.resultBlob = blob;
      item.resultUrl = URL.createObjectURL(blob);
      item.outputName = `${stem(item.file.name)}.${EXTENSIONS[blob.type] || settings.format}`;
      item.status = "done";
    } catch (error) {
      item.status = "error";
      item.error = error instanceof TypeError ? "No se pudo conectar con el servidor." : error.message;
    }

    if (items.includes(item)) updateCard(item);
  }

  async function run(targets) {
    if (batch || !targets.length) return;
    const settings = readSettings();
    const queue = [...targets];
    batch = { total: targets.length, finished: 0, failed: 0 };
    targets.forEach((item) => {
      item.status = "pending";
      updateCard(item);
    });
    render();

    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (items.includes(item)) {
          await processItem(item, settings);
          if (item.status === "error") batch.failed++;
        }
        batch.finished++;
        render();
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    const { total, failed } = batch;
    batch = null;
    render();
    if (failed) toast(`${total - failed} de ${total} imágenes procesadas. ${failed} con errores.`, "error");
    else toast(`${plural(total, "imagen procesada", "imágenes procesadas")} correctamente.`, "success");
  }

  const uniqueName = (name, used) => {
    let candidate = name;
    let counter = 1;
    while (used.has(candidate.toLowerCase())) {
      candidate = name.replace(/(\.[^.]+)?$/, `_${counter++}$1`);
    }
    used.add(candidate.toLowerCase());
    return candidate;
  };

  async function downloadZip() {
    const ready = items.filter((item) => item.status === "done");
    if (!ready.length) return;
    els.zip.disabled = true;
    try {
      const used = new Set();
      const entries = ready.map((item) => ({ name: uniqueName(item.outputName, used), blob: item.resultBlob }));
      const zip = await ZipWriter.create(entries);
      const url = URL.createObjectURL(zip);
      triggerDownload(url, `quitafondos_${new Date().toISOString().slice(0, 10)}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      toast("No se pudo generar el ZIP.", "error");
    } finally {
      render();
    }
  }

  function render() {
    const total = items.length;
    const done = items.filter((item) => item.status === "done").length;
    const pending = items.filter((item) => item.status === "pending" || item.status === "error").length;
    const busy = Boolean(batch);

    els.empty.hidden = total > 0;
    els.toolbar.hidden = total === 0;
    els.counter.textContent = `${plural(total, "imagen", "imágenes")} · ${plural(done, "lista", "listas")}`;

    els.process.disabled = busy || pending === 0;
    els.processLabel.textContent = busy ? "Procesando…" : pending ? `Eliminar fondos (${pending})` : "Eliminar fondos";
    els.reprocess.hidden = done === 0;
    els.reprocess.disabled = busy;
    els.zip.disabled = busy || done === 0;
    els.clear.disabled = busy;

    els.progress.hidden = !busy;
    if (busy) {
      els.progressBar.style.width = `${Math.round((batch.finished / batch.total) * 100)}%`;
      els.progressText.textContent = `${batch.finished} / ${batch.total}`;
    }
  }

  els.dropzone.addEventListener("click", () => els.input.click());
  els.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.input.click();
    }
  });
  els.input.addEventListener("change", () => {
    addFiles(els.input.files);
    els.input.value = "";
  });

  let dragDepth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
  document.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    dragDepth++;
    els.dropzone.classList.add("dragging");
  });
  document.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropzone.classList.remove("dragging");
  });
  document.addEventListener("dragover", (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    els.dropzone.classList.remove("dragging");
    addFiles(event.dataTransfer.files);
  });

  document.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.files || [])];
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  });

  els.process.addEventListener("click", () =>
    run(items.filter((item) => item.status === "pending" || item.status === "error")));
  els.reprocess.addEventListener("click", () => run([...items]));
  els.zip.addEventListener("click", downloadZip);
  els.clear.addEventListener("click", clearAll);
  els.theme.addEventListener("click", toggleTheme);

  els.colorInput.addEventListener("input", () => {
    els.settings.querySelector('input[name="bg_mode"][value="color"]').checked = true;
  });
  els.settings.addEventListener("input", () => {
    syncSettingsUI();
    saveSettings();
  });
  els.settings.addEventListener("submit", (event) => event.preventDefault());

  window.addEventListener("beforeunload", (event) => {
    if (batch) event.preventDefault();
  });

  restoreSettings();
  syncSettingsUI();
  render();
})();
