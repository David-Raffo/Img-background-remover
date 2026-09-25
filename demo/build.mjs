import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(here, "dist");

const MAX_FILES = 50;
const MAX_MB = 200;
const PAGES_FILE_LIMIT = 25 * 1024 * 1024;

const models = [
  { key: "u2netp", label: "Rápido", option: "Rápido (U²-Netp · 4,4 MB)", pkg: "@rmbg/model-u2netp" },
  { key: "silueta", label: "General", option: "General (Silueta · 42 MB)", pkg: "@rmbg/model-silueta" },
];

const packageDir = (name) => join(here, "node_modules", name);

function replace(html, search, replacement) {
  const found = search instanceof RegExp ? search.test(html) : html.includes(search);
  if (!found) {
    throw new Error(`The template no longer contains: ${search}`);
  }
  return html.replace(search, replacement);
}

async function buildHtml() {
  let html = await readFile(join(root, "templates", "index.html"), "utf8");

  html = html.replace(/\{\{ url_for\('static', filename='([^']+)'\) \}\}/g, "$1");
  html = html.replaceAll("{{ max_files }}", String(MAX_FILES)).replaceAll("{{ max_mb }}", String(MAX_MB));

  const options = models
    .map((model, index) => `<option value="${model.key}"${index === 0 ? " selected" : ""}>${model.option}</option>`)
    .join("\n            ");
  html = replace(html, /\{% for key, label in models\.items\(\) %\}[\s\S]*?\{% endfor %\}/, options);
  html = replace(html, /\s*<label class="switch">\s*<input type="checkbox" name="alpha_matting">[\s\S]*?<\/label>/, "");

  html = replace(html, "<title>Quitafondos · Eliminador de fondos en lote</title>", "<title>Quitafondos · Demo en el navegador</title>");
  html = replace(
    html,
    'content="Elimina el fondo de muchas imágenes a la vez con IA, directamente en tu servidor."',
    'content="Elimina el fondo de muchas imágenes a la vez con IA, directamente en tu navegador y sin subirlas a ningún servidor."',
  );
  html = replace(
    html,
    "Todo se procesa en tu propio servidor.",
    "Todo se procesa en tu navegador: las imágenes nunca salen de tu dispositivo.",
  );
  html = replace(
    html,
    '<span class="chip"><span class="dot"></span>Procesamiento local</span>',
    '<span class="chip chip-demo">Demo</span>\n        <span class="chip"><span class="dot"></span>Procesamiento local</span>',
  );
  html = replace(
    html,
    "<p>Quitafondos · Flask + rembg · Las imágenes no se almacenan en el servidor</p>",
    '<p>Quitafondos · Demo con ONNX Runtime Web · <a href="https://github.com/David-Raffo/Img-background-remover">Código y versión completa en GitHub</a></p>',
  );
  html = replace(html, '<link rel="stylesheet" href="css/styles.css">', '<link rel="stylesheet" href="css/styles.css">\n  <link rel="stylesheet" href="css/demo.css">');
  html = replace(html, '<script src="js/zip.js"></script>', '<script src="js/engine.js"></script>\n  <script src="js/zip.js"></script>');

  if (/\{\{|\{%/.test(html)) throw new Error("Unrendered template tags left in index.html");
  await writeFile(join(dist, "index.html"), html);
}

async function copyModels() {
  const manifest = {};
  await mkdir(join(dist, "models"), { recursive: true });
  for (const model of models) {
    const dir = packageDir(model.pkg);
    const { default: info } = await import(join(dir, "index.js"));
    let size = 0;
    for (const file of info.files) {
      const source = join(dir, file);
      const { size: bytes } = await stat(source);
      if (bytes > PAGES_FILE_LIMIT) throw new Error(`${file} is larger than the Cloudflare Pages limit`);
      size += bytes;
      await cp(source, join(dist, "models", file));
    }
    manifest[model.key] = { label: model.label, files: info.files, size };
  }
  await writeFile(join(dist, "models", "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function copyRuntime() {
  const ort = join(packageDir("onnxruntime-web"), "dist");
  for (const file of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
    await cp(join(ort, file), join(dist, "vendor", "ort", file));
  }
}

async function copyStatic() {
  await cp(join(root, "static", "css", "styles.css"), join(dist, "css", "styles.css"));
  await cp(join(root, "static", "favicon.svg"), join(dist, "favicon.svg"));
  for (const file of ["app.js", "zip.js"]) {
    await cp(join(root, "static", "js", file), join(dist, "js", file));
  }
  await cp(join(here, "src", "engine.js"), join(dist, "js", "engine.js"));
  await cp(join(here, "src", "segment-worker.js"), join(dist, "js", "segment-worker.js"));
  await cp(join(here, "src", "demo.css"), join(dist, "css", "demo.css"));
  await cp(join(here, "src", "_headers"), join(dist, "_headers"));
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyStatic();
await copyRuntime();
await copyModels();
await buildHtml();
console.log(`Demo built in ${dist}`);
