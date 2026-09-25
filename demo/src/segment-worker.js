import * as ort from "../vendor/ort/ort.wasm.min.mjs";

const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const MIME = { png: "image/png", webp: "image/webp", jpg: "image/jpeg" };

ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const modelsUrl = new URL("../models/", import.meta.url);
let manifest = null;
const sessions = new Map();

async function getManifest() {
  if (!manifest) {
    const response = await fetch(new URL("manifest.json", modelsUrl));
    if (!response.ok) throw new Error("No se pudo cargar la lista de modelos.");
    manifest = await response.json();
  }
  return manifest;
}

async function download(key) {
  const model = (await getManifest())[key];
  if (!model) throw new Error(`Modelo desconocido: ${key}`);

  const bytes = new Uint8Array(model.size);
  let loaded = 0;
  self.postMessage({ type: "progress", model: key, label: model.label, loaded, total: model.size });

  for (const file of model.files) {
    const response = await fetch(new URL(file, modelsUrl));
    if (!response.ok || !response.body) throw new Error("No se pudo descargar el modelo.");
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, loaded);
      loaded += value.length;
      self.postMessage({ type: "progress", model: key, label: model.label, loaded, total: model.size });
    }
  }

  if (loaded !== model.size) throw new Error("El modelo se descargó incompleto.");
  return bytes;
}

function getSession(key) {
  if (!sessions.has(key)) {
    const session = download(key)
      .then((bytes) => ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }))
      .finally(() => self.postMessage({ type: "ready", model: key }));
    session.catch(() => sessions.delete(key));
    sessions.set(key, session);
  }
  return sessions.get(key);
}

function toTensor(source) {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, SIZE, SIZE);
  const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data;

  let max = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2]);
  }
  max = max || 1;

  const area = SIZE * SIZE;
  const data = new Float32Array(3 * area);
  for (let p = 0; p < area; p++) {
    for (let c = 0; c < 3; c++) {
      data[c * area + p] = (pixels[p * 4 + c] / max - MEAN[c]) / STD[c];
    }
  }
  return new ort.Tensor("float32", data, [1, 3, SIZE, SIZE]);
}

function toMask(prediction, width, height) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of prediction) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;

  const small = new OffscreenCanvas(SIZE, SIZE);
  const smallCtx = small.getContext("2d");
  const image = smallCtx.createImageData(SIZE, SIZE);
  for (let p = 0; p < SIZE * SIZE; p++) {
    const v = Math.round(((prediction[p] - min) / range) * 255);
    image.data[p * 4] = v;
    image.data[p * 4 + 1] = v;
    image.data[p * 4 + 2] = v;
    image.data[p * 4 + 3] = 255;
  }
  smallCtx.putImageData(image, 0, 0);

  const full = new OffscreenCanvas(width, height);
  const fullCtx = full.getContext("2d", { willReadFrequently: true });
  fullCtx.imageSmoothingQuality = "high";
  fullCtx.drawImage(small, 0, 0, width, height);
  return fullCtx.getImageData(0, 0, width, height).data;
}

function boundingBox(data, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

async function removeBackground(file, settings) {
  const started = performance.now();

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("El navegador no puede leer esta imagen.");
  }

  let width = bitmap.width;
  let height = bitmap.height;
  const maxSize = Number(settings.max_size) || 0;
  if (maxSize && Math.max(width, height) > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const session = await getSession(settings.model);
  const outputs = await session.run({ [session.inputNames[0]]: toTensor(canvas) });
  const mask = toMask(outputs[session.outputNames[0]].data, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < image.data.length; i += 4) {
    image.data[i] = Math.round((image.data[i] * mask[i - 3]) / 255);
  }

  let box = { x: 0, y: 0, width, height };
  if (settings.crop) box = boundingBox(image.data, width, height) || box;

  ctx.putImageData(image, 0, 0);
  const output = new OffscreenCanvas(box.width, box.height);
  const outputCtx = output.getContext("2d");
  const format = MIME[settings.format] ? settings.format : "png";
  const background = settings.background && settings.background !== "transparent"
    ? settings.background
    : format === "jpg" ? "#ffffff" : null;
  if (background) {
    outputCtx.fillStyle = background;
    outputCtx.fillRect(0, 0, box.width, box.height);
  }
  outputCtx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  const blob = await output.convertToBlob({ type: MIME[format], quality: 0.95 });
  return { blob, duration: (performance.now() - started) / 1000 };
}

let queue = Promise.resolve();

self.addEventListener("message", ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = await removeBackground(data.file, data.settings);
      self.postMessage({ type: "result", id: data.id, ...result });
    } catch (error) {
      self.postMessage({ type: "result", id: data.id, error: error?.message || "No se pudo procesar la imagen." });
    }
  });
});
