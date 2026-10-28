'use strict';

const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');
const { PNG } = require('pngjs');

const buildDir = path.join(__dirname, '..', 'build');
const sourcePath = path.join(buildDir, 'icon.png');
const source = fs.readFileSync(sourcePath);
const ico = png2icons.createICO(source, png2icons.BICUBIC, 0, false, true);
const icns = png2icons.createICNS(source, png2icons.BICUBIC, 0);

if (!ico || !icns) {
  throw new Error('Não foi possível converter build/icon.png para os formatos de ícone desktop.');
}

fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(buildDir, 'icon.icns'), icns);

function resizePng(size) {
  const original = PNG.sync.read(source);
  const output = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sourceX = Math.min(original.width - 1, Math.floor(x * original.width / size));
      const sourceY = Math.min(original.height - 1, Math.floor(y * original.height / size));
      const from = (sourceY * original.width + sourceX) * 4;
      const to = (y * size + x) * 4;
      original.data.copy(output.data, to, from, from + 4);
    }
  }
  return PNG.sync.write(output);
}

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(buildDir, `icon-${size}.png`), resizePng(size));
}

console.log('Ícones Windows, macOS e PWA gerados em build/.');
