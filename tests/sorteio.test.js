const test = require('node:test');
const assert = require('node:assert/strict');
const Sorteio = require('../js/sorteio.js');

const lista = (prefixo, n) => Array.from({ length: n }, (_, i) => prefixo + (i + 1)).join('\n');

test('nomes: tira linhas vazias, numeração e marcadores', () => {
  assert.deepEqual(Sorteio.nomes('1. Arthur\n2) Rafa\n- Bruno\n\n  • Diego  \r\nLéo'),
    ['Arthur', 'Rafa', 'Bruno', 'Diego', 'Léo']);
  assert.deepEqual(Sorteio.nomes(''), []);
  assert.deepEqual(Sorteio.nomes(null), []);
});

test('validar com potes: cada pote precisa ter N jogadores', () => {
  const ok = Sorteio.validar({ n: 8, modo: 'avulsos', usarPotes: true, pote1: lista('A', 8), pote2: lista('B', 8) });
  assert.deepEqual(ok.erros, []);
  assert.equal(ok.jogadores.length, 16);
  assert.equal(ok.jogadores.filter((j) => j.pote === 1).length, 8);

  const ruim = Sorteio.validar({ n: 8, modo: 'avulsos', usarPotes: true, pote1: lista('A', 7), pote2: lista('B', 9) });
  assert.equal(ruim.erros.length, 2);
  assert.match(ruim.erros[0], /pote 1.*8.*tem 7/);
});

test('validar sem potes e com duplas prontas', () => {
  assert.deepEqual(Sorteio.validar({ n: 4, modo: 'avulsos', usarPotes: false, lista: lista('J', 8) }).erros, []);
  assert.match(Sorteio.validar({ n: 4, modo: 'avulsos', usarPotes: false, lista: lista('J', 7) }).erros[0], /8 jogadores/);

  const prontas = Sorteio.validar({ n: 3 + 1, modo: 'prontas', duplas: 'Arthur / Matheus\nRafa e Pedro\nCaio + Thiago\nIgor & Felipe' });
  assert.deepEqual(prontas.erros, []);
  assert.equal(prontas.pares.length, 4);
  assert.equal(prontas.jogadores[1].nome, 'Matheus');

  const mal = Sorteio.validar({ n: 4, modo: 'prontas', duplas: 'Arthur\nRafa / Pedro\nA / B\nC / D' });
  assert.match(mal.erros[0], /Linha 1/);
});

test('validar recusa nome repetido e número de duplas fora de 4 a 16', () => {
  const r = Sorteio.validar({ n: 4, modo: 'avulsos', usarPotes: false, lista: 'A\nB\nC\nD\nE\nF\nG\nA' });
  assert.match(r.erros.join(' '), /Nome repetido: A/);
  assert.match(Sorteio.validar({ n: 3, modo: 'avulsos' }).erros[0], /4 e 16/);
  assert.match(Sorteio.validar({ n: 17, modo: 'avulsos' }).erros[0], /4 e 16/);
  assert.match(Sorteio.validar({ n: 'x', modo: 'avulsos' }).erros[0], /4 e 16/);
});

test('sortear com potes: toda dupla tem um de cada pote, ninguém repete, seeds de 1 a N', () => {
  for (let s = 1; s <= 200; s++) {
    const v = Sorteio.validar({ n: 8, modo: 'avulsos', usarPotes: true, pote1: lista('A', 8), pote2: lista('B', 8) });
    const duplas = Sorteio.sortear({ jogadores: v.jogadores, pares: v.pares, usarPotes: true }, Sorteio.rngComSemente(s));
    assert.equal(duplas.length, 8);
    const usados = new Set();
    duplas.forEach((d, i) => {
      assert.equal(d.seed, i + 1);
      assert.equal(d.id, 'd' + (i + 1));
      const [a, b] = d.jogadores.map((id) => v.jogadores.find((j) => j.id === id));
      assert.deepEqual([a.pote, b.pote], [1, 2]);
      assert.equal(d.nome, a.nome + ' / ' + b.nome);
      d.jogadores.forEach((id) => { assert.ok(!usados.has(id)); usados.add(id); });
    });
    assert.equal(usados.size, 16);
  }
});

test('sortear sem potes usa todos os jogadores uma vez; duplas prontas só embaralham a ordem', () => {
  const v = Sorteio.validar({ n: 5, modo: 'avulsos', usarPotes: false, lista: lista('J', 10) });
  const duplas = Sorteio.sortear({ jogadores: v.jogadores, pares: v.pares, usarPotes: false }, Sorteio.rngComSemente(3));
  assert.equal(new Set(duplas.flatMap((d) => d.jogadores)).size, 10);

  const p = Sorteio.validar({ n: 4, modo: 'prontas', duplas: 'A / B\nC / D\nE / F\nG / H' });
  const res = Sorteio.sortear({ jogadores: p.jogadores, pares: p.pares, usarPotes: false }, Sorteio.rngComSemente(9));
  assert.deepEqual(res.map((d) => d.nome).sort(), ['A / B', 'C / D', 'E / F', 'G / H']);
});

test('a mesma semente dá o mesmo sorteio; sementes diferentes variam', () => {
  const v = Sorteio.validar({ n: 8, modo: 'avulsos', usarPotes: true, pote1: lista('A', 8), pote2: lista('B', 8) });
  const dados = { jogadores: v.jogadores, pares: v.pares, usarPotes: true };
  const x = Sorteio.sortear(dados, Sorteio.rngComSemente(42)).map((d) => d.nome).join('|');
  const y = Sorteio.sortear(dados, Sorteio.rngComSemente(42)).map((d) => d.nome).join('|');
  const z = Sorteio.sortear(dados, Sorteio.rngComSemente(43)).map((d) => d.nome).join('|');
  assert.equal(x, y);
  assert.notEqual(x, z);
});

test('embaralhar é uniforme o bastante (cada item cai em cada posição ~1/4)', () => {
  const rng = Sorteio.rngComSemente(7);
  const cont = { a: [0, 0, 0, 0], b: [0, 0, 0, 0], c: [0, 0, 0, 0], d: [0, 0, 0, 0] };
  for (let i = 0; i < 8000; i++) Sorteio.embaralhar(['a', 'b', 'c', 'd'], rng).forEach((x, pos) => cont[x][pos]++);
  Object.values(cont).flat().forEach((c) => assert.ok(c > 1700 && c < 2300, 'posição fora do esperado: ' + c));
  // com o aleatório do crypto também funciona
  const r = Sorteio.rngAleatorio()();
  assert.ok(r >= 0 && r < 1);
});
