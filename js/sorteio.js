/*
 * Sorteio das duplas (sem DOM). Funciona no navegador (window.Sorteio) e no Node (require).
 * Dois sorteios separados: o das duplas (sortear) e o da chave (sortearChave), que define os cabeças de chave
 * e, com número ímpar de duplas, quem passa direto. A ordem em que as cartas são reveladas na tela é outra
 * (ordemDeRevelacao), para dar para manter a dupla favorita longe da 1ª carta.
 *
 * Regras da brincadeira (ver FAVORITOS):
 *   - com potes, se Arthur e Otávio caem em potes diferentes, eles formam dupla com CHANCE_DUPLA_FAVORITA;
 *   - dupla com um dos dois nunca é a primeira a ser revelada.
 * Com número ímpar de duplas, quem passa direto (bye) só é sorteado na hora de montar a chave.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sorteio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_DUPLAS = 4, MAX_DUPLAS = 32;      // os mesmos limites da chave (js/chave.js)
  var FAVORITOS = ['arthur', 'otavio'];     // primeiro nome, sem acento e em minúsculas
  var CHANCE_DUPLA_FAVORITA = 0.3;          // com potes diferentes, chance extra de formarem dupla (somada ao acaso)

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

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // 'arthur' | 'otavio' se o primeiro nome for de um favorito; senão null.
  function favorito(nome) {
    var primeiro = normalizar(nome).split(/\s+/)[0];
    return FAVORITOS.indexOf(primeiro) !== -1 ? primeiro : null;
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
   * entrada: { modo: 'avulsos' | 'prontas', usarPotes, pote1, pote2, lista, duplas }  (textos colados)
   * O número de duplas sai da própria lista: com potes, os dois precisam ter a mesma quantidade;
   * sem potes, a lista precisa ter quantidade par; com duplas prontas, é uma por linha.
   * Devolve { erros: [..], n, jogadores: [{id, nome, pote}], pares: [[idA, idB], ...] }.
   * Em 'avulsos' os pares ficam vazios (saem do sorteio); em 'prontas' já vêm formados.
   */
  function validar(entrada) {
    var erros = [], jogadores = [], pares = [], n = 0, contagemOk = true;
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
      n = linhas.length;
      linhas.forEach(function (l, i) {
        var par = parseParDeNomes(l);
        if (!par) { erros.push('Linha ' + (i + 1) + ': escreva os dois jogadores separados por "/" (ex.: Arthur / Matheus).'); return; }
        var a = add(par[0], null), b = add(par[1], null);
        if (a && b) pares.push([a, b]);
      });
    } else if (entrada.usarPotes) {
      var p1 = nomes(entrada.pote1), p2 = nomes(entrada.pote2);
      if (p1.length !== p2.length) {
        contagemOk = false;
        erros.push('Os dois potes precisam ter a mesma quantidade de jogadores (o pote 1 tem ' + p1.length + ' e o pote 2 tem ' + p2.length + ').');
      }
      n = p1.length;
      p1.forEach(function (nome) { add(nome, 1); });
      p2.forEach(function (nome) { add(nome, 2); });
    } else {
      var todos = nomes(entrada.lista);
      if (todos.length % 2) {
        contagemOk = false;
        erros.push('A lista tem ' + todos.length + ' jogadores. Precisa de uma quantidade par para formar as duplas.');
      }
      n = Math.floor(todos.length / 2);
      todos.forEach(function (nome) { add(nome, null); });
    }
    if (contagemOk && (n < MIN_DUPLAS || n > MAX_DUPLAS)) {
      erros.push('O sorteio precisa de ' + MIN_DUPLAS + ' a ' + MAX_DUPLAS + ' duplas (você tem ' + n + ').');
    }
    return { erros: erros, n: n, jogadores: jogadores, pares: pares };
  }

  // Vagas da chave (potência de 2). Os cabeças 1..(vagas − n) passam direto na 1ª rodada.
  function vagasDaChave(n) { var s = MIN_DUPLAS; while (s < n) s *= 2; return s; }

  // Arthur e Otávio em potes diferentes: devolve [índice no pote 1, índice no pote 2], ou null.
  function acharParFavorito(a, b) {
    for (var i = 0; i < a.length; i++) {
      var fa = favorito(a[i].nome);
      if (!fa) continue;
      for (var j = 0; j < b.length; j++) {
        var fb = favorito(b[j].nome);
        if (fb && fb !== fa) return [i, j];
      }
    }
    return null;
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
      var casal = null, achou = acharParFavorito(a, b);
      if (achou && rng() < CHANCE_DUPLA_FAVORITA) {
        casal = [a[achou[0]].id, b[achou[1]].id];
        a.splice(achou[0], 1); b.splice(achou[1], 1);
      }
      pares = a.map(function (j, i) { return [j.id, b[i].id]; });
      if (casal) pares.push(casal);
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

  /*
   * Sorteio da chave: embaralha a posição das duplas já sorteadas e renumera os cabeças (e os ids, que seguem o cabeça).
   * É aqui que se decide quem passa direto (bye) com número ímpar de duplas: os primeiros cabeças.
   */
  function sortearChave(duplas, rng) {
    rng = rng || rngAleatorio();
    return embaralhar(duplas, rng).map(function (d, i) {
      return { id: 'd' + (i + 1), nome: d.nome, jogadores: d.jogadores.slice(), seed: i + 1 };
    });
  }

  /*
   * Ordem em que as cartas viram na tela: devolve os índices de `duplas` (0 = cabeça 1).
   * Dupla com Arthur ou Otávio nunca é a primeira a sair.
   */
  function ordemDeRevelacao(duplas, jogadores, rng) {
    rng = rng || rngAleatorio();
    var porId = {};
    jogadores.forEach(function (j) { porId[j.id] = j; });
    function ehFavorita(d) {
      return d.jogadores.some(function (id) { return porId[id] && favorito(porId[id].nome); });
    }
    var ordem = embaralhar(duplas.map(function (d, i) { return i; }), rng);
    if (ordem.length > 1 && ehFavorita(duplas[ordem[0]])) {
      var outros = [];
      ordem.forEach(function (idx, k) { if (k > 0 && !ehFavorita(duplas[idx])) outros.push(k); });
      if (outros.length) {
        var k2 = outros[Math.floor(rng() * outros.length)], t = ordem[0];
        ordem[0] = ordem[k2]; ordem[k2] = t;
      }
    }
    return ordem;
  }

  // ---------- Arquivo do sorteio (JSON) ----------

  var FORMATO_ARQUIVO = 'torneio-box-castelandia/sorteio';
  var ID_VALIDO = /^[A-Za-z0-9_-]{1,24}$/;

  // O que vai para o arquivo: tudo o que o sorteio decidiu, para dar para restaurar igualzinho.
  function exportarSorteio(estado) {
    var n = estado.duplas.length;
    var ordem = estado.sorteio && Array.isArray(estado.sorteio.ordem) && estado.sorteio.ordem.length === n
      ? estado.sorteio.ordem.slice() : estado.duplas.map(function (d, i) { return i; });
    return {
      formato: FORMATO_ARQUIVO,
      versao: 1,
      geradoEm: new Date().toISOString(),
      nome: estado.config.nome,
      config: { modo: estado.config.modo, usarPotes: !!estado.config.usarPotes, finalComReset: !!estado.config.finalComReset },
      jogadores: estado.jogadores.map(function (j) { return { id: j.id, nome: j.nome, pote: j.pote == null ? null : j.pote }; }),
      duplas: estado.duplas.map(function (d) { return { id: d.id, jogadores: d.jogadores.slice(), seed: d.seed }; }),
      ordemRevelacao: ordem
    };
  }

  /*
   * Confere um arquivo de sorteio (objeto já lido do JSON). Nada do que vem do arquivo é aceito sem conferir.
   * Devolve { erros: [...] } ou { erros: [], sorteio: { nome, config, jogadores, duplas, ordem } }.
   */
  function lerSorteio(obj) {
    function falha(msg) { return { erros: [msg] }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return falha('O arquivo não é um sorteio do torneio.');
    if (obj.formato !== FORMATO_ARQUIVO) return falha('Esse arquivo não é um sorteio exportado por este site.');
    if (!Array.isArray(obj.jogadores) || !Array.isArray(obj.duplas)) return falha('O arquivo está incompleto (faltam jogadores ou duplas).');
    var n = obj.duplas.length;
    if (n < MIN_DUPLAS || n > MAX_DUPLAS) return falha('O sorteio precisa de ' + MIN_DUPLAS + ' a ' + MAX_DUPLAS + ' duplas (o arquivo tem ' + n + ').');

    var jogadores = [], porId = {}, nomesVistos = {}, i, k;
    for (i = 0; i < obj.jogadores.length; i++) {
      var j = obj.jogadores[i];
      if (!j || typeof j.id !== 'string' || !ID_VALIDO.test(j.id) || porId[j.id]) return falha('Jogador ' + (i + 1) + ' inválido ou repetido.');
      var nome = typeof j.nome === 'string' ? j.nome.replace(/\s+/g, ' ').trim() : '';
      if (!nome || nome.length > 60) return falha('Jogador ' + (i + 1) + ' sem nome (ou com nome grande demais).');
      if (nomesVistos[nome.toLowerCase()]) return falha('Nome repetido no arquivo: ' + nome + '.');
      if (j.pote !== null && j.pote !== undefined && j.pote !== 1 && j.pote !== 2) return falha('Jogador ' + nome + ' com pote inválido.');
      nomesVistos[nome.toLowerCase()] = true;
      porId[j.id] = { id: j.id, nome: nome, pote: j.pote == null ? null : j.pote };
      jogadores.push(porId[j.id]);
    }

    var usados = {}, vistosSeed = {}, originais = [];
    for (i = 0; i < n; i++) {
      var d = obj.duplas[i];
      if (!d || !Array.isArray(d.jogadores) || d.jogadores.length !== 2) return falha('Dupla ' + (i + 1) + ' precisa ter dois jogadores.');
      for (k = 0; k < 2; k++) {
        if (!porId[d.jogadores[k]]) return falha('Dupla ' + (i + 1) + ' usa um jogador que não está na lista.');
        if (usados[d.jogadores[k]]) return falha(porId[d.jogadores[k]].nome + ' aparece em mais de uma dupla.');
        usados[d.jogadores[k]] = true;
      }
      if (!Number.isInteger(d.seed) || d.seed < 1 || d.seed > n || vistosSeed[d.seed]) return falha('Dupla ' + (i + 1) + ' com cabeça de chave inválido ou repetido.');
      vistosSeed[d.seed] = true;
      originais.push(d);
    }
    if (jogadores.length !== 2 * n) return falha('A lista tem ' + jogadores.length + ' jogadores, mas ' + n + ' duplas precisam de ' + 2 * n + '.');

    // a posição final é o cabeça de chave; a ordem do arquivo aponta para as duplas na ordem em que estão no arquivo
    var posPorOriginal = originais.map(function (d) { return d.seed - 1; });
    var duplas = new Array(n);
    originais.forEach(function (d) {
      duplas[d.seed - 1] = {
        id: 'd' + d.seed, nome: nomeDaDupla(porId[d.jogadores[0]].nome, porId[d.jogadores[1]].nome),
        jogadores: d.jogadores.slice(), seed: d.seed
      };
    });

    var ordem = obj.ordemRevelacao;
    if (ordem === undefined) {
      ordem = duplas.map(function (d, idx) { return idx; });
    } else {
      var viu = {};
      var invalida = !Array.isArray(ordem) || ordem.length !== n || ordem.some(function (x) {
        if (!Number.isInteger(x) || x < 0 || x >= n || viu[x]) return true;
        viu[x] = true;
        return false;
      });
      if (invalida) return falha('A ordem de revelação do arquivo está inválida.');
      ordem = ordem.map(function (x) { return posPorOriginal[x]; });
    }

    var cfg = obj.config && typeof obj.config === 'object' ? obj.config : {};
    var modo = cfg.modo === 'prontas' ? 'prontas' : 'avulsos';
    var todosComPote = jogadores.every(function (x) { return x.pote === 1 || x.pote === 2; });
    return {
      erros: [],
      sorteio: {
        nome: typeof obj.nome === 'string' ? obj.nome.replace(/\s+/g, ' ').trim().slice(0, 60) : '',
        ordem: ordem, duplas: duplas, jogadores: jogadores,
        config: { modo: modo, usarPotes: modo === 'avulsos' && !!cfg.usarPotes && todosComPote, finalComReset: cfg.finalComReset !== false }
      }
    };
  }

  return {
    rngComSemente: rngComSemente, rngAleatorio: rngAleatorio, embaralhar: embaralhar,
    nomes: nomes, parseParDeNomes: parseParDeNomes, validar: validar, sortear: sortear,
    sortearChave: sortearChave, ordemDeRevelacao: ordemDeRevelacao, exportarSorteio: exportarSorteio, lerSorteio: lerSorteio,
    favorito: favorito, vagasDaChave: vagasDaChave,
    MIN_DUPLAS: MIN_DUPLAS, MAX_DUPLAS: MAX_DUPLAS, FAVORITOS: FAVORITOS, CHANCE_DUPLA_FAVORITA: CHANCE_DUPLA_FAVORITA
  };
});
