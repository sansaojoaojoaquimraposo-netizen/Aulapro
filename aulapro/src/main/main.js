'use strict';
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');
const dbm = require('./db');
const { registarHandlers, verificacaoAutomatica } = require('./ipc');

let janela;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1000, minHeight: 640,
    title: 'AulaPro', backgroundColor: '#F4F8FF',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janela.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  Menu.setApplicationMenu(null);
}

const trava = app.requestSingleInstanceLock();
if (!trava) app.quit();
else {
  app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });
  app.whenReady().then(() => {
    // Microfone permitido apenas para o Assistente de Voz.
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    dbm.init(app.getPath('userData'));
    registarHandlers(() => janela);
    criarJanela();
    setInterval(() => { try { verificacaoAutomatica(); } catch (e) { dbm.log(null, 'erro', 'auto-verificação: ' + e.message); } }, 60 * 1000);
    try { require('electron-updater').autoUpdater.checkForUpdatesAndNotify(); } catch { /* sem rede ou sem servidor */ }
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) criarJanela(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
