/*
 * Painel do administrador. Fluxo: login -> configuração -> sorteio -> configurar jogos -> iniciar -> placar.
 * O estado vive em memória; toda alteração passa por mutar(), que aplica numa cópia (se der erro, nada muda),
 * redesenha a tela e agenda o salvamento (uma fila só, com versão, para dois toques seguidos não se atropelarem).
 */
(function () {
  'use strict';
  var esc = UI.esc;
  var app = document.getElementById('app'), dlg = document.getElementById('dlg');

  var estado = null;
  var tela = 'torneio'; // 'torneio' | 'manutencao'
  var logado = false;
  var salvamento = { estado: 'ok', ocupado: false, sujo: false, timer: null, erro: '' };
  var animarCarta = -1;
  var rapido = { jogo: null, aberto: false, venc: null, a: '', b: '' };
  var erros = [];

  // ---------- utilidades ----------

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function $(sel) { return app.querySelector(sel); }
  function ordinal(n) { return n + 'ª'; }

  function rotuloSalvar() {
    var s = salvamento.estado;
    if (s === 'salvando') return '<span class="small texto-2">Salvando…</span>';
    if (s === 'erro') return '<button class="btn btn-sm btn-perigo" data-acao="tentar-salvar">Não salvou · tentar de novo</button>';
    return '<span class="small texto-2">Salvo</span>';
  }

  function atualizarIndicador() {
    var el = document.getElementById('indicador');
    if (el) el.innerHTML = rotuloSalvar();
  }

  // Fila de salvamento: se mudar de novo enquanto salva, salva de novo logo depois com a versão certa.
  function agendarSalvar(atrasoMs) {
    salvamento.sujo = true;
    clearTimeout(salvamento.timer);
    salvamento.timer = setTimeout(drenar, atrasoMs || 0);
  }

  function drenar() {
    if (salvamento.ocupado) return;
    salvamento.ocupado = true;
    salvamento.estado = 'salvando';
    atualizarIndicador();
    (function passo() {
      if (!salvamento.sujo) {
        salvamento.ocupado = false;
        salvamento.estado = 'ok';
        atualizarIndicador();
        return;
      }
      salvamento.sujo = false;
      Estado.salvar(clonar(estado)).then(function (salvo) {
        estado.versao = salvo.versao;
        estado.atualizadoEm = salvo.atualizadoEm;
        passo();
      }, function (e) {
        salvamento.ocupado = false;
        tratarErroDeSalvar(e);
      });
    })();
  }

  function tratarErroDeSalvar(e) {
    salvamento.estado = 'erro';
    salvamento.sujo = true; // continua pendente
    if (e.codigo === 'conflito') {
      // outro aparelho gravou antes: puxa o que está no servidor e descarta a alteração local
      salvamento.sujo = false;
      salvamento.estado = 'ok';
      Estado.carregar().then(function (novo) {
        estado = novo;
        UI.toast('Outro aparelho alterou o torneio. Recarreguei a versão mais nova; refaça a última ação.', 'erro');
        render();
      });
      return;
    }
    if (e.codigo === 'sessao') {
      salvamento.estado = 'ok';
      logado = false;
      UI.toast(e.message, 'erro');
      render();
      return;
    }
    UI.toast(e.message || 'Não foi possível salvar.', 'erro');
    atualizarIndicador();
  }

  // Aplica uma alteração numa cópia; se lançar erro (regra violada), mostra o aviso e não muda nada.
  function mutar(fn, opcoes) {
    opcoes = opcoes || {};
    var copia = clonar(estado);
    try { fn(copia); }
    catch (e) { UI.toast(e.message, 'erro'); return false; }
    estado = copia;
    if (!opcoes.semRender) render();
    agendarSalvar(opcoes.atraso);
    return true;
  }

  // ---------- diálogos ----------

  function abrirDialogo(html) {
    dlg.innerHTML = '<form method="dialog">' + html + '</form>';
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(function (ok) { dlg.addEventListener('close', function () { ok(dlg.returnValue); }, { once: true }); });
  }

  function confirmar(titulo, texto, botao, perigo) {
    return abrirDialogo('<div class="titulo fs-5 mb-2">' + esc(titulo) + '</div><p class="texto-2">' + texto + '</p>' +
      '<div class="d-grid gap-2"><button class="btn ' + (perigo ? 'btn-perigo' : 'btn-destaque') + '" value="ok">' + esc(botao) + '</button>' +
      '<button class="btn btn-fantasma" value="">Cancelar</button></div>').then(function (v) { return v === 'ok'; });
  }

  function escolher(titulo, texto, opcoes) {
    return abrirDialogo('<div class="titulo fs-5 mb-2">' + esc(titulo) + '</div><p class="texto-2">' + esc(texto) + '</p><div class="d-grid gap-2">' +
      opcoes.map(function (o) { return '<button class="btn btn-sec" value="' + esc(o.valor) + '">' + esc(o.rotulo) + '</button>'; }).join('') +
      '<button class="btn btn-fantasma" value="">Cancelar</button></div>');
  }

  // ---------- peças de tela ----------

  function cabecalho(titulo, sobre) {
    return '<header class="topo"><div class="d-flex flex-column"><span class="sobre admin">' + (sobre || 'Modo admin') + '</span><span class="nome">' + esc(titulo) + '</span></div>' +
      '<div class="d-flex align-items-center gap-2"><span id="indicador">' + rotuloSalvar() + '</span>' +
      '<button class="pilula" data-acao="sair">Sair</button></div></header>';
  }

  function abasAdmin() {
    return '<div class="abas mb-3" role="tablist">' +
      '<button type="button" class="aba' + (tela === 'torneio' ? ' on' : '') + '" data-acao="tela" data-tela="torneio">Torneio</button>' +
      '<button type="button" class="aba' + (tela === 'manutencao' ? ' on' : '') + '" data-acao="tela" data-tela="manutencao">Manutenção</button>' +
      '<a class="aba d-flex align-items-center justify-content-center" href="index.html" target="_blank" rel="noopener" style="text-decoration:none">Ver site ↗</a></div>';
  }

  function passos(ativo, nomes, feitos) {
    return '<ol class="passos mb-3">' + nomes.map(function (n, i) {
      return '<li class="' + (i === ativo ? 'on' : '') + '">' + (i + 1) + ' · ' + n + (i < feitos ? ' ✓' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function listaDeErros() {
    if (!erros.length) return '';
    return '<div class="alert alert-danger py-2 small" role="alert" style="background:var(--perdedores-escuro);border-color:#5A2A26;color:var(--perdedores)"><ul class="mb-0 ps-3">' +
      erros.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
  }

  // ---------- login ----------

  function telaLogin() {
    return '<header class="topo"><div class="d-flex flex-column"><span class="sobre admin">Modo admin</span><span class="nome">Entrar</span></div>' +
      '<a class="pilula" href="index.html">Voltar ao site</a></header>' +
      '<form class="cartao p-3 d-flex flex-column gap-3" data-form="login" autocomplete="off">' +
      '<label class="d-flex flex-column gap-1"><span class="rotulo">Senha do administrador</span>' +
      '<input id="senha" type="password" class="form-control form-control-lg" autocomplete="current-password" required autofocus></label>' +
      '<button class="btn btn-destaque" type="submit">Entrar</button>' +
      '<p class="small texto-2 mb-0">Só quem tem a senha altera o torneio. Todo mundo pode acompanhar pelo site.</p>' +
      '<button type="button" class="btn btn-link texto-2 small p-0" data-acao="limpar-cache">Limpar cache</button></form>';
  }

  // ---------- 1. configuração ----------

  function contadorTexto(campo) {
    var c = Sorteio.nomes(estado.entrada[campo]).length;
    if (campo === 'duplas') return c + (c === 1 ? ' dupla' : ' duplas');
    return c + (c === 1 ? ' jogador' : ' jogadores');
  }

  // Quantas duplas dá com o que está escrito, e o que falta acertar (os dois potes iguais, lista par, 4 a 32).
  function resumoEntrada() {
    var c = estado.config, e = estado.entrada, cont = function (t) { return Sorteio.nomes(t).length; }, n;
    var min = Sorteio.MIN_DUPLAS, max = Sorteio.MAX_DUPLAS;
    if (c.modo === 'prontas') {
      n = cont(e.duplas);
    } else if (c.usarPotes) {
      var a = cont(e.pote1), b = cont(e.pote2);
      if (a !== b) return { ok: false, texto: 'O pote 1 tem ' + a + ' e o pote 2 tem ' + b + '. Os dois precisam ter a mesma quantidade.' };
      n = a;
    } else {
      var t = cont(e.lista);
      if (t % 2) return { ok: false, texto: t + ' jogadores: precisa de uma quantidade par para formar as duplas.' };
      n = t / 2;
    }
    if (n === 0) return { ok: false, texto: 'Cole os jogadores abaixo. Dá para sortear de ' + min + ' a ' + max + ' duplas.' };
    if (n < min || n > max) return { ok: false, texto: n + ' duplas. O sorteio precisa de ' + min + ' a ' + max + '.' };
    return { ok: true, texto: n + ' duplas' + (n % 2 ? ' · número ímpar: uma dupla passa direto para a próxima fase' : '') };
  }

  function htmlResumo() {
    var r = resumoEntrada();
    return '<div id="resumo-entrada" class="small fw-medium" style="color:' + (r.ok ? 'var(--destaque)' : 'var(--perdedores)') + '">' + esc(r.texto) + '</div>';
  }

  function atualizarResumo(campo) {
    var cnt = document.getElementById('cnt-' + campo);
    if (cnt) cnt.textContent = contadorTexto(campo);
    var box = document.getElementById('resumo-entrada'), r = resumoEntrada();
    if (box) {
      box.textContent = r.texto;
      box.style.color = r.ok ? 'var(--destaque)' : 'var(--perdedores)';
    }
  }

  function botoesImportarSorteio(classe) {
    return '<label class="btn ' + (classe || 'btn-fantasma') + ' d-flex align-items-center justify-content-center m-0" for="arquivo-sorteio">Importar sorteio (JSON)</label>' +
      '<input id="arquivo-sorteio" type="file" accept="application/json,.json" class="visually-hidden" data-campo="importar-sorteio">';
  }

  function telaConfig() {
    var c = estado.config, e = estado.entrada;
    var campo = function (id, rotulo, ajuda, placeholder) {
      return '<label class="d-flex flex-column gap-1"><span class="d-flex justify-content-between"><span class="rotulo">' + rotulo + '</span>' +
        '<span class="small texto-2" id="cnt-' + id + '">' + contadorTexto(id) + '</span></span>' +
        '<textarea class="form-control" data-campo="' + id + '" rows="8" placeholder="' + esc(placeholder) + '" spellcheck="false">' + esc(e[id]) + '</textarea>' +
        (ajuda ? '<span class="small texto-2">' + ajuda + '</span>' : '') + '</label>';
    };
    var campos;
    if (c.modo === 'prontas') {
      campos = campo('duplas', 'Duplas formadas', 'Uma dupla por linha, os dois nomes separados por /.', 'Arthur / Matheus\nRafa / Pedro');
    } else if (c.usarPotes) {
      campos = campo('pote1', 'Pote 1', 'Um jogador por linha. Cada dupla leva um de cada pote (ex.: os mais fortes no pote 1).', 'Arthur\nRafa\nBruno') +
        campo('pote2', 'Pote 2', '', 'Matheus\nPedro\nLucas');
    } else {
      campos = campo('lista', 'Jogadores', 'Um por linha. As duplas saem do sorteio.', 'Arthur\nRafa\nBruno');
    }
    return cabecalho('Configuração') + abasAdmin() + passos(0, ['Jogadores', 'Duplas', 'Chave'], 0) +
      '<div class="d-flex flex-column gap-3">' +
      '<label class="d-flex flex-column gap-1"><span class="rotulo">Nome do torneio</span><input class="form-control" data-campo="nome" value="' + esc(c.nome) + '" maxlength="60"></label>' +
      '<fieldset class="d-flex flex-column gap-2"><legend class="rotulo fs-6 mb-0">Como entram os jogadores</legend>' +
      '<div class="form-check"><input class="form-check-input" type="radio" name="modo" id="modo-avulsos" value="avulsos" data-campo="modo"' + (c.modo === 'avulsos' ? ' checked' : '') + '><label class="form-check-label" for="modo-avulsos">Jogadores avulsos (o site sorteia as duplas)</label></div>' +
      '<div class="form-check"><input class="form-check-input" type="radio" name="modo" id="modo-prontas" value="prontas" data-campo="modo"' + (c.modo === 'prontas' ? ' checked' : '') + '><label class="form-check-label" for="modo-prontas">Duplas já formadas (o site sorteia só a ordem na chave)</label></div></fieldset>' +
      (c.modo === 'avulsos' ? '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="usarPotes" data-campo="usarPotes"' + (c.usarPotes ? ' checked' : '') + '><label class="form-check-label" for="usarPotes">Usar dois potes (equilibra as duplas)</label></div>' : '') +
      '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="finalComReset" data-campo="finalComReset"' + (c.finalComReset ? ' checked' : '') + '><label class="form-check-label" for="finalComReset">Grande final com reset (jogo extra se a dupla de baixo vencer)</label></div>' +
      campos + htmlResumo() + listaDeErros() +
      '<button class="btn btn-destaque" data-acao="ir-sorteio">Ir para o sorteio</button>' +
      botoesImportarSorteio() +
      '<p class="small texto-2 mb-0">O número de duplas vem da lista acima. Já tem um sorteio salvo em arquivo? Importe aqui para pular o sorteio.</p></div>';
  }

  function irParaSorteio() {
    var c = estado.config, e = estado.entrada;
    var r = Sorteio.validar({ modo: c.modo, usarPotes: c.usarPotes, pote1: e.pote1, pote2: e.pote2, lista: e.lista, duplas: e.duplas });
    erros = r.erros;
    if (erros.length) { render(); return; }
    mutar(function (x) { sortearEm(x, r); x.fase = 'sorteio'; });
  }

  // Faz o sorteio das duplas e da ordem em que as cartas viram, a partir de uma entrada já validada.
  function sortearEm(x, r) {
    var comPotes = x.config.usarPotes && x.config.modo === 'avulsos';
    x.config.numDuplas = r.n;
    x.jogadores = r.jogadores;
    x.duplas = Sorteio.sortear({ jogadores: r.jogadores, pares: r.pares, usarPotes: comPotes });
    x.sorteio = { revelados: 0, ordem: Sorteio.ordemDeRevelacao(x.duplas, x.jogadores) };
    x.jogos = []; x.historico = [];
  }

  // Ordem em que as cartas viram: a guardada no sorteio, ou a ordem dos cabeças se não houver (estados antigos).
  function ordemDasCartas() {
    var n = estado.duplas.length, o = estado.sorteio && estado.sorteio.ordem;
    if (Array.isArray(o) && o.length === n) return o;
    return estado.duplas.map(function (d, i) { return i; });
  }

  // ---------- 2. sorteio ----------

  function telaSorteio() {
    var n = estado.duplas.length, rev = estado.sorteio.revelados, todas = rev >= n;
    var c = estado.config;
    var chips = function (lista) { return lista.map(function (j) { return '<span class="chip">' + esc(j.nome) + '</span>'; }).join(''); };
    var potes = '';
    if (c.modo === 'avulsos' && c.usarPotes) {
      potes = '<div class="rotulo">Pote 1 · ' + estado.jogadores.filter(function (j) { return j.pote === 1; }).length + '</div><div class="d-flex flex-wrap gap-2">' + chips(estado.jogadores.filter(function (j) { return j.pote === 1; })) + '</div>' +
        '<div class="rotulo mt-2">Pote 2 · ' + estado.jogadores.filter(function (j) { return j.pote === 2; }).length + '</div><div class="d-flex flex-wrap gap-2">' + chips(estado.jogadores.filter(function (j) { return j.pote === 2; })) + '</div>';
    } else {
      potes = '<div class="rotulo">Jogadores · ' + estado.jogadores.length + '</div><div class="d-flex flex-wrap gap-2">' + chips(estado.jogadores) + '</div>';
    }
    // as cartas viram na ordem do sorteio; cabeça de chave e bye só são sorteados depois, quando a chave for montada
    var cartas = ordemDasCartas().map(function (idx, k) {
      var d = estado.duplas[idx], aberta = k < rev;
      var virada = aberta && k !== animarCarta;
      var etiqueta = aberta ? ordinal(k + 1) + ' sorteada' : '';
      return '<div class="col-6"><div class="carta' + (virada ? ' virada' : '') + (k === rev - 1 ? ' ultima' : '') + '" data-carta="' + k + '"><div class="carta-miolo">' +
        '<div class="carta-verso" aria-label="Carta ainda não revelada">?</div>' +
        '<div class="carta-frente"><span class="ordem">' + esc(etiqueta) + '</span><span class="fw-medium" style="font-size:14px">' + (aberta ? esc(d.nome) : '') + '</span></div></div></div></div>';
    }).join('');
    return cabecalho('Sorteio') + abasAdmin() + passos(1, ['Jogadores', 'Duplas', 'Chave'], 1) +
      '<div class="d-flex flex-column gap-3"><section class="d-flex flex-column gap-2">' + potes + '</section>' +
      '<section class="row g-2">' + cartas + '</section>' +
      '<div class="d-flex flex-column gap-2">' +
      '<button class="btn btn-destaque" data-acao="revelar"' + (todas ? ' disabled' : '') + '>' + (todas ? 'Todas reveladas' : 'Revelar próxima dupla') + '</button>' +
      (todas ? '' : '<button class="btn btn-fantasma" data-acao="revelar-todas">Revelar todas de uma vez</button>') +
      '<button class="btn btn-sec" data-acao="salvar-sorteio"' + (todas ? '' : ' disabled') + '>Salvar sorteio (montar a chave depois)</button>' +
      '<button class="btn btn-fantasma" data-acao="confirmar-sorteio"' + (todas ? '' : ' disabled') + '>Montar a chave agora</button>' +
      '<div class="row g-2"><div class="col-6"><button class="btn btn-fantasma w-100" data-acao="sortear-de-novo">Sortear de novo</button></div>' +
      '<div class="col-6"><button class="btn btn-fantasma w-100 h-100" data-acao="baixar-sorteio">Baixar sorteio (JSON)</button></div></div>' +
      botoesImportarSorteio('btn-fantasma') +
      '<button class="btn btn-link texto-2" data-acao="voltar-config">Voltar e editar os jogadores</button></div></div>';
  }

  // ---------- 2b. sorteio salvo (chave ainda não montada) ----------

  function telaSorteado() {
    var linhas = ordemDasCartas().map(function (idx, k) {
      return '<div class="linha-pos"><span class="pos">' + (k + 1) + '</span><span class="flex-grow-1">' + esc(estado.duplas[idx].nome) + '</span></div>';
    }).join('');
    return cabecalho('Sorteio salvo') + abasAdmin() + passos(2, ['Jogadores', 'Duplas', 'Chave'], 2) +
      '<div class="d-flex flex-column gap-3">' +
      '<p class="texto-2 small mb-0">O sorteio das duplas está salvo e o site já mostra as duplas. Ao montar a chave (por exemplo, no dia do torneio) é feito o sorteio da chave: a posição de cada dupla e, se o número de duplas for ímpar, quem passa direto.</p>' +
      '<section class="cartao overflow-hidden">' + linhas + '</section>' +
      '<button class="btn btn-destaque" data-acao="confirmar-sorteio">Montar a chave e configurar jogos</button>' +
      '<div class="row g-2"><div class="col-6"><button class="btn btn-fantasma w-100" data-acao="sortear-de-novo">Sortear de novo</button></div>' +
      '<div class="col-6"><button class="btn btn-fantasma w-100 h-100" data-acao="baixar-sorteio">Baixar sorteio (JSON)</button></div></div>' +
      '<button class="btn btn-link texto-2" data-acao="voltar-config">Voltar e editar os jogadores</button></div>';
  }

  // ---------- 3. configurar jogos ----------

  function presetAtual() {
    var n = estado.duplas.length;
    var chaves = Object.keys(Chave.ATALHOS);
    for (var i = 0; i < chaves.length; i++) {
      var alvo = Chave.formatosDoAtalho(n, chaves[i]), igual = true;
      Object.keys(alvo).forEach(function (f) {
        var a = alvo[f], b = estado.config.formatos[f];
        if (!b || a.pontos !== b.pontos || a.md !== b.md) igual = false;
      });
      if (igual) return chaves[i];
    }
    return 'personalizado';
  }

  function telaConfigJogos() {
    var preset = presetAtual(), fases = Chave.fasesDoEstado(estado), cfg = estado.config;
    var atalhos = Object.keys(Chave.ATALHOS).map(function (k) {
      return '<button class="atalho' + (preset === k ? ' on' : '') + '" data-acao="atalho" data-atalho="' + k + '">' + Chave.ATALHOS[k].nome + '</button>';
    }).join('') + '<button class="atalho' + (preset === 'personalizado' ? ' on' : '') + '" disabled>Personalizado</button>';

    var minSets = 0, maxSets = 0, total = 0;
    var linhas = fases.filter(function (f) { return f.jogos > 0; }).map(function (f) {
      var fm = cfg.formatos[f.id];
      minSets += f.jogos * Math.ceil(fm.md / 2); maxSets += f.jogos * fm.md; total += f.jogos;
      var cor = f.chave === 'P' ? 'var(--perdedores)' : (f.chave === 'GF' ? 'var(--texto)' : 'var(--destaque)');
      var seg = function (campo, valores, atual, fmt) {
        return '<div class="seg" role="group">' + valores.map(function (v) {
          return '<button type="button" class="' + (atual === v ? 'on' : '') + '" data-acao="formato" data-fase="' + f.id + '" data-campo="' + campo + '" data-valor="' + v + '" aria-pressed="' + (atual === v) + '">' + fmt(v) + '</button>';
        }).join('') + '</div>';
      };
      return '<div class="p-3 d-flex flex-column gap-2" style="border-bottom:1px solid var(--linha)"><div class="d-flex justify-content-between align-items-baseline">' +
        '<span class="fw-semibold" style="color:' + cor + '">' + f.nome + '</span><span class="small texto-2">' + f.jogos + (f.jogos > 1 ? ' jogos' : ' jogo') + '</span></div>' +
        '<div class="row g-2"><div class="col-5">' + seg('pontos', [15, 18], fm.pontos, function (v) { return v + ' pts'; }) + '</div>' +
        '<div class="col-7">' + seg('md', [1, 3, 5], fm.md, function (v) { return 'MD' + v; }) + '</div></div></div>';
    }).join('');

    var dec = cfg.setDecisivo;
    var segDec = '<div class="seg" style="width:170px">' + [[11, '11'], [15, '15'], [null, 'igual']].map(function (o) {
      return '<button type="button" class="' + (dec === o[0] ? 'on' : '') + '" data-acao="decisivo" data-valor="' + (o[0] === null ? '' : o[0]) + '" aria-pressed="' + (dec === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';

    return cabecalho('Configurar jogos') + abasAdmin() + passos(1, ['Sorteio', 'Jogos', 'Iniciar'], 1) +
      '<div class="d-flex flex-column gap-3"><section class="d-flex flex-column gap-2"><span class="rotulo">Atalhos</span><div class="atalhos">' + atalhos + '</div></section>' +
      '<section class="cartao overflow-hidden">' + linhas +
      '<div class="d-flex align-items-center gap-2 p-3"><div class="flex-grow-1 d-flex flex-column"><span class="fw-medium">Set decisivo</span><span class="small texto-2">último set do MD3/MD5</span></div>' + segDec + '</div></section>' +
      '<section class="row g-2"><div class="col-6"><div class="cartao p-3"><div class="titulo fs-5">' + total + ' jogos</div><span class="small texto-2">' + (cfg.finalComReset ? '+1 se houver reset' : 'sem reset') + '</span></div></div>' +
      '<div class="col-6"><div class="cartao p-3"><div class="titulo fs-5">' + (minSets === maxSets ? minSets : minSets + ' a ' + maxSets) + ' sets</div><span class="small texto-2">no torneio inteiro</span></div></div></section>' +
      '<div class="d-flex flex-column gap-2"><button class="btn btn-destaque d-flex align-items-center justify-content-center gap-2" data-acao="iniciar">' + UI.icone.play() + 'Iniciar torneio</button>' +
      '<p class="small texto-2 text-center mb-0">Depois de iniciar, essa configuração trava. O reset usa a mesma regra da grande final.</p></div></div>';
  }

  // ---------- 4. placar ----------

  function descreverAcao(a) {
    if (!a) return '';
    var g = Chave.jogoPorId(estado, a.jogo);
    if (a.t === 'set') return 'o placar ' + a.a + ' × ' + a.b + ' do jogo ' + g.id;
    if (a.t === 'wo') return 'o WO de ' + Chave.nomeDupla(estado, a.faltou) + ' no jogo ' + g.id;
    return 'a vitória de ' + Chave.nomeDupla(estado, a.vencedor) + ' no jogo ' + g.id;
  }

  function telaPlacar() {
    var ctx = UI.contexto(estado), g = ctx.emQuadra;
    if (!g) return cabecalho('Lançar placar') + abasAdmin() + UI.vazio('Nenhum jogo pronto', 'Os próximos jogos aparecem quando as duplas estiverem definidas.');
    var f = g.formato, alvo = Chave.alvoDoSet(g);
    var pa = g.parcial ? g.parcial.a : 0, pb = g.parcial ? g.parcial.b : 0;
    var nomeA = Chave.nomeDupla(estado, g.duplaA), nomeB = Chave.nomeDupla(estado, g.duplaB);
    var fechou = Math.max(pa, pb) >= alvo && pa !== pb;
    var need = Chave.setsParaVencer(g), wins = { a: 0, b: 0 };
    g.sets.forEach(function (s) { if (s.a > s.b) wins.a++; else wins.b++; });
    var ganharia = fechou && (pa > pb ? wins.a : wins.b) + 1 >= need;
    var rotuloFim = ganharia || f.md === 1 ? 'Finalizar jogo' : 'Finalizar set';
    var indicadorSet = f.md > 1 ? '<div class="small texto-2 text-center">Set ' + (g.sets.length + 1) + ' de ' + f.md + ' · sets: ' + wins.a + '–' + wins.b +
      (g.sets.length ? ' (' + g.sets.map(function (s) { return s.a + '–' + s.b; }).join(', ') + ')' : '') + '</div>' : '';
    if (rapido.jogo !== g.id) rapido = { jogo: g.id, aberto: false, venc: null, a: '', b: '' };

    var dupla = function (lado, nome, pts, outro) {
      var lider = pts > outro;
      return '<div class="d-flex align-items-center justify-content-between gap-2"><div class="d-flex flex-column" style="min-width:0"><span class="fw-semibold">' + esc(nome) + '</span>' +
        '<span class="small texto-2">' + derrotasTexto(lado === 'a' ? g.duplaA : g.duplaB) + '</span></div>' +
        '<div class="d-flex align-items-center gap-2 flex-none"><button class="btn-passo" data-acao="ponto" data-lado="' + lado + '" data-delta="-1" aria-label="Tirar ponto de ' + esc(nome) + '"' + (pts === 0 ? ' disabled' : '') + '>−</button>' +
        '<span class="pt-grande" style="color:' + (lider ? 'var(--destaque)' : 'var(--texto)') + '">' + pts + '</span>' +
        '<button class="btn-passo" data-acao="ponto" data-lado="' + lado + '" data-delta="1" aria-label="Somar ponto para ' + esc(nome) + '">+</button></div></div>';
    };

    var painelNormal = '<div class="d-flex flex-column gap-3">' + dupla('a', nomeA, pa, pb) + '<div style="height:1px;background:var(--linha)"></div>' + dupla('b', nomeB, pb, pa) + indicadorSet +
      '<button class="btn ' + (fechou ? 'btn-destaque' : 'btn-destaque') + '" data-acao="finalizar"' + (fechou ? '' : ' disabled') + '>' + rotuloFim + '</button>' +
      '<p class="small texto-2 text-center mb-0">' + (fechou ? 'Confira o placar e finalize.' : 'Use + e − ponto a ponto (o set fecha em ' + alvo + '), ou só o placar final.') + '</p>' +
      '<button class="btn btn-fantasma" style="border-style:dashed" data-acao="abrir-rapido">Lançar só o resultado final</button></div>';

    var rotPlacar = f.md > 1 ? 'sets ganhos' : 'pontos';
    var painelRapido = '<div class="d-flex flex-column gap-3"><span class="fw-semibold">Quem venceu?</span>' +
      '<div class="row g-2"><div class="col-6"><button class="opcao-venc w-100' + (rapido.venc === 'a' ? ' on' : '') + '" data-acao="escolher-venc" data-lado="a" aria-pressed="' + (rapido.venc === 'a') + '">' + esc(nomeA) + '</button></div>' +
      '<div class="col-6"><button class="opcao-venc w-100' + (rapido.venc === 'b' ? ' on' : '') + '" data-acao="escolher-venc" data-lado="b" aria-pressed="' + (rapido.venc === 'b') + '">' + esc(nomeB) + '</button></div></div>' +
      '<span class="small texto-2">Placar final (opcional) · ' + rotPlacar + '</span>' +
      '<div class="row g-2"><label class="col-6 d-flex flex-column gap-1 small texto-2">' + esc(nomeA) + '<input class="form-control text-center titulo fs-4" type="number" inputmode="numeric" min="0" data-campo="rapido-a" placeholder="' + (f.md > 1 ? need : alvo) + '" value="' + esc(rapido.a) + '"></label>' +
      '<label class="col-6 d-flex flex-column gap-1 small texto-2">' + esc(nomeB) + '<input class="form-control text-center titulo fs-4" type="number" inputmode="numeric" min="0" data-campo="rapido-b" placeholder="' + (f.md > 1 ? need - 1 : 0) + '" value="' + esc(rapido.b) + '"></label></div>' +
      '<button class="btn btn-destaque" data-acao="confirmar-venc"' + (rapido.venc ? '' : ' disabled') + '>' + (rapido.venc ? 'Confirmar vitória de ' + esc(rapido.venc === 'a' ? nomeA : nomeB) : 'Escolha quem venceu') + '</button>' +
      '<button class="btn btn-link texto-2" data-acao="fechar-rapido">Voltar ao + e −</button></div>';

    // fila: os próximos prontos, com setas
    var fila = ctx.prontos.slice(1);
    var comecou = g.status === 'emQuadra';
    var filaHtml = fila.map(function (x, i) {
      return '<div class="item-lista" style="padding:8px 8px 8px 14px"><div class="flex-grow-1 d-flex flex-column" style="min-width:0"><span style="font-size:14px;font-weight:500">' +
        esc(Chave.nomeDupla(estado, x.duplaA)) + ' × ' + esc(Chave.nomeDupla(estado, x.duplaB)) + '</span><span class="small texto-2">' + x.id + ' · ' + esc(UI.descricaoJogo(estado, x)) + '</span></div>' +
        '<button class="btn-mini" data-acao="mover" data-jogo-id="' + x.id + '" data-dir="-1" aria-label="Subir na fila"' + (i === 0 && comecou ? ' disabled' : '') + '>' + UI.icone.cima() + '</button>' +
        '<button class="btn-mini" data-acao="mover" data-jogo-id="' + x.id + '" data-dir="1" aria-label="Descer na fila"' + (i === fila.length - 1 ? ' disabled' : '') + '>' + UI.icone.baixo() + '</button></div>';
    }).join('');
    var aguardando = ctx.fila.filter(function (x) { return x.status === 'aguardando'; }).length;

    var pr = Chave.progresso(estado);
    var normal = '<div class="placar-em-pe"><div class="d-flex flex-column gap-3">' +
      cabecalho('Lançar placar') + abasAdmin() +
      '<div class="small texto-2 d-flex justify-content-between"><span>Jogo ' + Math.min(pr.feitos + 1, pr.total) + ' de ' + pr.total + '</span><span>' + estado.duplas.length + ' duplas</span></div>' +
      '<section class="cartao" style="border-radius:16px;padding:18px"><div class="d-flex justify-content-between small texto-2 mb-3"><span>' + g.id + ' · ' + esc(UI.tituloFase(estado, g)) + '</span><span>MD' + f.md + ' · até <strong style="color:var(--texto)">' + alvo + '</strong></span></div>' +
      (rapido.aberto ? painelRapido : painelNormal) + '</section>' +
      '<div class="row g-2"><div class="col-6"><button class="btn btn-fantasma w-100" data-acao="wo">Marcar WO</button></div>' +
      '<div class="col-6"><button class="btn btn-fantasma w-100" data-acao="desfazer"' + (estado.historico.length ? '' : ' disabled') + '>Desfazer último</button></div></div>' +
      '<section class="d-flex flex-column gap-2"><h2 class="rotulo m-0">Fila da quadra</h2>' + (filaHtml || '<div class="small texto-2">Nenhum outro jogo pronto agora.</div>') +
      (aguardando ? '<div class="small texto-2">+ ' + aguardando + ' jogo' + (aguardando > 1 ? 's' : '') + ' esperando as duplas.</div>' : '') + '</section>' +
      '<div class="d-flex gap-2"><a class="btn btn-sec flex-fill" href="index.html#/chave" target="_blank" rel="noopener">Ver chave</a></div></div></div>';

    // celular deitado: só nomes e números gigantes (CSS esconde o resto)
    var lado = function (l, nome, pts, lider) {
      return '<button class="pd-metade" data-acao="ponto" data-lado="' + l + '" data-delta="1" aria-label="Ponto para ' + esc(nome) + '"><span class="nome">' + esc(nome) + '</span>' +
        '<span class="num" style="color:' + (lider ? 'var(--destaque)' : 'var(--texto)') + '">' + pts + '</span></button>';
    };
    var deitado = '<div class="placar-deitado ativo" aria-label="Placar em tela cheia">' +
      '<div class="pd-topo"><span>' + g.id + ' · ' + esc(UI.tituloFase(estado, g)) + '</span><span class="destaque fw-semibold">MD' + f.md + ' · até ' + alvo + (f.md > 1 ? ' · set ' + (g.sets.length + 1) + ' (' + wins.a + '–' + wins.b + ')' : '') + '</span><span>Toque no lado de quem pontuou</span></div>' +
      '<div class="pd-meio">' + lado('a', nomeA, pa, pa > pb) + '<div class="pd-divisor"></div>' + lado('b', nomeB, pb, pb > pa) + '</div>' +
      '<div class="pd-base"><button class="menos" data-acao="ponto" data-lado="a" data-delta="-1" aria-label="Tirar ponto de ' + esc(nomeA) + '"' + (pa === 0 ? ' disabled' : '') + '>−1</button>' +
      '<button class="fim" data-acao="finalizar"' + (fechou ? '' : ' disabled') + ' style="background:' + (fechou ? 'var(--destaque)' : 'var(--card-2)') + ';color:' + (fechou ? '#0B0D10' : 'var(--texto-2)') + '">' +
      (fechou ? rotuloFim : rotuloFim + ' (libera quando alguém fechar ' + alvo + ')') + '</button>' +
      '<button class="menos" data-acao="ponto" data-lado="b" data-delta="-1" aria-label="Tirar ponto de ' + esc(nomeB) + '"' + (pb === 0 ? ' disabled' : '') + '>−1</button></div></div>';
    return normal + deitado;
  }

  function derrotasTexto(id) {
    var d = Chave.derrotas(estado, id);
    return d === 0 ? 'invicta' : d + (d === 1 ? ' derrota' : ' derrotas');
  }

  // ---------- 5. encerrado ----------

  function telaEncerrado() {
    var c = Chave.campeao(estado), cl = Chave.classificacao(estado);
    return cabecalho('Torneio encerrado') + abasAdmin() +
      '<div class="d-flex flex-column gap-3"><section class="cartao text-center p-4" style="border-color:var(--destaque)"><div class="destaque mb-1">' + UI.icone.trofeu(32) + '</div>' +
      '<div class="rotulo destaque">Campeões</div><div class="titulo fs-3">' + esc(Chave.nomeDupla(estado, c)) + '</div></section>' +
      '<section class="cartao overflow-hidden">' + cl.linhas.map(function (l) {
        return '<div class="linha-pos"><span class="pos">' + l.pos + '</span><span class="flex-grow-1">' + l.duplas.map(function (d) { return esc(Chave.nomeDupla(estado, d)); }).join(' · ') + '</span><span class="small texto-2">' + esc(l.motivo) + '</span></div>';
      }).join('') + '</section>' +
      '<button class="btn btn-fantasma" data-acao="desfazer">Desfazer último resultado</button>' +
      '<a class="btn btn-sec" href="index.html#/podio" target="_blank" rel="noopener">Ver pódio no site</a>' +
      '<button class="btn btn-destaque" data-acao="novo-torneio">Novo torneio</button></div>';
  }

  // ---------- manutenção ----------

  function telaManutencao() {
    var nome = estado.config.nome;
    return cabecalho('Manutenção') + abasAdmin() +
      '<div class="d-flex flex-column gap-3">' +
      '<section class="cartao p-3 d-flex flex-column gap-2"><div class="fw-semibold">Novo torneio</div><p class="small texto-2 mb-1">Começa outro torneio do zero (jogadores, sorteio e chave). Dá para baixar um backup do atual antes.</p>' +
      '<button class="btn btn-destaque" data-acao="novo-torneio">Novo torneio</button></section>' +
      '<section class="cartao p-3 d-flex flex-column gap-2"><div class="fw-semibold">Backup</div><p class="small texto-2 mb-1">Baixe o torneio inteiro num arquivo. Serve para guardar ou levar para outro lugar.</p>' +
      '<button class="btn btn-sec" data-acao="exportar">Exportar JSON</button>' +
      '<label class="btn btn-fantasma d-flex align-items-center justify-content-center m-0" for="arquivo-import">Importar JSON</label>' +
      '<input id="arquivo-import" type="file" accept="application/json,.json" class="visually-hidden" data-campo="importar"></section>' +
      '<section class="cartao p-3 d-flex flex-column gap-2" style="border-color:#5A2A26"><div class="fw-semibold perdedores">Zerar torneio</div>' +
      '<p class="small texto-2 mb-1">Apaga sorteio, chave e resultados. Não dá para desfazer. Para confirmar, digite o nome do torneio: <strong class="text-white">' + esc(nome) + '</strong></p>' +
      '<input class="form-control" data-campo="zerar" placeholder="Nome do torneio" autocomplete="off">' +
      '<button class="btn btn-perigo" data-acao="zerar" id="btn-zerar" disabled>Zerar torneio</button></section>' +
      '<section class="cartao p-3 d-flex flex-column gap-2"><div class="fw-semibold">Cache deste aparelho</div>' +
      '<p class="small texto-2 mb-1">Apaga o que este navegador guardou e recarrega a página. Resolve tela velha ou dados que não atualizam. ' +
      (Estado.modo === 'local' ? '<strong class="text-white">No modo local isso apaga o torneio, porque ele só existe neste navegador.</strong>' : 'O torneio salvo no servidor não é apagado.') + '</p>' +
      '<button class="btn btn-sec" data-acao="limpar-cache">Limpar cache</button></section>' +
      '<section class="cartao p-3 d-flex flex-column gap-2"><div class="fw-semibold">Sessão</div>' +
      '<div class="small texto-2">Modo: ' + (Estado.modo === 'api' ? 'servidor (Vercel)' : 'local (só neste navegador)') + (estado.atualizadoEm ? ' · última alteração ' + new Date(estado.atualizadoEm).toLocaleString('pt-BR') : '') + '</div>' +
      '<button class="btn btn-fantasma" data-acao="sair">Sair do modo admin</button></section></div>';
  }

  // ---------- desenho ----------

  function render() {
    if (!logado) { app.innerHTML = telaLogin(); return; }
    if (!estado) { app.innerHTML = '<div class="texto-2 py-5 text-center">Carregando…</div>'; return; }
    var html = '';
    if (Estado.modo === 'local') html += '<div class="aviso-local mt-2">Modo local: sem servidor e sem senha, os dados ficam só neste navegador.</div>';
    if (tela === 'manutencao') html += telaManutencao();
    else if (estado.fase === 'config') html += telaConfig();
    else if (estado.fase === 'sorteio') html += telaSorteio();
    else if (estado.fase === 'sorteado') html += telaSorteado();
    else if (estado.fase === 'configJogos') html += telaConfigJogos();
    else if (estado.fase === 'andamento') html += telaPlacar();
    else html += telaEncerrado();
    app.innerHTML = html;
    if (animarCarta >= 0) {
      var carta = app.querySelector('[data-carta="' + animarCarta + '"]');
      animarCarta = -1;
      // dois frames: o primeiro pinta a carta de costas, o segundo dispara a virada
      if (carta) requestAnimationFrame(function () { requestAnimationFrame(function () { carta.classList.add('virada'); }); });
    }
  }

  // ---------- eventos ----------

  function setNoPonto(g, lado, delta) {
    var pa = g.parcial ? g.parcial.a : 0, pb = g.parcial ? g.parcial.b : 0;
    if (lado === 'a') pa = Math.max(0, Math.min(99, pa + delta)); else pb = Math.max(0, Math.min(99, pb + delta));
    return [pa, pb];
  }

  // Baixa um objeto como arquivo .json (o nome ganha a data de hoje).
  function baixarJson(objeto, nomeBase) {
    var blob = new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeBase + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  var acoes = {
    'tentar-salvar': function () { agendarSalvar(0); },
    'limpar-cache': function () {
      var local = Estado.modo === 'local';
      confirmar('Limpar o cache?', local ? 'Está no modo local: o torneio guardado neste navegador será apagado.' : 'Apaga os dados guardados neste navegador e recarrega a página. O torneio no servidor continua salvo.', 'Limpar cache', local)
        .then(function (ok) { if (ok) Estado.limparCache(); });
    },
    sair: function () { Estado.sair().then(function () { logado = false; estado = null; render(); }); },
    tela: function (el) { tela = el.dataset.tela; render(); window.scrollTo(0, 0); },
    'ir-sorteio': irParaSorteio,
    'voltar-config': function () { mutar(function (x) { x.fase = 'config'; x.duplas = []; x.sorteio = { revelados: 0 }; }); },
    revelar: function () {
      if (estado.sorteio.revelados >= estado.duplas.length) return;
      animarCarta = estado.sorteio.revelados;
      mutar(function (x) { x.sorteio.revelados += 1; });
    },
    'revelar-todas': function () { mutar(function (x) { x.sorteio.revelados = x.duplas.length; }); },
    'sortear-de-novo': function () {
      confirmar('Sortear de novo?', 'O resultado atual do sorteio será descartado.', 'Sortear de novo', true).then(function (ok) {
        if (!ok) return;
        mutar(function (x) {
          var prontas = x.config.modo === 'prontas';
          x.duplas = Sorteio.sortear({ jogadores: x.jogadores, pares: prontas ? x.duplas.map(function (d) { return d.jogadores; }) : [], usarPotes: x.config.usarPotes && !prontas });
          x.sorteio = { revelados: 0, ordem: Sorteio.ordemDeRevelacao(x.duplas, x.jogadores) };
          x.fase = 'sorteio'; // também vale quando o sorteio já estava salvo
        });
      });
    },
    // Guarda as duplas sem criar a chave: o site já mostra o sorteio e a chave fica para depois.
    'salvar-sorteio': function () {
      confirmar('Salvar o sorteio?', 'As duplas ficam salvas e aparecem no site. A chave, quem passa direto e os jogos só são sorteados quando você montar a chave.', 'Salvar sorteio').then(function (ok) {
        if (ok) mutar(function (x) { x.fase = 'sorteado'; });
      });
    },
    'baixar-sorteio': function () {
      baixarJson(Sorteio.exportarSorteio(estado), 'sorteio-torneio-box-castelandia');
      UI.toast('Sorteio baixado.');
    },
    'confirmar-sorteio': function () {
      var impar = estado.duplas.length % 2 === 1;
      confirmar('Montar a chave?', 'Sorteia a posição de cada dupla na chave' + (impar ? ' e quem passa direto (número ímpar de duplas)' : '') + '. Depois que a chave é montada, a ordem fica travada. Em seguida você configura os jogos.', 'Sortear e montar a chave').then(function (ok) {
        if (!ok) return;
        mutar(function (x) {
          x.duplas = Sorteio.sortearChave(x.duplas);
          x.sorteio.ordem = x.duplas.map(function (d, i) { return i; });
          x.config.formatos = {};
          Chave.gerarJogos(x);
          x.fase = 'configJogos';
        });
        var passam = estado.jogos.filter(function (g) { return g.fase === 'V-R1' && g.bye; }).map(function (g) {
          return Chave.nomeDupla(estado, g.duplaA === Chave.BYE ? g.duplaB : g.duplaA);
        });
        if (passam.length) UI.toast('Passa direto: ' + passam.join(', ') + '.');
      });
    },
    atalho: function (el) { mutar(function (x) { x.config.formatos = Chave.formatosDoAtalho(x.duplas.length, el.dataset.atalho); }); },
    formato: function (el) {
      mutar(function (x) { x.config.formatos[el.dataset.fase][el.dataset.campo] = Number(el.dataset.valor); });
    },
    decisivo: function (el) { mutar(function (x) { x.config.setDecisivo = el.dataset.valor === '' ? null : Number(el.dataset.valor); }); },
    iniciar: function () {
      confirmar('Iniciar o torneio?', 'Depois de iniciar, o formato dos jogos trava e não dá mais para mudar o sorteio.', 'Iniciar torneio').then(function (ok) {
        if (ok) mutar(function (x) { Chave.iniciarTorneio(x); });
      });
    },
    ponto: function (el) {
      var g = UI.contexto(estado).emQuadra;
      if (!g) return;
      var p = setNoPonto(g, el.dataset.lado, Number(el.dataset.delta));
      mutar(function (x) { Chave.registrarParcial(x, g.id, p[0], p[1]); }, { atraso: 500 });
    },
    finalizar: function () {
      var g = UI.contexto(estado).emQuadra;
      if (!g || !g.parcial) return;
      var id = g.id, a = g.parcial.a, b = g.parcial.b;
      if (mutar(function (x) { Chave.registrarSet(x, id, a, b); })) avisarResultado(id);
    },
    'abrir-rapido': function () { rapido.aberto = true; render(); },
    'fechar-rapido': function () { rapido.aberto = false; render(); },
    'escolher-venc': function (el) { rapido.venc = el.dataset.lado; render(); },
    'confirmar-venc': function () {
      var g = UI.contexto(estado).emQuadra;
      if (!g || !rapido.venc) return;
      var id = g.id, venc = rapido.venc === 'a' ? g.duplaA : g.duplaB, placar = { a: rapido.a, b: rapido.b };
      var anterior = rapido;
      rapido = { jogo: null, aberto: false, venc: null, a: '', b: '' }; // antes do render, que reinicia o painel para o próximo jogo
      if (mutar(function (x) { Chave.registrarVencedor(x, id, venc, placar); })) avisarResultado(id);
      else rapido = anterior;
    },
    wo: function () {
      var g = UI.contexto(estado).emQuadra;
      if (!g) return;
      escolher('Marcar WO', 'Qual dupla não compareceu? A outra avança.', [
        { valor: g.duplaA, rotulo: Chave.nomeDupla(estado, g.duplaA) }, { valor: g.duplaB, rotulo: Chave.nomeDupla(estado, g.duplaB) }
      ]).then(function (faltou) {
        if (faltou) { mutar(function (x) { Chave.registrarWO(x, g.id, faltou); }); avisarResultado(g.id); }
      });
    },
    desfazer: function () {
      var ultima = estado.historico[estado.historico.length - 1];
      if (!ultima) { UI.toast('Nada para desfazer.', 'erro'); return; }
      confirmar('Desfazer o último resultado?', 'Vai remover ' + esc(descreverAcao(ultima)) + ' e refazer a chave sem ele.', 'Desfazer', true).then(function (ok) {
        if (ok) mutar(function (x) { Chave.desfazer(x); });
      });
    },
    mover: function (el) { mutar(function (x) { Chave.moverNaFila(x, el.dataset.jogoId, Number(el.dataset.dir)); }); },
    exportar: function () { baixarJson(estado, 'torneio-box-castelandia'); },
    zerar: function () {
      var nome = estado.config.nome;
      confirmar('Zerar o torneio?', 'Tudo será apagado: ' + esc(nome) + ', sorteio, chave e resultados.', 'Zerar tudo', true).then(function (ok) {
        if (!ok) return;
        recomecar();
      });
    },
    // Começa outro torneio do zero. Oferece guardar um backup do atual antes, já que o novo substitui o salvo.
    'novo-torneio': function () {
      var andou = estado.fase !== 'config' || estado.duplas.length > 0;
      var texto = andou
        ? 'O torneio "' + estado.config.nome + '" (' + (estado.fase === 'encerrado' ? 'encerrado' : estado.fase === 'andamento' ? 'em andamento' : 'só sorteado') + ') será substituído por um torneio vazio.'
        : 'Os jogadores digitados serão apagados e o torneio volta ao início.';
      escolher('Começar um novo torneio?', texto + (andou ? ' Quer baixar um backup dele antes?' : ''), andou
        ? [{ valor: 'backup', rotulo: 'Baixar backup e começar novo' }, { valor: 'sem', rotulo: 'Começar novo sem backup' }]
        : [{ valor: 'sem', rotulo: 'Começar novo' }]
      ).then(function (v) {
        if (v !== 'backup' && v !== 'sem') return;
        if (v === 'backup') baixarJson(estado, 'torneio-box-castelandia');
        recomecar();
        UI.toast('Novo torneio criado. Cadastre os jogadores.');
      });
    }
  };

  // Troca o estado por um torneio vazio (mantendo a versão para o salvamento não dar conflito).
  function recomecar() {
    mutar(function (x) { var novo = Chave.estadoInicial(); novo.versao = x.versao; Object.keys(x).forEach(function (k) { delete x[k]; }); Object.assign(x, novo); });
    tela = 'torneio';
    erros = [];
    rapido = { jogo: null, aberto: false, venc: null, a: '', b: '' };
    render();
  }

  // Mostra quem venceu e qual o próximo jogo, depois de lançar um resultado.
  function avisarResultado(id) {
    var g = Chave.jogoPorId(estado, id);
    if (g.status === 'finalizado' || g.status === 'wo') {
      var prox = UI.contexto(estado).emQuadra;
      UI.toast(Chave.nomeDupla(estado, g.vencedor) + ' venceu' + (g.status === 'wo' ? ' por WO' : '') + '.' + (prox ? ' Próximo: ' + Chave.nomeDupla(estado, prox.duplaA) + ' × ' + Chave.nomeDupla(estado, prox.duplaB) + '.' : ''));
    }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-acao]');
    if (!el || !acoes[el.dataset.acao] || el.disabled) return;
    ev.preventDefault();
    acoes[el.dataset.acao](el);
  });

  document.addEventListener('submit', function (ev) {
    if (ev.target.dataset.form !== 'login') return;
    ev.preventDefault();
    var senha = document.getElementById('senha').value;
    Estado.entrar(senha).then(function () { return iniciarSessao(); }).catch(function (e) { UI.toast(e.message, 'erro'); });
  });

  // Campos de texto: atualizam o estado sem redesenhar (para não perder o foco) e salvam ao sair do campo.
  document.addEventListener('input', function (ev) {
    var el = ev.target, campo = el.dataset && el.dataset.campo;
    if (!campo || !estado) return;
    if (['pote1', 'pote2', 'lista', 'duplas'].indexOf(campo) !== -1) {
      estado.entrada[campo] = el.value;
      atualizarResumo(campo);
    } else if (campo === 'rapido-a') rapido.a = el.value;
    else if (campo === 'rapido-b') rapido.b = el.value;
    else if (campo === 'zerar') {
      var b = document.getElementById('btn-zerar');
      if (b) b.disabled = el.value.trim() !== estado.config.nome;
    }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target, campo = el.dataset && el.dataset.campo;
    if (!campo || !estado) return;
    if (['pote1', 'pote2', 'lista', 'duplas'].indexOf(campo) !== -1) { estado.entrada[campo] = el.value; agendarSalvar(300); return; }
    if (campo === 'nome') { mutar(function (x) { x.config.nome = el.value.trim() || 'Torneio Box Castelândia'; }, { semRender: true }); return; }
    if (campo === 'modo') { mutar(function (x) { x.config.modo = el.value; }); return; }
    if (campo === 'usarPotes' || campo === 'finalComReset') { mutar(function (x) { x.config[campo] = el.checked; }); return; }
    if (campo === 'importar') importar(el);
    if (campo === 'importar-sorteio') importarSorteio(el);
  });

  // Texto que volta para as caixas de "Jogadores" quando um sorteio é importado (para dar para editar depois).
  function entradaDoSorteio(s) {
    var nomeDe = {};
    s.jogadores.forEach(function (j) { nomeDe[j.id] = j.nome; });
    var entrada = { pote1: '', pote2: '', lista: '', duplas: '' };
    var doPote = function (p) { return s.jogadores.filter(function (j) { return j.pote === p; }).map(function (j) { return j.nome; }).join('\n'); };
    if (s.config.modo === 'prontas') entrada.duplas = s.duplas.map(function (d) { return nomeDe[d.jogadores[0]] + ' / ' + nomeDe[d.jogadores[1]]; }).join('\n');
    else if (s.config.usarPotes) { entrada.pote1 = doPote(1); entrada.pote2 = doPote(2); }
    else entrada.lista = s.jogadores.map(function (j) { return j.nome; }).join('\n');
    return entrada;
  }

  // Importa um arquivo de sorteio: confere tudo antes de mexer em qualquer coisa.
  function importarSorteio(el) {
    var arq = el.files && el.files[0];
    el.value = '';
    if (!arq) return;
    if (estado.fase === 'andamento' || estado.fase === 'encerrado') {
      UI.toast('O torneio já começou. Para trocar o sorteio, zere o torneio em Manutenção.', 'erro');
      return;
    }
    var leitor = new FileReader();
    leitor.onload = function () {
      var obj;
      try { obj = JSON.parse(leitor.result); } catch (e) { UI.toast('Esse arquivo não é um JSON válido.', 'erro'); return; }
      var r = Sorteio.lerSorteio(obj);
      if (r.erros.length) { UI.toast(r.erros[0], 'erro'); return; }
      var s = r.sorteio;
      var aplicar = function () {
        mutar(function (x) {
          x.config.modo = s.config.modo; x.config.usarPotes = s.config.usarPotes; x.config.finalComReset = s.config.finalComReset;
          if (s.nome) x.config.nome = s.nome;
          x.config.numDuplas = s.duplas.length; x.config.formatos = {};
          x.jogadores = s.jogadores; x.duplas = s.duplas; x.entrada = entradaDoSorteio(s);
          x.sorteio = { revelados: s.duplas.length, ordem: s.ordem };
          x.jogos = []; x.historico = []; x.filaManual = false; x.ultimoJogo = null;
          x.fase = 'sorteio';
        });
        tela = 'torneio';
        erros = [];
        render();
        UI.toast('Sorteio importado: ' + s.duplas.length + ' duplas.');
      };
      if (estado.duplas.length) {
        confirmar('Importar este sorteio?', 'O sorteio atual será substituído por um com ' + s.duplas.length + ' duplas' + (s.nome ? ' ("' + esc(s.nome) + '")' : '') + '.', 'Importar', true)
          .then(function (sim) { if (sim) aplicar(); });
      } else aplicar();
    };
    leitor.readAsText(arq);
  }

  function importar(el) {
    var arq = el.files && el.files[0];
    if (!arq) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var novo;
      try { novo = JSON.parse(leitor.result); } catch (e) { UI.toast('Esse arquivo não é um JSON válido.', 'erro'); return; }
      var ok = novo && typeof novo === 'object' && typeof novo.fase === 'string' && novo.config && Array.isArray(novo.jogos) && Array.isArray(novo.duplas) && Array.isArray(novo.historico);
      if (!ok) { UI.toast('Esse arquivo não parece um backup do torneio.', 'erro'); return; }
      confirmar('Importar este torneio?', 'Substitui tudo o que está salvo agora por "' + esc(novo.config.nome || 'torneio') + '" (fase: ' + esc(novo.fase) + ').', 'Importar', true).then(function (sim) {
        if (!sim) return;
        mutar(function (x) {
          var versao = x.versao;
          Object.keys(x).forEach(function (k) { delete x[k]; });
          Object.assign(x, Object.assign(Chave.estadoInicial(), novo), { versao: versao });
        });
        tela = 'torneio';
        render();
        UI.toast('Torneio importado.');
      });
    };
    leitor.readAsText(arq);
    el.value = '';
  }

  // ---------- início ----------

  function iniciarSessao() {
    return Estado.carregar().then(function (e) {
      estado = e; logado = true; render();
    });
  }

  Estado.iniciar().then(function () { return Estado.sessaoAdmin(); }).then(function (admin) {
    if (!admin) { logado = false; render(); return; }
    return iniciarSessao();
  }).catch(function (e) {
    app.innerHTML = '<div class="cartao p-4 text-center my-5"><div class="titulo fs-5 mb-1">Não deu para carregar</div><div class="texto-2">' + esc(e.message) + '</div><button class="btn btn-sec mt-3" onclick="location.reload()">Tentar de novo</button> <button class="btn btn-fantasma mt-3" onclick="Estado.limparCache()">Limpar cache</button></div>';
  });

  // Só para depuração/testes no navegador
  window.__admin = { estado: function () { return estado; }, salvamento: salvamento };
})();
