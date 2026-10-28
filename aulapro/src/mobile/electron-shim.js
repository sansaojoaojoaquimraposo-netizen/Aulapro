'use strict';
// Substitui o módulo 'electron' no Android: IPC directo, selecção de ficheiros e partilha de exportações.
const fs = require('./fs-shim');
const handlers = (globalThis.__handlers = globalThis.__handlers || {});

const ipcMain = { handle: (canal, fn) => { handlers[canal] = fn; } };

function escolherFicheiros(filtros, multiplo) {
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = !!multiplo;
    const ext = (filtros || []).flatMap((f) => f.extensions || []).map((e) => '.' + e); if (ext.length) i.accept = ext.join(',');
    i.style.display = 'none'; document.body.appendChild(i);
    i.addEventListener('change', async () => {
      const caminhos = [];
      for (const f of i.files) { const p = '/incoming/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_'); fs.writeFileSync(p, new Uint8Array(await f.arrayBuffer())); caminhos.push(p); }
      i.remove(); res(caminhos);
    });
    i.addEventListener('cancel', () => { i.remove(); res([]); });
    i.click();
  });
}
const dialog = {
  async showOpenDialog(_j, o) {
    if (o && (o.properties || []).includes('openDirectory')) { if (globalThis.toast) toast('No telemóvel use “Guardar cópia local” para exportar os seus dados.'); return { canceled: true, filePaths: [] }; }
    const c = await escolherFicheiros((o || {}).filters, ((o || {}).properties || []).includes('multiSelections'));
    return { canceled: !c.length, filePaths: c };
  },
  async showSaveDialog(_j, o) { const nome = String((o && o.defaultPath) || 'documento').split(/[\\/]/).pop(); return { canceled: false, filePath: '/export/' + nome }; },
};
const shell = {
  async openExternal(url) { window.open(url, '_blank'); },
  async openPath(p) { const b = fs.readFileSync(p); if (fs.ganchos.aoExportar) fs.ganchos.aoExportar(p.split('/').pop(), new Uint8Array(b)); return ''; },
};
const app = { getPath: () => '/data', getVersion: () => '1.0.0' };
class BrowserWindow {}
module.exports = { ipcMain, dialog, shell, app, BrowserWindow, handlers };
