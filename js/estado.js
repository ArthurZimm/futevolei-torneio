/*
 * Ler e salvar o torneio. Dois modos, escolhidos sozinhos:
 *   'api'   -> servidor (Vercel): GET público, POST só com login (cookie httpOnly).
 *   'local' -> localStorage, quando não há servidor (desenvolvimento com arquivos estáticos).
 */
(function (root) {
  'use strict';

  var CHAVE_LOCAL = 'torneio-box-castelandia';
  var Estado = { modo: null, ERRO: ErroEstado };

  // codigo: 'conflito' (409) | 'sessao' (401) | 'senha' | 'limite' (429) | 'servidor' | 'rede'
  function ErroEstado(codigo, mensagem) {
    var e = new Error(mensagem);
    e.name = 'ErroEstado';
    e.codigo = codigo;
    return e;
  }

  function json(url, opcoes) {
    opcoes = opcoes || {};
    opcoes.cache = 'no-store';
    opcoes.credentials = 'same-origin';
    return fetch(url, opcoes).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (corpo) { return { status: r.status, corpo: corpo }; });
    }, function () { throw ErroEstado('rede', 'Sem conexão com o servidor.'); });
  }

  function lerLocal() {
    try {
      var bruto = root.localStorage.getItem(CHAVE_LOCAL);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) { return null; }
  }

  function inicial() { return root.Chave.estadoInicial(); }

  Estado.iniciar = function () {
    if (Estado.modo) return Promise.resolve(Estado.modo);
    return fetch('/api/estado', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { Estado.modo = j && 'mudou' in j ? 'api' : 'local'; })
      .catch(function () { Estado.modo = 'local'; })
      .then(function () { return Estado.modo; });
  };

  Estado.carregar = function () {
    if (Estado.modo === 'local') return Promise.resolve(lerLocal() || inicial());
    return json('/api/estado').then(function (r) {
      if (r.status !== 200 || !r.corpo) throw ErroEstado('servidor', (r.corpo && r.corpo.erro) || 'Erro ao carregar o torneio.');
      var e = r.corpo.estado || inicial();
      e.versao = r.corpo.versao;
      return e;
    });
  };

  // Para a atualização automática: devolve o estado novo, ou null se nada mudou.
  Estado.verificar = function (versaoConhecida) {
    if (Estado.modo === 'local') {
      var l = lerLocal();
      return Promise.resolve(l && l.versao !== versaoConhecida ? l : null);
    }
    return json('/api/estado?v=' + versaoConhecida).then(function (r) {
      if (r.status !== 200 || !r.corpo || r.corpo.mudou === false) return null;
      var e = r.corpo.estado || inicial();
      e.versao = r.corpo.versao;
      return e;
    });
  };

  // Salva o estado inteiro (admin). Devolve o estado como o servidor guardou (com a versão nova).
  Estado.salvar = function (estado) {
    if (Estado.modo === 'local') {
      var guardado = lerLocal();
      if (guardado && guardado.versao !== estado.versao) {
        return Promise.reject(ErroEstado('conflito', 'Outra aba alterou o torneio. Recarregue a página.'));
      }
      var novo = JSON.parse(JSON.stringify(estado));
      novo.versao = (estado.versao || 0) + 1;
      novo.atualizadoEm = new Date().toISOString();
      try { root.localStorage.setItem(CHAVE_LOCAL, JSON.stringify(novo)); }
      catch (e) { return Promise.reject(ErroEstado('servidor', 'Não foi possível guardar no navegador.')); }
      return Promise.resolve(novo);
    }
    return json('/api/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: estado, versaoBase: estado.versao || 0 })
    }).then(function (r) {
      if (r.status === 200) { r.corpo.estado.versao = r.corpo.versao; return r.corpo.estado; }
      var msg = (r.corpo && r.corpo.erro) || 'Erro ao salvar.';
      if (r.status === 409) throw ErroEstado('conflito', msg);
      if (r.status === 401) throw ErroEstado('sessao', msg);
      throw ErroEstado('servidor', msg);
    });
  };

  Estado.sessaoAdmin = function () {
    if (Estado.modo === 'local') return Promise.resolve(true); // sem servidor não há senha (só desenvolvimento)
    return json('/api/login').then(function (r) { return !!(r.corpo && r.corpo.admin); });
  };

  Estado.entrar = function (senha) {
    if (Estado.modo === 'local') return Promise.resolve();
    return json('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: senha })
    }).then(function (r) {
      if (r.status === 200) return;
      var msg = (r.corpo && r.corpo.erro) || 'Não foi possível entrar.';
      throw ErroEstado(r.status === 429 ? 'limite' : (r.status === 401 ? 'senha' : 'servidor'), msg);
    });
  };

  Estado.sair = function () {
    if (Estado.modo === 'local') return Promise.resolve();
    return json('/api/logout', { method: 'POST' }).then(function () {});
  };

  // Atualização automática (a cada ~15 s e ao voltar para a aba). obter() devolve a versão que a tela já tem.
  Estado.assinar = function (obter, aoMudar, intervaloMs) {
    var rodando = false;
    function checar() {
      if (rodando || (root.document && root.document.hidden)) return;
      rodando = true;
      Estado.verificar(obter()).then(function (novo) { if (novo) aoMudar(novo); })
        .catch(function () { /* sem rede: tenta de novo no próximo ciclo */ })
        .then(function () { rodando = false; });
    }
    var timer = setInterval(checar, intervaloMs || 15000);
    var ao = function () { if (!root.document.hidden) checar(); };
    root.document.addEventListener('visibilitychange', ao);
    var aoStorage = function (ev) { if (Estado.modo === 'local' && ev.key === CHAVE_LOCAL) checar(); };
    root.addEventListener('storage', aoStorage);
    return function parar() {
      clearInterval(timer);
      root.document.removeEventListener('visibilitychange', ao);
      root.removeEventListener('storage', aoStorage);
    };
  };

  Estado.apagarLocal = function () { try { root.localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* ignora */ } };

  root.Estado = Estado;
})(window);
