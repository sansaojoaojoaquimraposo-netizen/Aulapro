'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Ponte segura: a interface só pode chamar canais "api:*" (sem acesso directo a Node).
contextBridge.exposeInMainWorld('api', {
  invocar: async (canal, ...args) => {
    const r = await ipcRenderer.invoke('api:' + canal, ...args);
    if (!r.ok) throw new Error(r.erro);
    return r.data;
  },
  aoReceber: (canal, fn) => ipcRenderer.on('evento:' + canal, (_e, d) => fn(d)),
  plataforma: process.platform,
});
