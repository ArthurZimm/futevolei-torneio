const test = require('node:test');
const assert = require('node:assert/strict');
const Chave = require('../js/chave.js');

// ---------- utilidades ----------

function rngComSemente(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function novoTorneio(n, opts = {}) {
  const e = Chave.estadoInicial();
  e.config.finalComReset = opts.reset !== false;
  e.duplas = Array.from({ length: n }, (_, i) => ({
    id: 'd' + (i + 1), nome: `J${2 * i + 1} / J${2 * i + 2}`, jogadores: [], seed: i + 1
  }));
  Chave.gerarJogos(e);
  e.fase = 'configJogos';
  if (opts.atalho) e.config.formatos = Chave.formatosDoAtalho(n, opts.atalho);
  if (opts.setDecisivo !== undefined) e.config.setDecisivo = opts.setDecisivo;
  Chave.iniciarTorneio(e);
  return e;
}

const reais = (e) => e.jogos.filter((g) => !g.bye && g.status !== 'dispensado');
const disputados = (e) => e.jogos.filter((g) => g.status === 'finalizado' || g.status === 'wo');
const foto = (e) => JSON.stringify([e.fase, e.jogos]);

// Joga o jogo inteiro. lado: 'A' | 'B'. modo: 'sets' | 'rapido' | 'wo'
function jogar(e, g, lado, modo = 'sets', rng = Math.random) {
  const venc = lado === 'A' ? g.duplaA : g.duplaB;
  if (modo === 'wo') return Chave.registrarWO(e, g.id, lado === 'A' ? g.duplaB : g.duplaA);
  if (modo === 'rapido') return Chave.registrarVencedor(e, g.id, venc, null);
  const need = Chave.setsParaVencer(g);
  let ganhos = 0, perdidos = 0;
  // o vencedor ganha 'need' sets; o perdedor ganha alguns no meio (nunca o decisivo)
  const perdeSets = g.formato.md === 1 ? 0 : Math.floor(rng() * need);
  while (ganhos < need) {
    const alvo = Chave.alvoDoSet(g);
    const vp = alvo + Math.floor(rng() * 3), lp = Math.floor(rng() * alvo);
    const venceEsse = perdidos < perdeSets && ganhos < need - 1 && rng() < 0.5 ? false : true;
    if (venceEsse) { ganhos++; Chave.registrarSet(e, g.id, lado === 'A' ? vp : lp, lado === 'A' ? lp : vp); }
    else { perdidos++; Chave.registrarSet(e, g.id, lado === 'A' ? lp : vp, lado === 'A' ? vp : lp); }
  }
}

// Simula o torneio inteiro e devolve a lista dos jogos na ordem em que foram jogados
function simular(e, rng, { wo = 0.05, rapido = 0.3, onStep } = {}) {
  const ordem = [];
  let guarda = 0;
  while (e.fase !== 'encerrado') {
    assert.ok(guarda++ < 100, 'torneio travou (loop infinito)');
    const g = Chave.jogoEmQuadra(e);
    assert.ok(g, 'não há próximo jogo, mas o torneio não terminou');
    const lado = rng() < 0.5 ? 'A' : 'B';
    const r = rng();
    jogar(e, g, lado, r < wo ? 'wo' : (r < wo + rapido ? 'rapido' : 'sets'), rng);
    ordem.push(g.id);
    if (onStep) onStep(g);
  }
  return ordem;
}

// ---------- estrutura da chave ----------

test('cruzamento padrão com 8 duplas (1×8, 4×5, 2×7, 3×6) e ligações da P', () => {
  const e = novoTorneio(8);
  const par = (id) => [e.jogos.find((g) => g.id === id).duplaA, e.jogos.find((g) => g.id === id).duplaB];
  assert.deepEqual(par('V1'), ['d1', 'd8']);
  assert.deepEqual(par('V2'), ['d4', 'd5']);
  assert.deepEqual(par('V3'), ['d2', 'd7']);
  assert.deepEqual(par('V4'), ['d3', 'd6']);
  const g = (id) => Chave.jogoPorId(e, id);
  assert.deepEqual(g('P1').origemA, { tipo: 'perdedor', jogo: 'V1' });
  assert.deepEqual(g('P1').origemB, { tipo: 'perdedor', jogo: 'V2' });
  // a rodada que recebe a semifinal inverte a ordem: P3 pega o perdedor de V6, P4 o de V5
  assert.deepEqual(g('P3').origemB, { tipo: 'perdedor', jogo: 'V6' });
  assert.deepEqual(g('P4').origemB, { tipo: 'perdedor', jogo: 'V5' });
  assert.deepEqual(g('P5').origemA, { tipo: 'vencedor', jogo: 'P3' });
  assert.deepEqual(g('P6').origemB, { tipo: 'perdedor', jogo: 'V7' });
  assert.deepEqual(g('GF').origemA, { tipo: 'vencedor', jogo: 'V7' });
  assert.deepEqual(g('GF').origemB, { tipo: 'vencedor', jogo: 'P6' });
  assert.equal(e.jogos.filter((x) => x.chave === 'V').length, 7);
  assert.equal(e.jogos.filter((x) => x.chave === 'P').length, 6);
});

test('fasesDoEstado conta os jogos reais por fase: soma 2N − 2, sem o reset nem byes', () => {
  for (let n = 4; n <= 32; n++) {
    const e = novoTorneio(n);
    const fases = Chave.fasesDoEstado(e);
    assert.equal(fases.reduce((s, f) => s + f.jogos, 0), 2 * n - 2, 'N=' + n);
    assert.equal(fases.find((f) => f.id === 'GF').jogos, 1);
  }
  assert.equal(Chave.fasesDoEstado(novoTorneio(6)).find((f) => f.id === 'V-R1').jogos, 2); // 2 byes
});

test('fases da chave por número de duplas', () => {
  assert.deepEqual(Chave.fasesDaChave(8).map((f) => f.id),
    ['V-R1', 'V-R2', 'V-F', 'P-R1', 'P-R2', 'P-R3', 'P-F', 'GF']);
  assert.deepEqual(Chave.fasesDaChave(4).map((f) => f.id), ['V-R1', 'V-F', 'P-R1', 'P-F', 'GF']);
  assert.equal(Chave.fasesDaChave(16).filter((f) => f.chave === 'P').length, 6);
  assert.equal(Chave.fasesDaChave(32).filter((f) => f.chave === 'P').length, 8);
  assert.throws(() => Chave.fasesDaChave(3), /4 a 32/);
  assert.throws(() => Chave.fasesDaChave(33), /4 a 32/);
});

test('byes: 6 duplas, os cabeças 1 e 2 passam direto na primeira rodada', () => {
  const e = novoTorneio(6);
  const v1 = Chave.jogoPorId(e, 'V1'), v3 = Chave.jogoPorId(e, 'V3');
  assert.equal(v1.status, 'bye'); assert.equal(v1.vencedor, 'd1');
  assert.equal(v3.status, 'bye'); assert.equal(v3.vencedor, 'd2');
  assert.equal(Chave.fila(e).some((g) => g.status === 'bye'), false);
  // jogos que realmente acontecem (sem byes e sem o reset): 2N − 2
  assert.equal(reais(e).filter((g) => g.id !== 'GF2').length, 2 * 6 - 2);
});

test('byes: 5 duplas (3 byes), os bye-contra-bye da P se resolvem sozinhos', () => {
  const e = novoTorneio(5);
  assert.equal(e.jogos.filter((g) => g.status === 'bye' && g.chave === 'V').length, 3);
  assert.equal(reais(e).filter((g) => g.id !== 'GF2').length, 2 * 5 - 2);
  // V2 (4×5) é o único jogo da rodada 1; V6 é d2 × d3, que passaram direto com bye
  assert.deepEqual(Chave.fila(e).filter((g) => g.status === 'pronto').map((g) => g.id), ['V2', 'V6']);
  // jogos da P com bye não aparecem na fila
  assert.equal(Chave.fila(e).some((g) => g.bye), false);
});

// ---------- contagem e integridade, N de 4 a 32 ----------

for (let n = 4; n <= 32; n++) {
  test(`N=${n}: nº de jogos, derrotas e classificação em 60 torneios aleatórios`, () => {
    for (let s = 1; s <= 60; s++) {
      const rng = rngComSemente(n * 1000 + s);
      const reset = s % 2 === 0;
      const atalho = ['padrao', 'finaisMd3', 'tudoMd3', 'tudo18'][s % 4];
      const e = novoTorneio(n, { reset, atalho, setDecisivo: [11, 15, null][s % 3] });
      simular(e, rng, { wo: s % 5 === 0 ? 0.2 : 0 });

      const gf2 = e.jogos.find((g) => g.id === 'GF2');
      const resetJogado = !!gf2 && gf2.status !== 'dispensado';
      assert.equal(disputados(e).length, 2 * n - 2 + (resetJogado ? 1 : 0), `jogos disputados N=${n} semente=${s}`);
      assert.equal(e.fase, 'encerrado');
      assert.ok(Chave.campeao(e));
      assert.equal(e.jogos.filter((g) => g.status === 'pronto' || g.status === 'aguardando' || g.status === 'emQuadra').length, 0, 'sobrou jogo órfão');

      // ninguém cai com uma derrota só; ninguém passa de duas; o campeão tem no máximo uma
      const cam = Chave.campeao(e);
      const finalistas = new Set([Chave.jogoPorId(e, 'GF').duplaA, Chave.jogoPorId(e, 'GF').duplaB]);
      e.duplas.forEach((d) => {
        const der = Chave.derrotas(e, d.id);
        assert.ok(der <= 2, `${d.id} com ${der} derrotas`);
        if (d.id === cam) assert.ok(der <= 1);
        else if (!finalistas.has(d.id)) assert.equal(der, 2, `${d.id} saiu com ${der} derrota(s)`);
      });

      // classificação: todas as duplas, uma vez cada, começando em 1º
      const c = Chave.classificacao(e);
      assert.ok(c.encerrado);
      const ids = c.linhas.flatMap((l) => l.duplas);
      assert.equal(ids.length, n);
      assert.equal(new Set(ids).size, n);
      assert.equal(c.linhas[0].pos, '1º');
      assert.equal(c.linhas[0].duplas[0], cam);
    }
  });
}

test('sem reset: vencedor da grande final é campeão; com reset, jogo extra só se o de baixo vencer', () => {
  for (let n = 4; n <= 32; n++) {
    // de cima vence: sem jogo extra
    let e = novoTorneio(n);
    simularAteGF(e, 'A');
    jogar(e, Chave.jogoPorId(e, 'GF'), 'A');
    assert.equal(e.fase, 'encerrado');
    assert.equal(Chave.jogoPorId(e, 'GF2').status, 'dispensado');
    assert.equal(Chave.campeao(e), Chave.jogoPorId(e, 'GF').duplaA);

    // de baixo vence com reset: joga o GF2
    e = novoTorneio(n);
    simularAteGF(e, 'A');
    const gf = Chave.jogoPorId(e, 'GF');
    jogar(e, gf, 'B');
    const gf2 = Chave.jogoPorId(e, 'GF2');
    assert.equal(e.fase, 'andamento');
    assert.equal(gf2.status, 'pronto');
    assert.equal(gf2.duplaA, gf.duplaA); assert.equal(gf2.duplaB, gf.duplaB);
    jogar(e, gf2, 'B');
    assert.equal(e.fase, 'encerrado');
    assert.equal(Chave.campeao(e), gf.duplaB);

    // de baixo vence sem reset: acabou
    e = novoTorneio(n, { reset: false });
    assert.equal(e.jogos.some((g) => g.id === 'GF2'), false);
    simularAteGF(e, 'A');
    jogar(e, Chave.jogoPorId(e, 'GF'), 'B');
    assert.equal(e.fase, 'encerrado');
    assert.equal(Chave.campeao(e), Chave.jogoPorId(e, 'GF').duplaB);
    assert.equal(disputados(e).length, 2 * n - 2);
  }
});

function simularAteGF(e, lado) {
  while (!(Chave.jogoPorId(e, 'GF').status === 'pronto')) {
    const g = Chave.jogoEmQuadra(e);
    assert.ok(g);
    jogar(e, g, lado);
  }
}

// ---------- fila ----------

test('fila: só joga quem já tem as duas duplas; nunca trava; evita repetir dupla quando dá', () => {
  for (let n = 4; n <= 32; n++) {
    for (let s = 1; s <= 20; s++) {
      const rng = rngComSemente(777 + n * 31 + s);
      const e = novoTorneio(n);
      simular(e, rng, {
        wo: 0,
        onStep: () => {
          if (e.fase !== 'andamento') return;
          const prox = Chave.jogoEmQuadra(e);
          assert.ok(prox);
          const ult = Chave.jogoPorId(e, e.ultimoJogo);
          const usados = [ult.duplaA, ult.duplaB];
          const repete = (g) => usados.includes(g.duplaA) || usados.includes(g.duplaB);
          if (repete(prox)) {
            const alternativa = Chave.fila(e).some((g) => g.status === 'pronto' && !repete(g));
            assert.equal(alternativa, false, 'repetiu dupla havendo alternativa');
          }
        }
      });
    }
  }
});

test('mover na fila troca só jogos prontos e respeita o emQuadra', () => {
  const e = novoTorneio(8);
  jogar(e, Chave.jogoPorId(e, 'V1'), 'A');
  jogar(e, Chave.jogoPorId(e, 'V2'), 'A');
  const prontos = () => Chave.fila(e).filter((g) => g.status === 'pronto').map((g) => g.id);
  // V3 e V4 ainda não jogaram; P1 (perdedores de V1 e V2) e V5 (vencedores) já estão prontos
  assert.deepEqual(prontos(), ['V3', 'V4', 'P1', 'V5']);
  assert.equal(Chave.moverNaFila(e, 'V4', -1), true);
  assert.deepEqual(prontos(), ['V4', 'V3', 'P1', 'V5']);
  assert.equal(Chave.moverNaFila(e, 'V5', 1), false); // já é o último
  assert.equal(Chave.jogoEmQuadra(e).id, 'V4');
  assert.equal(Chave.moverNaFila(e, 'V4', -1), false); // já é o primeiro
  assert.throws(() => Chave.moverNaFila(e, 'V7', 1), /prontos/); // ainda sem duplas
  Chave.registrarParcial(e, 'V4', 3, 1); // V4 passa a "em quadra"
  assert.throws(() => Chave.moverNaFila(e, 'V4', 1), /começou/);
  assert.equal(Chave.jogoEmQuadra(e).id, 'V4');
});

// ---------- formatos: MD1, MD3, MD5, set decisivo ----------

test('MD3 e MD5: o jogo termina sozinho quando uma dupla fecha os sets', () => {
  let e = novoTorneio(8, { atalho: 'tudoMd3', setDecisivo: 11 });
  let g = Chave.jogoPorId(e, 'V1');
  Chave.registrarSet(e, 'V1', 15, 9);
  assert.equal(g.status, 'emQuadra');
  assert.deepEqual(Chave.placarExibicao(g), { a: 1, b: 0, tipo: 'sets', parcial: true, sets: g.sets });
  Chave.registrarSet(e, 'V1', 12, 15);
  assert.equal(g.status, 'emQuadra'); // 1 a 1
  assert.equal(Chave.alvoDoSet(g), 11); // set decisivo
  assert.throws(() => Chave.registrarSet(e, 'V1', 10, 8), /11 pontos/);
  Chave.registrarSet(e, 'V1', 11, 8);
  assert.equal(g.status, 'finalizado');
  assert.equal(g.vencedor, 'd1');
  assert.equal(Chave.placarExibicao(g).a, 2);
  assert.equal(Chave.jogoPorId(e, 'V5').duplaA, 'd1');

  // MD5 com set decisivo "igual aos outros"
  e = novoTorneioComFormatos(8, { 'V-R1': { pontos: 18, md: 5 } }, null);
  g = Chave.jogoPorId(e, 'V1');
  [[18, 5], [5, 18], [18, 5], [5, 18]].forEach(([a, b]) => Chave.registrarSet(e, 'V1', a, b));
  assert.equal(g.status, 'emQuadra');
  assert.equal(Chave.alvoDoSet(g), 18);
  assert.throws(() => Chave.registrarSet(e, 'V1', 15, 10), /18 pontos/);
  Chave.registrarSet(e, 'V1', 5, 18);
  assert.equal(g.vencedor, 'd8');
  assert.equal(g.sets.length, 5);
});

function novoTorneioComFormatos(n, formatos, setDecisivo) {
  const e = Chave.estadoInicial();
  e.duplas = Array.from({ length: n }, (_, i) => ({ id: 'd' + (i + 1), nome: 'D' + (i + 1), jogadores: [], seed: i + 1 }));
  Chave.gerarJogos(e);
  e.fase = 'configJogos';
  Object.assign(e.config.formatos, formatos);
  e.config.setDecisivo = setDecisivo;
  return Chave.iniciarTorneio(e);
}

test('set: empate, placar abaixo do alvo e jogo que não está pronto são recusados', () => {
  const e = novoTorneio(8);
  assert.throws(() => Chave.registrarSet(e, 'V1', 15, 15), /empatado/);
  assert.throws(() => Chave.registrarSet(e, 'V1', 14, 12), /15 pontos/);
  assert.throws(() => Chave.registrarSet(e, 'V1', -1, 15), /inválido/);
  assert.throws(() => Chave.registrarSet(e, 'V7', 18, 2), /pronto/);
  assert.throws(() => Chave.registrarSet(e, 'V1', 15.5, 2), /inválido/);
  Chave.registrarSet(e, 'V1', 15, 2);
  assert.throws(() => Chave.registrarSet(e, 'V1', 15, 2), /pronto/); // já terminou
});

test('só o resultado final: vencedor, placar opcional e validações', () => {
  const e = novoTorneioComFormatos(8, { 'V-R1': { pontos: 15, md: 1 }, 'V-R2': { pontos: 15, md: 3 } }, 11);
  Chave.registrarVencedor(e, 'V1', 'd1'); // sem placar
  const v1 = Chave.jogoPorId(e, 'V1');
  assert.equal(v1.status, 'finalizado'); assert.equal(v1.sets.length, 0);
  assert.deepEqual(Chave.placarExibicao(v1).a, null);
  assert.throws(() => Chave.registrarVencedor(e, 'V2', 'd1'), /não joga/);
  // V2 é d4 (A) × d5 (B): placar 10×15 não combina com vitória do d4
  assert.throws(() => Chave.registrarVencedor(e, 'V2', 'd4', { a: 10, b: 15 }), /não bate/);
  assert.throws(() => Chave.registrarVencedor(e, 'V2', 'd4', { a: 15, b: 15 }), /inválido/);
  Chave.registrarVencedor(e, 'V2', 'd4', { a: 15, b: 10 });
  assert.deepEqual(Chave.jogoPorId(e, 'V2').sets, [{ a: 15, b: 10 }]);
  assert.equal(Chave.placarExibicao(Chave.jogoPorId(e, 'V2')).b, 10);

  // MD3: o placar opcional é em sets (2–0 ou 2–1)
  Chave.registrarVencedor(e, 'V3', 'd2');
  Chave.registrarVencedor(e, 'V4', 'd3');
  const v5 = Chave.jogoPorId(e, 'V5'); // d1 × d4, MD3
  assert.equal(v5.formato.md, 3);
  assert.throws(() => Chave.registrarVencedor(e, 'V5', 'd1', { a: 3, b: 0 }), /2 sets/);
  assert.throws(() => Chave.registrarVencedor(e, 'V5', 'd1', { a: 2, b: 2 }), /inválido/);
  Chave.registrarVencedor(e, 'V5', 'd1', { a: 2, b: 1 });
  assert.deepEqual(Chave.placarExibicao(v5), { a: 2, b: 1, tipo: 'sets', parcial: false, sets: [] });
});

test('WO: a outra dupla avança e o jogo conta como disputado', () => {
  const e = novoTorneio(8);
  Chave.registrarWO(e, 'V1', 'd8');
  const g = Chave.jogoPorId(e, 'V1');
  assert.equal(g.status, 'wo'); assert.equal(g.vencedor, 'd1'); assert.equal(g.perdedor, 'd8');
  assert.equal(Chave.jogoPorId(e, 'V5').duplaA, 'd1');
  assert.equal(Chave.jogoPorId(e, 'P1').duplaA, 'd8');
  assert.equal(Chave.progresso(e).feitos, 1);
  assert.throws(() => Chave.registrarWO(e, 'V2', 'd1'), /não joga/);
});

test('placar parcial (ponto a ponto) marca em quadra e não entra no histórico', () => {
  const e = novoTorneio(8);
  Chave.registrarParcial(e, 'V1', 3, 1);
  const g = Chave.jogoPorId(e, 'V1');
  assert.equal(g.status, 'emQuadra');
  assert.deepEqual(Chave.placarExibicao(g), { a: 3, b: 1, tipo: 'pontos', parcial: true, sets: [] });
  assert.equal(e.historico.length, 0);
  Chave.registrarParcial(e, 'V1', 0, 0);
  assert.equal(g.status, 'pronto');
  Chave.registrarParcial(e, 'V1', 14, 10);
  Chave.registrarSet(e, 'V1', 15, 10);
  assert.equal(g.parcial, null);
  assert.equal(g.status, 'finalizado');
});

// ---------- desfazer ----------

test('desfazer: cada passo volta exatamente ao estado anterior (N=4..32, MD1/MD3, WO, reset)', () => {
  for (let n = 4; n <= 32; n++) {
    for (let s = 1; s <= 8; s++) {
      const rng = rngComSemente(5000 + n * 13 + s);
      const e = novoTorneio(n, { atalho: s % 2 ? 'finaisMd3' : 'tudoMd3' });
      const fotos = [foto(e)];
      let guarda = 0;
      while (e.fase !== 'encerrado') {
        assert.ok(guarda++ < 120);
        const g = Chave.jogoEmQuadra(e);
        const lado = rng() < 0.5 ? 'A' : 'B';
        const r = rng();
        // um passo = uma ação do histórico; sets isolados contam como passos
        if (r < 0.1) Chave.registrarWO(e, g.id, lado === 'A' ? g.duplaA : g.duplaB);
        else if (r < 0.4) Chave.registrarVencedor(e, g.id, lado === 'A' ? g.duplaA : g.duplaB);
        else {
          const alvo = Chave.alvoDoSet(g);
          Chave.registrarSet(e, g.id, lado === 'A' ? alvo : 3, lado === 'A' ? 3 : alvo);
        }
        fotos.push(foto(e));
      }
      // desfaz tudo, conferindo cada passo
      for (let i = fotos.length - 2; i >= 0; i--) {
        assert.equal(Chave.desfazer(e), true);
        assert.equal(foto(e), fotos[i], `desfazer N=${n} s=${s} passo ${i}`);
      }
      assert.equal(Chave.desfazer(e), false);
    }
  }
});

test('desfazer depois do reset reabre a grande final', () => {
  const e = novoTorneio(8);
  simularAteGF(e, 'A');
  jogar(e, Chave.jogoPorId(e, 'GF'), 'B');
  jogar(e, Chave.jogoPorId(e, 'GF2'), 'A');
  assert.equal(e.fase, 'encerrado');
  Chave.desfazer(e);
  assert.equal(e.fase, 'andamento');
  assert.equal(Chave.jogoPorId(e, 'GF2').status, 'pronto');
  Chave.desfazer(e);
  assert.equal(Chave.jogoPorId(e, 'GF2').status, 'aguardando');
  assert.equal(Chave.jogoPorId(e, 'GF').status, 'pronto');
});

test('desfazer preserva a ordem manual da fila e o formato dos jogos', () => {
  const e = novoTorneio(8, { atalho: 'finaisMd3' });
  jogar(e, Chave.jogoPorId(e, 'V1'), 'A');
  jogar(e, Chave.jogoPorId(e, 'V2'), 'A');
  Chave.moverNaFila(e, 'V4', -1);
  const ordem = e.jogos.map((g) => g.ordemNaFila).join();
  Chave.desfazer(e);
  assert.equal(e.jogos.map((g) => g.ordemNaFila).join(), ordem);
  assert.equal(Chave.jogoPorId(e, 'V7').formato.md, 3);
});

// ---------- classificação ----------

test('classificação de 8 duplas bate com o wireframe: 1º, 2º, 3º, 4º, 5º–6º, 7º–8º', () => {
  const e = novoTorneio(8, { reset: false });
  // o cabeça de cima (d1) vence tudo; o vice é quem vier da P
  simularAteGF(e, 'A');
  jogar(e, Chave.jogoPorId(e, 'GF'), 'A');
  const c = Chave.classificacao(e);
  assert.deepEqual(c.linhas.map((l) => l.pos), ['1º', '2º', '3º', '4º', '5º–6º', '7º–8º']);
  assert.deepEqual(c.linhas.map((l) => l.duplas.length), [1, 1, 1, 1, 2, 2]);
  assert.equal(c.linhas[0].duplas[0], 'd1');
});

test('classificação parcial lista só quem já caiu na P e quem ainda está vivo', () => {
  const e = novoTorneio(8);
  ['V1', 'V2', 'V3', 'V4'].forEach((id) => jogar(e, Chave.jogoPorId(e, id), 'A'));
  jogar(e, Chave.jogoPorId(e, 'P1'), 'A');
  const c = Chave.classificacao(e);
  assert.equal(c.encerrado, false);
  assert.equal(c.linhas.length, 1);
  assert.equal(c.linhas[0].pos, null);
  assert.equal(c.vivos.length, 7);
});

test('não dá para lançar nada antes de iniciar o torneio nem depois de encerrar', () => {
  const e = Chave.estadoInicial();
  e.duplas = Array.from({ length: 4 }, (_, i) => ({ id: 'd' + (i + 1), nome: 'D' + (i + 1), jogadores: [], seed: i + 1 }));
  Chave.gerarJogos(e);
  assert.throws(() => Chave.iniciarTorneio(e), /sortear/);
  e.fase = 'configJogos';
  Chave.iniciarTorneio(e);
  assert.equal(Chave.jogoEmQuadra(e).id, 'V1');
  simular(e, rngComSemente(1));
  assert.throws(() => Chave.registrarSet(e, 'V1', 15, 2), /andamento/);
  assert.equal(Chave.jogoEmQuadra(e), null);
});

test('progresso: jogos feitos de total, sem contar byes e reset não disputado', () => {
  const e = novoTorneio(8);
  assert.deepEqual(Chave.progresso(e), { feitos: 0, total: 14 });
  jogar(e, Chave.jogoPorId(e, 'V1'), 'A');
  assert.deepEqual(Chave.progresso(e), { feitos: 1, total: 14 });
  const e6 = novoTorneio(6);
  assert.deepEqual(Chave.progresso(e6), { feitos: 0, total: 10 });
});
