'use strict';
// Gera a pasta www/ (interface + backend em WebAssembly) que o Capacitor empacota no APK.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const esbuild = require('esbuild');
const raiz = path.join(__dirname, '..'), www = path.join(raiz, 'www'), m = (...p) => path.join(raiz, 'src', 'mobile', ...p);
const nm = (p) => path.join(raiz, 'node_modules', p);
const versao = require(path.join(raiz, 'package.json')).version;

const plugin = {
  name: 'aulapro-mobile',
  setup(b) {
    // O extractor do computador (pdf-parse/Tesseract) é substituído pela versão leve do Android.
    b.onResolve({ filter: /^\.\/extract$/ }, () => ({ path: m('extract-mobile.js') }));
    b.onResolve({ filter: /^(fs|node:fs)$/ }, () => ({ path: m('fs-shim.js') }));
    b.onResolve({ filter: /^(path|node:path)$/ }, () => ({ path: m('path-shim.js') }));
    b.onResolve({ filter: /^(crypto|node:crypto)$/ }, () => ({ path: m('crypto-shim.js') }));
    b.onResolve({ filter: /^electron$/ }, () => ({ path: m('electron-shim.js') }));
    b.onResolve({ filter: /^better-sqlite3$/ }, () => ({ path: m('sqlite-adapter.js') }));
    // pdfkit: versão "standalone" (inclui as fontes) para o navegador/WebView
    b.onResolve({ filter: /^pdfkit$/ }, () => (fs.existsSync(nm('pdfkit/js/pdfkit.standalone.js')) ? { path: nm('pdfkit/js/pdfkit.standalone.js') } : undefined));
  },
};

(async () => {
  fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www, { recursive: true });
  await esbuild.build({
    entryPoints: [m('entry.js')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
    outfile: path.join(www, 'backend.js'), plugins: [plugin], external: ['node:sqlite'], logLevel: 'info',
    define: { 'process.env.AULAPRO_TESTE': '""', global: 'globalThis' },
    alias: { buffer: nm('buffer') },
  });
  const renderer = path.join(raiz, 'src', 'renderer');
  for (const entry of fs.readdirSync(renderer, { withFileTypes: true })) {
    const sourcePath = path.join(renderer, entry.name);
    const outputPath = path.join(www, entry.name);
    if (entry.isDirectory()) fs.cpSync(sourcePath, outputPath, { recursive: true });
    else if (entry.isFile()) fs.copyFileSync(sourcePath, outputPath);
  }
  fs.copyFileSync(nm('sql.js/dist/sql-wasm.wasm'), path.join(www, 'sql-wasm.wasm'));
  fs.copyFileSync(path.join(raiz, 'build', 'icon-192.png'), path.join(www, 'icon-192.png'));
  fs.copyFileSync(path.join(raiz, 'build', 'icon-512.png'), path.join(www, 'icon-512.png'));
  let html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' https://localhost; img-src \'self\' data: blob:; style-src \'self\' \'unsafe-inline\'; script-src \'self\' \'wasm-unsafe-eval\'; connect-src \'self\' https: data: blob:; media-src \'self\' blob:">');
  html = html.replace('<title>AulaPro</title>', '<meta name="theme-color" content="#0056D2">\n<link rel="manifest" href="./manifest.webmanifest">\n<link rel="apple-touch-icon" href="./icon-192.png">\n<title>AulaPro</title>');
  html = html.replace('<script src="core.js">', '<script src="backend.js"></script>\n<script src="pwa.js" defer></script>\n<script src="core.js">');
  fs.writeFileSync(path.join(www, 'index.html'), html);

  fs.writeFileSync(path.join(www, 'manifest.webmanifest'), JSON.stringify({
    id: './',
    name: 'AulaPro',
    short_name: 'AulaPro',
    description: 'AulaPro — ferramentas offline para professores.',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#F4F8FF',
    theme_color: '#0056D2',
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }, null, 2) + '\n');

  const listarRecursos = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) return listarRecursos(path.join(directory, entry.name), relativePath);
      return entry.isFile() && entry.name !== 'service-worker.js' ? [`./${relativePath}`] : [];
    });
  const recursos = listarRecursos(www);
  const hash = crypto.createHash('sha256');
  for (const recurso of recursos) {
    const relativo = recurso.slice(2);
    hash.update(relativo).update(fs.readFileSync(path.join(www, relativo)));
  }
  const cache = `aulapro-${versao}-${hash.digest('hex').slice(0, 12)}`;
  const worker = `'use strict';\nconst CACHE = '${cache}';\nconst ASSETS = ${JSON.stringify(recursos)};\nself.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));\nself.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('aulapro-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));\nself.addEventListener('fetch', (event) => {\n  const request = event.request;\n  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;\n  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).catch((error) => {\n    if (request.mode === 'navigate') return caches.match('./index.html');\n    throw error;\n  })));\n});\n`;
  fs.writeFileSync(path.join(www, 'service-worker.js'), worker);
  console.log('www/ pronto para Android e instalação PWA.');
})().catch((e) => { console.error(e); process.exit(1); });
