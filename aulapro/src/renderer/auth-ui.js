'use strict';
// Ecrãs de entrada: login, registo, recuperação de palavra-passe e acesso do desenvolvedor.
function mostrarAuth(modo = 'entrar') {
  const r = $('#raiz');
  const logo = `<div class="logo"><img src="logo.png" alt=""><h1>AulaPro</h1><div class="mut">Ensina. O resto a gente faz.</div></div>`;
  const rodape = (html) => `<p class="sm mut" style="text-align:center;margin-top:14px">${html}</p>`;
  const vistas = {
    entrar: () => `${logo}<div class="card"><h2>Entrar</h2>
      <label>Email</label><input id="e" type="email" autocomplete="username">
      <label>Palavra-passe</label><input id="s" type="password" autocomplete="current-password">
      <button id="go" style="width:100%;margin-top:16px">Entrar</button></div>
      ${rodape('<a href="#" data-v="registar">Criar conta grátis</a> · <a href="#" data-v="recuperar">Esqueci a palavra-passe</a>')}
      ${window.api.plataforma === 'android' ? '' : rodape('<a href="#" data-v="admin">Acesso do desenvolvedor</a>')}`,
    registar: () => `${logo}<div class="card"><h2>Criar conta</h2>
      <label>Nome completo</label><input id="n"><label>Email</label><input id="e" type="email">
      <div class="grid g2"><div><label>Telefone</label><input id="t" placeholder="84 000 0000"></div><div><label>Cidade</label><input id="c" placeholder="Beira, Maputo…"></div></div>
      <label>Escola</label><input id="es"><label>Disciplina principal</label><input id="d">
      <label>Perfil</label><select id="p"><option value="professor">Professor</option><option value="director">Director</option></select>
      <label>Palavra-passe (mín. 6 caracteres e 1 símbolo)</label><input id="s" type="password" autocomplete="new-password">
      <button id="go" style="width:100%;margin-top:16px">Criar conta</button></div>${rodape('<a href="#" data-v="entrar">Já tenho conta</a>')}`,
    recuperar: () => `${logo}<div class="card"><h2>Recuperar palavra-passe</h2>
      <label>Email da conta</label><input id="e" type="email"><button id="go" style="width:100%;margin-top:14px">Gerar código (válido 15 min)</button>
      <div id="r2" class="hide"><div class="card" style="margin:12px 0;background:var(--bg)"><b>Código:</b> <span id="cod" class="az b"></span><div class="sm mut">Sem internet o código é mostrado aqui. Com o servidor configurado é enviado por email.</div></div>
      <label>Código</label><input id="c"><label>Nova palavra-passe</label><input id="s" type="password"><button id="go2" style="width:100%;margin-top:14px">Alterar palavra-passe</button></div></div>
      ${rodape('<a href="#" data-v="entrar">Voltar</a>')}`,
    admin: () => `${logo}<div class="card"><h2>Painel do Desenvolvedor</h2><div id="adm"></div></div>${rodape('<a href="#" data-v="entrar">Voltar</a>')}`,
  };
  r.innerHTML = `<div class="auth"><div class="box">${vistas[modo]()}</div></div>`;
  $$('[data-v]', r).forEach((a) => (a.onclick = (e) => { e.preventDefault(); mostrarAuth(a.dataset.v); }));
  const entrou = (u) => { E.user = u; iniciarApp(); };
  const enter = (fn) => $$('input', r).forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && fn()));
  if (modo === 'entrar') {
    const go = async () => { const u = await tentar(() => API('auth.entrar', $('#e').value, $('#s').value)); if (u) entrou(u); };
    $('#go').onclick = go; enter(go); $('#e').focus();
  } else if (modo === 'registar') {
    $('#go').onclick = async () => {
      const u = await tentar(() => API('auth.registar', { nome: $('#n').value, email: $('#e').value, telefone: $('#t').value, cidade: $('#c').value,
        escola: $('#es').value, disciplina: $('#d').value, papel: $('#p').value, senha: $('#s').value }));
      if (u) entrou(u);
    };
  } else if (modo === 'recuperar') {
    $('#go').onclick = async () => {
      const x = await tentar(() => API('auth.pedirRecuperacao', $('#e').value)); if (!x) return;
      $('#r2').classList.remove('hide'); $('#cod').textContent = x.codigoLocal || '(enviado para o seu email)';
    };
    $('#go2').onclick = async () => { if (await tentar(() => API('auth.concluirRecuperacao', $('#e').value, $('#c').value, $('#s').value), 'Palavra-passe alterada.')) mostrarAuth('entrar'); };
  } else if (modo === 'admin') adminAcesso($('#adm'), entrou);
}

async function adminAcesso(el, entrou) {
  const cfg = await tentar(() => API('auth.adminConfigurado'));
  if (!cfg) {
    el.innerHTML = `<p class="sm mut">Primeira utilização: crie a conta do desenvolvedor. Será gerado um segredo 2FA (TOTP) — guarde-o numa aplicação de autenticação.</p>
      <label>Nome</label><input id="an"><label>Email</label><input id="ae" type="email"><label>Palavra-passe mestra</label><input id="as" type="password">
      <button id="ac" style="width:100%;margin-top:14px">Criar administrador</button>`;
    $('#ac').onclick = async () => {
      const r = await tentar(() => API('auth.configurarAdmin', { nome: $('#an').value, email: $('#ae').value, senha: $('#as').value })); if (!r) return;
      el.innerHTML = `<div class="card" style="background:var(--bg)"><b>Segredo 2FA (mostrado uma só vez):</b><div class="az b" style="font-size:20px;word-break:break-all;margin:8px 0">${esc(r.segredo)}</div>
        <div class="sm mut">Adicione-o ao Google Authenticator / Authy (tipo “baseado no tempo”). URI: <span style="word-break:break-all">${esc(r.uri)}</span></div></div>
        <button id="ok" style="width:100%;margin-top:12px">Já guardei — continuar</button>`;
      $('#ok').onclick = () => adminAcesso(el, entrou);
    };
    return;
  }
  el.innerHTML = `<label>Email</label><input id="ae" type="email"><label>Palavra-passe mestra</label><input id="as" type="password">
    <label>Código 2FA (6 dígitos)</label><input id="a2" inputmode="numeric" maxlength="6"><button id="ac" style="width:100%;margin-top:14px">Entrar</button>`;
  $('#ac').onclick = async () => { const u = await tentar(() => API('auth.entrarAdmin', $('#ae').value, $('#as').value, $('#a2').value)); if (u) entrou(u); };
}
