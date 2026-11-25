/*
 * Sorteio das duplas (sem DOM). Funciona no navegador (window.Sorteio) e no Node (require).
 * A ordem em que as duplas saem do sorteio é a ordem dos cabeças de chave (seed 1, 2, 3...).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sorteio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Gerador com semente (para testes repetíveis).
  function rngComSemente(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Aleatório de verdade (crypto do navegador/Node); cai no Math.random se não existir.
  function rngAleatorio() {
    var c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (c && c.getRandomValues) {
      return function () {
        var buf = new Uint32Array(1);
        c.getRandomValues(buf);
        return buf[0] / 4294967296;
      };
    }
    return Math.random;
  }

  // Fisher-Yates; devolve uma cópia embaralhada.
  function embaralhar(lista, rng) {
    var a = lista.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rng() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Texto colado -> nomes. Tira numeração e marcadores ("1.", "2)", "-", "•") e linhas vazias.
  function nomes(texto) {
    return String(texto || '').split(/\r?\n/).map(function (l) {
      return l.replace(/^\s*(?:\d+\s*[.)\-:]|[-•*])\s*/, '').trim();
    }).filter(Boolean);
  }

  // "Arthur / Matheus", "Arthur e Matheus", "Arthur + Matheus", "Arthur & Matheus"
  function parseParDeNomes(linha) {
    var partes = linha.split(/\s*[\/+&]\s*|\s+e\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return partes.length === 2 ? partes : null;
  }

  function nomeDaDupla(a, b) { return a + ' / ' + b; }

  /*
   * entrada: { n, modo: 'avulsos' | 'prontas', usarPotes, pote1, pote2, lista, duplas }  (textos colados)
   * Devolve { erros: [..], jogadores: [{id, nome, pote}], pares: [[idA, idB], ...] }.
   * Em 'avulsos' os pares ficam vazios (saem do sorteio); em 'prontas' já vêm formados.
   */
  function validar(entrada) {
    var erros = [], jogadores = [], pares = [];
    var n = entrada.n;
    if (!Number.isInteger(n) || n < 4 || n > 16) {
      return { erros: ['O número de duplas precisa estar entre 4 e 16.'], jogadores: [], pares: [] };
    }
    var vistos = {};
    function add(nome, pote) {
      var chave = nome.toLowerCase();
      if (vistos[chave]) { erros.push('Nome repetido: ' + nome + '. Use sobrenome ou apelido para diferenciar.'); return null; }
      vistos[chave] = true;
      var j = { id: 'j' + (jogadores.length + 1), nome: nome, pote: pote };
      jogadores.push(j);
      return j.id;
    }

    if (entrada.modo === 'prontas') {
      var linhas = nomes(entrada.duplas);
      if (linhas.length !== n) erros.push('Você pediu ' + n + ' duplas, mas a lista tem ' + linhas.length + '.');
      linhas.forEach(function (l, i) {
        var par = parseParDeNomes(l);
        if (!par) { erros.push('Linha ' + (i + 1) + ': escreva os dois jogadores separados por "/" (ex.: Arthur / Matheus).'); return; }
        var a = add(par[0], null), b = add(par[1], null);
        if (a && b) pares.push([a, b]);
      });
    } else if (entrada.usarPotes) {
      var p1 = nomes(entrada.pote1), p2 = nomes(entrada.pote2);
      if (p1.length !== n) erros.push('O pote 1 precisa de ' + n + ' jogadores (tem ' + p1.length + ').');
      if (p2.length !== n) erros.push('O pote 2 precisa de ' + n + ' jogadores (tem ' + p2.length + ').');
      p1.forEach(function (nome) { add(nome, 1); });
      p2.forEach(function (nome) { add(nome, 2); });
    } else {
      var todos = nomes(entrada.lista);
      if (todos.length !== 2 * n) erros.push('Para ' + n + ' duplas são ' + 2 * n + ' jogadores (a lista tem ' + todos.length + ').');
      todos.forEach(function (nome) { add(nome, null); });
    }
    return { erros: erros, jogadores: jogadores, pares: pares };
  }

  /*
   * Sorteia as duplas e a ordem delas na chave. Devolve [{ id, nome, jogadores: [idA, idB], seed }].
   * Com potes, cada dupla leva um jogador de cada pote. Com duplas prontas, só sorteia as posições.
   */
  function sortear(dados, rng) {
    rng = rng || rngAleatorio();
    var porId = {};
    dados.jogadores.forEach(function (j) { porId[j.id] = j; });
    var pares;
    if (dados.pares && dados.pares.length) {
      pares = dados.pares.map(function (p) { return p.slice(); });
    } else if (dados.usarPotes) {
      var a = embaralhar(dados.jogadores.filter(function (j) { return j.pote === 1; }), rng);
      var b = embaralhar(dados.jogadores.filter(function (j) { return j.pote === 2; }), rng);
      if (a.length !== b.length) throw new Error('Os dois potes precisam ter o mesmo tamanho.');
      pares = a.map(function (j, i) { return [j.id, b[i].id]; });
    } else {
      var todos = embaralhar(dados.jogadores, rng);
      if (todos.length % 2) throw new Error('Número ímpar de jogadores.');
      pares = [];
      for (var i = 0; i < todos.length; i += 2) pares.push([todos[i].id, todos[i + 1].id]);
    }
    return embaralhar(pares, rng).map(function (p, idx) {
      return {
        id: 'd' + (idx + 1),
        nome: nomeDaDupla(porId[p[0]].nome, porId[p[1]].nome),
        jogadores: p,
        seed: idx + 1
      };
    });
  }

  return {
    rngComSemente: rngComSemente, rngAleatorio: rngAleatorio, embaralhar: embaralhar,
    nomes: nomes, parseParDeNomes: parseParDeNomes, validar: validar, sortear: sortear
  };
});
