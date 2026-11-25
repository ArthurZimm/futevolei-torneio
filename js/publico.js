/* Página pública: roteamento por hash (#/inicio, #/sorteio, #/chave, #/jogos, #/podio) e atualização automática. */
(function () {
  'use strict';
  var estado = null, abaChave = 'G';
  var ROTAS = ['inicio', 'sorteio', 'chave', 'jogos', 'podio'];
  var app = document.getElementById('app'), nav = document.getElementById('nav'), dialogo = document.getElementById('dialogo');

  function rotaAtual() {
    var r = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/')[0];
    return ROTAS.indexOf(r) === -1 ? 'inicio' : r;
  }

  function renderizar() {
    if (!estado) return;
    var rota = rotaAtual();
    // mantém a rolagem lateral da chave quando a página se atualiza sozinha
    var rolagem = app.querySelector('.chave-rolagem');
    var rolagemX = rolagem ? rolagem.scrollLeft : 0;

    var html = '';
    if (Estado.modo === 'local') html += '<div class="aviso-local mt-2">Modo local: sem servidor, os dados ficam só neste navegador.</div>';
    if (rota === 'inicio') html += UI.viewInicio(estado);
    else if (rota === 'sorteio') html += UI.viewSorteio(estado);
    else if (rota === 'chave') html += UI.viewChave(estado, abaChave);
    else if (rota === 'jogos') html += UI.viewJogos(estado);
    else html += UI.viewPodio(estado);

    app.className = 'app' + (rota === 'chave' ? ' app-largo' : '');
    document.body.setAttribute('data-rota', rota);
    app.innerHTML = html;
    nav.innerHTML = UI.navInferior(rota);
    document.title = (rota === 'inicio' ? '' : rota.charAt(0).toUpperCase() + rota.slice(1) + ' · ') + estado.config.nome;

    var nova = app.querySelector('.chave-rolagem');
    if (nova && rolagemX) nova.scrollLeft = rolagemX;
    // se um diálogo de jogo está aberto, atualiza o conteúdo dele também
    if (dialogo.open && dialogo.dataset.jogo) mostrarJogo(dialogo.dataset.jogo, true);
  }

  function mostrarJogo(id, soAtualizar) {
    var g = estado.jogos.filter(function (j) { return j.id === id; })[0];
    if (!g) return;
    dialogo.innerHTML = UI.detalheJogo(estado, g);
    dialogo.dataset.jogo = id;
    if (!soAtualizar && !dialogo.open) dialogo.showModal();
  }

  document.addEventListener('click', function (ev) {
    var aba = ev.target.closest('[data-aba]');
    if (aba) { abaChave = aba.getAttribute('data-aba'); renderizar(); return; }
    var jogo = ev.target.closest('[data-jogo]');
    if (jogo) mostrarJogo(jogo.getAttribute('data-jogo'));
  });
  dialogo.addEventListener('click', function (ev) { if (ev.target === dialogo) dialogo.close(); });
  dialogo.addEventListener('close', function () { delete dialogo.dataset.jogo; });
  window.addEventListener('hashchange', function () { renderizar(); window.scrollTo(0, 0); });

  Estado.iniciar()
    .then(function () { return Estado.carregar(); })
    .then(function (e) {
      estado = e;
      renderizar();
      Estado.assinar(function () { return estado.versao; }, function (novo) { estado = novo; renderizar(); }, 15000);
    })
    .catch(function (e) {
      app.innerHTML = '<div class="cartao p-4 text-center my-5"><div class="titulo fs-5 mb-1">Não deu para carregar</div><div class="texto-2">' + UI.esc(e.message) + '</div>' +
        '<button class="btn btn-sec mt-3" onclick="location.reload()">Tentar de novo</button></div>';
    });
})();
