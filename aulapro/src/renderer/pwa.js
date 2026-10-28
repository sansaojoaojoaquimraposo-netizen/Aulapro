'use strict';

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Não foi possível activar o modo offline do AulaPro:', error);
  });
}

let instalacao;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  instalacao = event;
  const button = document.createElement('button');
  button.id = 'instalar-aulapro';
  button.className = 'pwa-install';
  button.type = 'button';
  button.textContent = 'Instalar AulaPro';
  button.setAttribute('aria-label', 'Instalar AulaPro no dispositivo');
  button.addEventListener('click', async () => {
    if (!instalacao) return;
    await instalacao.prompt();
    instalacao = null;
    button.remove();
  });
  document.body.appendChild(button);
});

window.addEventListener('appinstalled', () => {
  instalacao = null;
  document.getElementById('instalar-aulapro')?.remove();
});
