/*
 * Lógica pura da dupla eliminação (sem DOM). Funciona no navegador (window.Chave) e no Node (require).
 *
 * Ideia central: o estado dos jogos é DERIVADO.
 *   estado.historico = lista de ações (set, vencedor, WO) lançadas pelo admin, em ordem.
 *   "Desfazer" tira a última ação e reaplica todas as outras numa chave zerada.
 * Assim nunca sobra um destino de jogo "meio preenchido" depois de corrigir um resultado.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Chave = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BYE = 'BYE'; // "dupla fantasma": quem enfrenta um bye passa direto
  var ENCERRADOS = ['finalizado', 'wo', 'bye', 'dispensado'];

  // ---------- Estado inicial e configuração ----------

  function estadoInicial() {
    return {
      versao: 0,
      atualizadoEm: null,
      fase: 'config', // config | sorteio | sorteado (chave ainda não montada) | configJogos | andamento | encerrado
      config: {
        nome: 'Torneio Box Castelândia',
        numDuplas: 8,
        usarPotes: true,
        modo: 'avulsos', // avulsos (sorteia as duplas) | prontas (duplas já formadas)
        finalComReset: true,
        setDecisivo: 11, // 11 | 15 | null (igual aos outros sets)
        formatos: {}
      },
      entrada: { pote1: '', pote2: '', lista: '', duplas: '' }, // textos colados pelo admin
      jogadores: [],
      duplas: [],
      sorteio: { revelados: 0 },
      jogos: [],
      historico: [],
      filaManual: false,
      ultimoJogo: null
    };
  }

  function tamanhoDaChave(n) {
    var s = 4;
    while (s < n) s *= 2;
    return s;
  }

  var MIN_DUPLAS = 4, MAX_DUPLAS = 32;

  function validarNumDuplas(n) {
    if (!Number.isInteger(n) || n < MIN_DUPLAS || n > MAX_DUPLAS) throw new Error('A chave aceita de ' + MIN_DUPLAS + ' a ' + MAX_DUPLAS + ' duplas.');
  }

  // Quantidade de jogos da rodada k da chave de perdedores (k começa em 1).
  function jogosDaRodadaP(S, k) {
    if (k === 1) return S / 4;
    if (k % 2 === 0) return S / Math.pow(2, k / 2 + 1);
    return S / Math.pow(2, (k - 1) / 2 + 2);
  }

  // Fases da chave (uma linha na tela "Configurar jogos"). Independe de byes.
  function fasesDaChave(n) {
    validarNumDuplas(n);
    var S = tamanhoDaChave(n), R = Math.log2(S), fases = [], r, k;
    for (r = 1; r <= R; r++) {
      var ultima = r === R;
      fases.push({
        id: ultima ? 'V-F' : 'V-R' + r,
        nome: ultima ? 'V · final' : (r === R - 1 ? 'V · semifinal' : 'V · rodada ' + r),
        chave: 'V', rodada: r, jogos: S / Math.pow(2, r), final: ultima
      });
    }
    for (k = 1; k <= 2 * R - 2; k++) {
      var fim = k === 2 * R - 2;
      fases.push({
        id: fim ? 'P-F' : 'P-R' + k,
        nome: fim ? 'P · final' : 'P · rodada ' + k,
        chave: 'P', rodada: k, jogos: jogosDaRodadaP(S, k), final: fim
      });
    }
    fases.push({ id: 'GF', nome: 'Grande final', chave: 'GF', rodada: 1, jogos: 1, final: true });
    return fases;
  }

  var ATALHOS = {
    padrao: { nome: 'Padrão', aplicar: function (f) { return { pontos: f.final ? 18 : 15, md: 1 }; } },
    finaisMd3: { nome: 'Finais MD3', aplicar: function (f) { return { pontos: f.final ? 18 : 15, md: f.final ? 3 : 1 }; } },
    tudoMd3: { nome: 'Tudo MD3', aplicar: function () { return { pontos: 15, md: 3 }; } },
    tudo18: { nome: 'Tudo 18', aplicar: function () { return { pontos: 18, md: 1 }; } }
  };

  function formatosDoAtalho(n, atalho) {
    var def = ATALHOS[atalho];
    if (!def) throw new Error('Atalho desconhecido: ' + atalho);
    var out = {};
    fasesDaChave(n).forEach(function (f) { out[f.id] = def.aplicar(f); });
    return out;
  }

  // Total de jogos disputados: 2N − 2 (mais 1 se o reset acontecer).
  function totalJogos(n) { return 2 * n - 2; }

  // Mesma lista de fases, mas com a contagem de jogos reais (sem byes) da chave gerada.
  function fasesDoEstado(estado) {
    return fasesDaChave(estado.duplas.length).map(function (f) {
      // o reset (GF2) não entra na conta: só acontece se a dupla de baixo vencer a grande final
      var reais = estado.jogos.filter(function (g) { return g.fase === f.id && !g.bye && g.id !== 'GF2'; }).length;
      return Object.assign({}, f, { jogos: estado.jogos.length ? reais : f.jogos });
    });
  }

  // ---------- Geração da chave ----------

  // Ordem padrão dos cabeças de chave: 1×8, 4×5, 2×7, 3×6 (para 8 vagas) e assim por diante.
  function ordemDosSeeds(S) {
    var o = [1, 2];
    while (o.length < S) {
      var t = o.length * 2;
      o = o.flatMap(function (x) { return [x, t + 1 - x]; });
    }
    return o;
  }

  function construirJogos(n, finalComReset) {
    var S = tamanhoDaChave(n), R = Math.log2(S);
    var jogos = [], porId = {};
    function novo(id, chave, fase, rodada, origemA, origemB) {
      var g = {
        id: id, chave: chave, fase: fase, rodada: rodada, ordemNaFila: 0,
        origemA: origemA, origemB: origemB,
        destinoVencedor: null, destinoPerdedor: null, formato: null,
        duplaA: null, duplaB: null, sets: [], placarSets: null, parcial: null,
        vencedor: null, perdedor: null, status: 'aguardando', bye: false
      };
      jogos.push(g); porId[id] = g;
      return g;
    }
    var ven = function (g) { return { tipo: 'vencedor', jogo: g.id }; };
    var per = function (g) { return { tipo: 'perdedor', jogo: g.id }; };

    // Chave dos vencedores
    var v = [], cv = 1, ordem = ordemDosSeeds(S), r, i, k;
    for (r = 1; r <= R; r++) {
      v[r] = [];
      var fase = r === R ? 'V-F' : 'V-R' + r;
      for (i = 0; i < S / Math.pow(2, r); i++) {
        var a, b;
        if (r === 1) { a = { tipo: 'seed', seed: ordem[2 * i] }; b = { tipo: 'seed', seed: ordem[2 * i + 1] }; }
        else { a = ven(v[r - 1][2 * i]); b = ven(v[r - 1][2 * i + 1]); }
        v[r].push(novo('V' + cv++, 'V', fase, r, a, b));
      }
    }

    // Chave dos perdedores: rodadas ímpares só entre quem já está embaixo;
    // rodadas pares (k = 2m) recebem os perdedores da rodada m+1 da chave V, em ordem invertida
    // para evitar revanche imediata.
    var p = [], cp = 1, totalP = 2 * R - 2;
    for (k = 1; k <= totalP; k++) {
      p[k] = [];
      var faseP = k === totalP ? 'P-F' : 'P-R' + k;
      var qtd = jogosDaRodadaP(S, k);
      for (i = 0; i < qtd; i++) {
        var pa, pb;
        if (k === 1) { pa = per(v[1][2 * i]); pb = per(v[1][2 * i + 1]); }
        else if (k % 2 === 0) { pa = ven(p[k - 1][i]); pb = per(v[k / 2 + 1][qtd - 1 - i]); }
        else { pa = ven(p[k - 1][2 * i]); pb = ven(p[k - 1][2 * i + 1]); }
        p[k].push(novo('P' + cp++, 'P', faseP, k, pa, pb));
      }
    }

    var vFinal = v[R][0], pFinal = p[totalP][0];
    var gf = novo('GF', 'GF', 'GF', 1, ven(vFinal), ven(pFinal));
    var gf2 = null;
    if (finalComReset) {
      gf2 = novo('GF2', 'GF', 'GF', 2,
        { tipo: 'rotulo', texto: 'Venc. ' + vFinal.id }, { tipo: 'rotulo', texto: 'Venc. ' + pFinal.id });
    }

    // Destinos (vencedor/perdedor de cada jogo), a partir das origens
    jogos.forEach(function (g) {
      ['A', 'B'].forEach(function (lado) {
        var o = g['origem' + lado];
        if (o.tipo === 'vencedor') porId[o.jogo].destinoVencedor = { jogo: g.id, lado: lado };
        if (o.tipo === 'perdedor') porId[o.jogo].destinoPerdedor = { jogo: g.id, lado: lado };
      });
    });

    // Ordem na fila: V e P intercalados, respeitando as dependências.
    var seq = [];
    for (r = 1; r <= R; r++) {
      seq = seq.concat(v[r]);
      if (2 * r - 2 >= 1) seq = seq.concat(p[2 * r - 2]);
      if (2 * r - 1 <= totalP) seq = seq.concat(p[2 * r - 1]);
    }
    seq.push(gf);
    if (gf2) seq.push(gf2);
    seq.forEach(function (g, idx) { g.ordemNaFila = idx + 1; });

    return jogos;
  }

  function jogoPorId(estado, id) {
    var g = estado.jogos.find(function (j) { return j.id === id; });
    if (!g) throw new Error('Jogo não encontrado: ' + id);
    return g;
  }

  // Gera a chave inteira a partir das duplas sorteadas (seed = ordem do sorteio).
  function gerarJogos(estado) {
    validarNumDuplas(estado.duplas.length);
    estado.config.numDuplas = estado.duplas.length;
    estado.jogos = construirJogos(estado.duplas.length, !!estado.config.finalComReset);
    estado.historico = [];
    estado.filaManual = false;
    estado.ultimoJogo = null;
    if (!estado.config.formatos || !Object.keys(estado.config.formatos).length) {
      estado.config.formatos = formatosDoAtalho(estado.duplas.length, 'padrao');
    }
    resetarDinamico(estado);
    return estado;
  }

  // ---------- Motor: preencher vagas, resolver byes, finalizar jogos ----------

  function resetarDinamico(estado) {
    var porSeed = {};
    estado.duplas.forEach(function (d) { porSeed[d.seed] = d.id; });
    estado.jogos.forEach(function (g) {
      g.duplaA = null; g.duplaB = null; g.sets = []; g.placarSets = null; g.parcial = null;
      g.vencedor = null; g.perdedor = null; g.status = 'aguardando'; g.bye = false;
      ['A', 'B'].forEach(function (lado) {
        var o = g['origem' + lado];
        if (o.tipo === 'seed') g['dupla' + lado] = porSeed[o.seed] || BYE;
      });
    });
    estado.ultimoJogo = null;
    estado.filaManual = false;
    if (estado.fase === 'encerrado') estado.fase = 'andamento';
    avaliar(estado);
  }

  function preencher(estado, destino, valor) {
    if (destino) jogoPorId(estado, destino.jogo)['dupla' + destino.lado] = valor;
  }

  function propagar(estado, g) {
    preencher(estado, g.destinoVencedor, g.vencedor);
    preencher(estado, g.destinoPerdedor, g.perdedor);
  }

  // Marca jogos como "pronto" quando as duas vagas estão preenchidas e resolve os byes sozinhos.
  // g.bye = true desde que uma das vagas é bye: o jogo nunca será disputado, mesmo que a outra
  // vaga ainda não tenha chegado (por isso fica fora da fila e da contagem de jogos).
  function avaliar(estado) {
    var mudou = true;
    while (mudou) {
      mudou = false;
      estado.jogos.forEach(function (g) {
        if (ENCERRADOS.indexOf(g.status) !== -1) return;
        if (g.duplaA === BYE || g.duplaB === BYE) g.bye = true;
        if (g.duplaA == null || g.duplaB == null) return;
        if (g.duplaA === BYE || g.duplaB === BYE) {
          g.vencedor = g.duplaA === BYE ? g.duplaB : g.duplaA;
          g.perdedor = BYE;
          g.status = 'bye';
          propagar(estado, g);
          mudou = true;
        } else if (g.status === 'aguardando') {
          g.status = 'pronto';
          mudou = true;
        }
      });
    }
  }

  function finalizar(estado, g, vencedor, status) {
    g.vencedor = vencedor;
    g.perdedor = vencedor === g.duplaA ? g.duplaB : g.duplaA;
    g.status = status || 'finalizado';
    g.parcial = null;
    estado.ultimoJogo = g.id;
    estado.filaManual = false;
    propagar(estado, g);

    if (g.id === 'GF') {
      var gf2 = estado.jogos.find(function (j) { return j.id === 'GF2'; });
      // Quem veio de baixo (lado B) venceu: os dois têm uma derrota, joga o reset.
      if (gf2 && vencedor === g.duplaB) {
        gf2.duplaA = g.duplaA; gf2.duplaB = g.duplaB; gf2.status = 'pronto';
      } else {
        if (gf2) gf2.status = 'dispensado';
        estado.fase = 'encerrado';
      }
    }
    if (g.id === 'GF2') estado.fase = 'encerrado';
    avaliar(estado);
  }

  // ---------- Formato dos jogos ----------

  function iniciarTorneio(estado) {
    if (estado.fase !== 'configJogos') throw new Error('O torneio só inicia depois de sortear e configurar os jogos.');
    var sd = estado.config.setDecisivo || null;
    estado.jogos.forEach(function (g) {
      var f = estado.config.formatos[g.fase];
      if (!f) throw new Error('Falta configurar o formato da fase ' + g.fase + '.');
      g.formato = { pontos: f.pontos, md: f.md, setDecisivo: sd };
    });
    estado.fase = 'andamento';
    estado.historico = [];
    resetarDinamico(estado);
    return estado;
  }

  function setsParaVencer(g) { return Math.ceil((g.formato ? g.formato.md : 1) / 2); }

  // Pontos que fecham o set atual (o último set possível de um MD3/MD5 pode ser mais curto).
  function alvoDoSet(g) {
    var f = g.formato || { pontos: 15, md: 1, setDecisivo: null };
    var numero = g.sets.length + 1;
    if (f.md > 1 && numero === f.md && f.setDecisivo) return f.setDecisivo;
    return f.pontos;
  }

  function vitoriasEmSets(g) {
    var va = 0, vb = 0;
    g.sets.forEach(function (s) { if (s.a > s.b) va++; else vb++; });
    return { a: va, b: vb };
  }

  // ---------- Ações do admin ----------

  function jogavel(estado, g) {
    if (estado.fase !== 'andamento') throw new Error('O torneio não está em andamento.');
    if (g.status !== 'pronto' && g.status !== 'emQuadra') throw new Error('Esse jogo ainda não está pronto.');
  }

  function inteiro(n) { return Number.isInteger(n) && n >= 0; }

  function aplicarAcao(estado, acao) {
    var g = jogoPorId(estado, acao.jogo);
    if (acao.t === 'set') {
      g.sets.push({ a: acao.a, b: acao.b });
      g.parcial = null;
      g.status = 'emQuadra';
      var v = vitoriasEmSets(g), need = setsParaVencer(g);
      if (v.a >= need) finalizar(estado, g, g.duplaA);
      else if (v.b >= need) finalizar(estado, g, g.duplaB);
    } else if (acao.t === 'venc') {
      if (acao.placar) {
        if (g.formato.md === 1) g.sets = [{ a: acao.placar.a, b: acao.placar.b }];
        else g.placarSets = { a: acao.placar.a, b: acao.placar.b };
      }
      finalizar(estado, g, acao.vencedor);
    } else if (acao.t === 'wo') {
      finalizar(estado, g, acao.faltou === g.duplaA ? g.duplaB : g.duplaA, 'wo');
    }
  }

  function lancar(estado, acao) {
    aplicarAcao(estado, acao);
    estado.historico.push(acao);
    return estado;
  }

  // Lança o placar de UM set. No MD1 isso já encerra o jogo.
  function registrarSet(estado, id, a, b) {
    var g = jogoPorId(estado, id);
    jogavel(estado, g);
    if (!inteiro(a) || !inteiro(b)) throw new Error('Placar inválido.');
    if (a === b) throw new Error('O set não pode terminar empatado.');
    var alvo = alvoDoSet(g);
    if (Math.max(a, b) < alvo) throw new Error('O set só termina quando uma dupla chega a ' + alvo + ' pontos.');
    return lancar(estado, { t: 'set', jogo: id, a: a, b: b });
  }

  // Placar do set em andamento (ponto a ponto). Não entra no histórico.
  function registrarParcial(estado, id, a, b) {
    var g = jogoPorId(estado, id);
    jogavel(estado, g);
    if (!inteiro(a) || !inteiro(b)) throw new Error('Placar inválido.');
    g.parcial = { a: a, b: b };
    g.status = (a === 0 && b === 0 && !g.sets.length) ? 'pronto' : 'emQuadra';
    return estado;
  }

  // "Só o resultado final". O placar é opcional: pontos no MD1, sets ganhos no MD3/MD5.
  function registrarVencedor(estado, id, vencedorId, placar) {
    var g = jogoPorId(estado, id);
    jogavel(estado, g);
    if (vencedorId !== g.duplaA && vencedorId !== g.duplaB) throw new Error('Esse vencedor não joga esse jogo.');
    var p = null;
    if (placar && placar.a != null && placar.b != null && placar.a !== '' && placar.b !== '') {
      p = { a: Number(placar.a), b: Number(placar.b) };
      if (!inteiro(p.a) || !inteiro(p.b) || p.a === p.b) throw new Error('Placar final inválido.');
      var ganhouA = p.a > p.b;
      if ((vencedorId === g.duplaA) !== ganhouA) throw new Error('O placar não bate com o vencedor escolhido.');
      if (g.formato.md > 1) {
        var need = setsParaVencer(g), maior = Math.max(p.a, p.b), menor = Math.min(p.a, p.b);
        if (maior !== need || menor >= need) throw new Error('No MD' + g.formato.md + ' o vencedor precisa de ' + need + ' sets.');
      }
    }
    return lancar(estado, { t: 'venc', jogo: id, vencedor: vencedorId, placar: p });
  }

  function registrarWO(estado, id, faltouId) {
    var g = jogoPorId(estado, id);
    jogavel(estado, g);
    if (faltouId !== g.duplaA && faltouId !== g.duplaB) throw new Error('Essa dupla não joga esse jogo.');
    return lancar(estado, { t: 'wo', jogo: id, faltou: faltouId });
  }

  function reconstruir(estado) {
    var acoes = estado.historico.slice();
    resetarDinamico(estado);
    acoes.forEach(function (a) { aplicarAcao(estado, a); });
  }

  // Remove o último resultado lançado e refaz a chave sem ele.
  function desfazer(estado) {
    if (!estado.historico.length) return false;
    estado.historico.pop();
    reconstruir(estado);
    return true;
  }

  // ---------- Fila (uma quadra só) ----------

  function dividem(g, usados) {
    return usados.indexOf(g.duplaA) !== -1 || usados.indexOf(g.duplaB) !== -1;
  }

  // Jogos que ainda vão acontecer, na ordem. Os "prontos" evitam repetir a dupla que acabou de jogar.
  function fila(estado) {
    var lista = estado.jogos.filter(function (g) {
      if (g.bye || ENCERRADOS.indexOf(g.status) !== -1) return false;
      return !(g.id === 'GF2' && g.status === 'aguardando');
    }).sort(function (x, y) { return x.ordemNaFila - y.ordemNaFila; });

    var prontos = lista.filter(function (g) { return g.status === 'pronto' || g.status === 'emQuadra'; });
    prontos.sort(function (x, y) {
      var ex = x.status === 'emQuadra' ? 0 : 1, ey = y.status === 'emQuadra' ? 0 : 1;
      return ex - ey || x.ordemNaFila - y.ordemNaFila;
    });
    var temEmQuadra = prontos.length && prontos[0].status === 'emQuadra';
    if (!temEmQuadra && !estado.filaManual && estado.ultimoJogo && prontos.length > 1) {
      var ult = jogoPorId(estado, estado.ultimoJogo), usados = [ult.duplaA, ult.duplaB];
      if (dividem(prontos[0], usados)) {
        var alt = prontos.find(function (g) { return !dividem(g, usados); });
        if (alt) prontos = [alt].concat(prontos.filter(function (g) { return g !== alt; }));
      }
    }
    // Recoloca os prontos nas posições que eles ocupavam; os aguardando ficam onde estavam.
    var k = 0;
    return lista.map(function (g) {
      return (g.status === 'pronto' || g.status === 'emQuadra') ? prontos[k++] : g;
    });
  }

  function jogoEmQuadra(estado) {
    if (estado.fase !== 'andamento') return null;
    return fila(estado).find(function (g) { return g.status === 'emQuadra' || g.status === 'pronto'; }) || null;
  }

  // Sobe (dir = -1) ou desce (dir = +1) um jogo "pronto" entre os prontos.
  function moverNaFila(estado, id, dir) {
    var prontos = fila(estado).filter(function (g) { return g.status === 'pronto' || g.status === 'emQuadra'; });
    var pos = prontos.findIndex(function (g) { return g.id === id; });
    if (pos === -1) throw new Error('Só dá para mover jogos que já estão prontos.');
    if (prontos[pos].status === 'emQuadra') throw new Error('Esse jogo já começou.');
    var alvo = pos + dir;
    if (alvo < 0 || alvo >= prontos.length || prontos[alvo].status === 'emQuadra') return false;
    // Fixa a ordem atual nos números da fila e troca os dois vizinhos.
    var numeros = prontos.map(function (g) { return g.ordemNaFila; }).sort(function (x, y) { return x - y; });
    prontos.forEach(function (g, i) { g.ordemNaFila = numeros[i]; });
    var t = prontos[pos].ordemNaFila;
    prontos[pos].ordemNaFila = prontos[alvo].ordemNaFila;
    prontos[alvo].ordemNaFila = t;
    estado.filaManual = true;
    return true;
  }

  // ---------- Consultas ----------

  function nomeDupla(estado, id) {
    if (id === BYE) return 'BYE';
    var d = estado.duplas.find(function (x) { return x.id === id; });
    return d ? d.nome : '';
  }

  // Texto de uma vaga: o nome da dupla ou de onde ela vai vir.
  function rotuloDoSlot(estado, g, lado) {
    var id = g['dupla' + lado];
    if (id === BYE) return 'BYE';
    if (id) return nomeDupla(estado, id);
    var o = g['origem' + lado];
    if (o.tipo === 'vencedor') return 'Venc. ' + o.jogo;
    if (o.tipo === 'perdedor') return 'Caído da ' + o.jogo;
    if (o.tipo === 'rotulo') return o.texto;
    return 'A definir';
  }

  function derrotas(estado, duplaId) {
    return estado.jogos.filter(function (g) { return g.perdedor === duplaId && g.status !== 'bye'; }).length;
  }

  function campeao(estado) {
    var gf = estado.jogos.find(function (g) { return g.id === 'GF'; });
    var gf2 = estado.jogos.find(function (g) { return g.id === 'GF2'; });
    if (gf2 && (gf2.status === 'finalizado' || gf2.status === 'wo')) return gf2.vencedor;
    if (gf && (gf.status === 'finalizado' || gf.status === 'wo') && (!gf2 || gf2.status === 'dispensado')) return gf.vencedor;
    return null;
  }

  function progresso(estado) {
    var reais = estado.jogos.filter(function (g) {
      if (g.bye || g.status === 'dispensado') return false;
      return !(g.id === 'GF2' && g.status === 'aguardando');
    });
    var feitos = reais.filter(function (g) { return g.status === 'finalizado' || g.status === 'wo'; }).length;
    return { feitos: feitos, total: reais.length };
  }

  // Classificação. Posições só existem com o torneio encerrado; antes disso lista quem já caiu.
  function classificacao(estado) {
    var campeaoId = campeao(estado);
    var eliminados = {}; // rodada da P -> [duplaId]
    var terceiro = null;
    estado.jogos.forEach(function (g) {
      if (g.chave !== 'P' || (g.status !== 'finalizado' && g.status !== 'wo')) return;
      if (g.fase === 'P-F') { terceiro = g.perdedor; return; }
      (eliminados[g.rodada] = eliminados[g.rodada] || []).push(g.perdedor);
    });
    var rodadas = Object.keys(eliminados).map(Number).sort(function (x, y) { return y - x; });
    var linhas = [], vivos;

    if (campeaoId) {
      var gf = estado.jogos.find(function (g) { return g.id === 'GF'; });
      var vice = gf.duplaA === campeaoId ? gf.duplaB : gf.duplaA;
      linhas.push({ pos: '1º', duplas: [campeaoId], motivo: 'Campeão' });
      linhas.push({ pos: '2º', duplas: [vice], motivo: 'Vice' });
      if (terceiro) linhas.push({ pos: '3º', duplas: [terceiro], motivo: 'Caiu na final da P' });
      var inicio = 4;
      rodadas.forEach(function (r) {
        var ds = eliminados[r], fim = inicio + ds.length - 1;
        linhas.push({ pos: ds.length > 1 ? inicio + 'º–' + fim + 'º' : inicio + 'º', duplas: ds, motivo: 'caiu na P · R' + r });
        inicio = fim + 1;
      });
      vivos = [];
    } else {
      rodadas.forEach(function (r) { linhas.push({ pos: null, duplas: eliminados[r], motivo: 'caiu na P · R' + r }); });
      if (terceiro) linhas.unshift({ pos: null, duplas: [terceiro], motivo: 'caiu na final da P' });
      var fora = {};
      linhas.forEach(function (l) { l.duplas.forEach(function (d) { fora[d] = true; }); });
      vivos = estado.duplas.map(function (d) { return d.id; }).filter(function (d) { return !fora[d]; });
    }
    return { encerrado: !!campeaoId, linhas: linhas, vivos: vivos };
  }

  // O que mostrar de placar num card: pontos (MD1) ou sets ganhos (MD3/MD5).
  function placarExibicao(g) {
    var md = g.formato ? g.formato.md : 1;
    var vazio = { a: null, b: null, tipo: md === 1 ? 'pontos' : 'sets', parcial: false, sets: g.sets };
    if (md === 1) {
      if (g.sets.length) return { a: g.sets[0].a, b: g.sets[0].b, tipo: 'pontos', parcial: false, sets: g.sets };
      if (g.parcial) return { a: g.parcial.a, b: g.parcial.b, tipo: 'pontos', parcial: true, sets: g.sets };
      return vazio;
    }
    var v = g.placarSets || vitoriasEmSets(g);
    if (!g.sets.length && !g.placarSets && !g.parcial) return vazio;
    return { a: v.a, b: v.b, tipo: 'sets', parcial: g.status === 'emQuadra', sets: g.sets };
  }

  return {
    BYE: BYE, ATALHOS: ATALHOS,
    estadoInicial: estadoInicial, tamanhoDaChave: tamanhoDaChave, MIN_DUPLAS: MIN_DUPLAS, MAX_DUPLAS: MAX_DUPLAS,
    fasesDaChave: fasesDaChave, fasesDoEstado: fasesDoEstado,
    formatosDoAtalho: formatosDoAtalho, totalJogos: totalJogos,
    gerarJogos: gerarJogos, iniciarTorneio: iniciarTorneio,
    registrarSet: registrarSet, registrarParcial: registrarParcial,
    registrarVencedor: registrarVencedor, registrarWO: registrarWO,
    desfazer: desfazer, fila: fila, jogoEmQuadra: jogoEmQuadra, moverNaFila: moverNaFila,
    classificacao: classificacao, campeao: campeao, progresso: progresso, derrotas: derrotas,
    placarExibicao: placarExibicao, alvoDoSet: alvoDoSet, setsParaVencer: setsParaVencer,
    nomeDupla: nomeDupla, rotuloDoSlot: rotuloDoSlot, jogoPorId: jogoPorId
  };
});
