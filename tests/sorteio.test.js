const test = require('node:test');
const assert = require('node:assert/strict');
const Sorteio = require('../js/sorteio.js');
const Chave = require('../js/chave.js');

const lista = (prefixo, n) => Array.from({ length: n }, (_, i) => prefixo + (i + 1)).join('\n');

// Potes com Arthur no pote 1 e Otávio no pote 2 (os demais são A2.., B2..).
function potesComFavoritos(n, nomes = ['Arthur', 'Otávio']) {
  const p1 = lista('A', n).split('\n'), p2 = lista('B', n).split('\n');
  p1[0] = nomes[0]; p2[0] = nomes[1];
  return Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: p1.join('\n'), pote2: p2.join('\n') });
}

function sortearPotes(v, semente) {
  const rng = Sorteio.rngComSemente(semente);
  const duplas = Sorteio.sortear({ jogadores: v.jogadores, pares: v.pares, usarPotes: true }, rng);
  return { duplas, rng };
}

const ehFav = (v, d) => d.jogadores.some((id) => Sorteio.favorito(v.jogadores.find((j) => j.id === id).nome));

test('nomes: tira linhas vazias, numeração e marcadores', () => {
  assert.deepEqual(Sorteio.nomes('1. Arthur\n2) Rafa\n- Bruno\n\n  • Diego  \r\nLéo'),
    ['Arthur', 'Rafa', 'Bruno', 'Diego', 'Léo']);
  assert.deepEqual(Sorteio.nomes(''), []);
  assert.deepEqual(Sorteio.nomes(null), []);
});

test('validar com potes: o número de duplas vem do tamanho dos potes (qualquer N, inclusive ímpar)', () => {
  for (const n of [4, 5, 7, 8, 11, 16, 25, 32]) {
    const ok = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', n), pote2: lista('B', n) });
    assert.deepEqual(ok.erros, [], 'N=' + n);
    assert.equal(ok.n, n);
    assert.equal(ok.jogadores.length, 2 * n);
    assert.equal(ok.jogadores.filter((j) => j.pote === 1).length, n);
  }
});

test('validar com potes: potes de tamanhos diferentes são recusados, com a contagem de cada um', () => {
  const r = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', 7), pote2: lista('B', 9) });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /mesma quantidade.*pote 1 tem 7.*pote 2 tem 9/);
  assert.equal(Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', 6), pote2: lista('B', 6) }).n, 6);
});

test('validar sem potes e com duplas prontas', () => {
  const ok = Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: lista('J', 10) });
  assert.deepEqual(ok.erros, []);
  assert.equal(ok.n, 5);
  assert.match(Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: lista('J', 9) }).erros[0], /9 jogadores.*quantidade par/);

  const prontas = Sorteio.validar({ modo: 'prontas', duplas: 'Arthur / Matheus\nRafa e Pedro\nCaio + Thiago\nIgor & Felipe\nLéo / Davi' });
  assert.deepEqual(prontas.erros, []);
  assert.equal(prontas.n, 5);
  assert.equal(prontas.pares.length, 5);
  assert.equal(prontas.jogadores[1].nome, 'Matheus');

  const mal = Sorteio.validar({ modo: 'prontas', duplas: 'Arthur\nRafa / Pedro\nA / B\nC / D' });
  assert.match(mal.erros[0], /Linha 1/);
});

test('validar: de 4 a 32 duplas, e nome repetido é recusado', () => {
  assert.match(Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: lista('J', 6) }).erros[0], /4 a 32.*tem 3/);
  assert.match(Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: lista('J', 66) }).erros[0], /4 a 32.*tem 33/);
  assert.deepEqual(Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: lista('J', 64) }).erros, []);
  assert.match(Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: '' }).erros[0], /4 a 32.*tem 0/);
  const r = Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: 'A\nB\nC\nD\nE\nF\nG\nA' });
  assert.match(r.erros.join(' '), /Nome repetido: A/);
  // os limites do sorteio são os mesmos da chave
  assert.equal(Sorteio.MIN_DUPLAS, Chave.MIN_DUPLAS);
  assert.equal(Sorteio.MAX_DUPLAS, Chave.MAX_DUPLAS);
});

test('sortear com potes: toda dupla tem um de cada pote, ninguém repete, seeds de 1 a N', () => {
  for (let s = 1; s <= 200; s++) {
    const v = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', 8), pote2: lista('B', 8) });
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
  const v = Sorteio.validar({ modo: 'avulsos', usarPotes: false, lista: lista('J', 10) });
  const duplas = Sorteio.sortear({ jogadores: v.jogadores, pares: v.pares, usarPotes: false }, Sorteio.rngComSemente(3));
  assert.equal(new Set(duplas.flatMap((d) => d.jogadores)).size, 10);

  const p = Sorteio.validar({ modo: 'prontas', duplas: 'A / B\nC / D\nE / F\nG / H' });
  const res = Sorteio.sortear({ jogadores: p.jogadores, pares: p.pares, usarPotes: false }, Sorteio.rngComSemente(9));
  assert.deepEqual(res.map((d) => d.nome).sort(), ['A / B', 'C / D', 'E / F', 'G / H']);
});

test('a mesma semente dá o mesmo sorteio; sementes diferentes variam', () => {
  const v = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', 8), pote2: lista('B', 8) });
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

// ---------- favoritos: Arthur e Otávio ----------

test('favorito reconhece Arthur e Otávio pelo primeiro nome, sem acento e sem diferenciar maiúsculas', () => {
  for (const nome of ['Arthur', 'arthur', 'ARTHUR Z.', 'Otavio', 'Otávio', ' otávio silva']) assert.ok(Sorteio.favorito(nome), nome);
  for (const nome of ['Artur', 'Arturo', 'Bruno Arthur', 'Octavio', 'Rafa', '']) assert.equal(Sorteio.favorito(nome), null, nome);
});

test('Arthur e Otávio em potes diferentes: viram dupla mais vezes que o acaso (1/8), mas não em todo sorteio', () => {
  const v = potesComFavoritos(8);
  let juntos = 0;
  const N = 4000;
  for (let s = 1; s <= N; s++) {
    const { duplas } = sortearPotes(v, s);
    if (duplas.some((d) => d.nome === 'Arthur / Otávio')) juntos++;
  }
  const taxa = juntos / N;
  // 30% forçado + 1/8 dos 70% restantes ≈ 39%
  assert.ok(taxa > 0.34 && taxa < 0.44, 'taxa de Arthur/Otávio: ' + taxa);
  assert.ok(taxa > 2 * (1 / 8));
  assert.ok(taxa < 0.5);
});

test('com o favoritismo, os sorteios continuam válidos (um de cada pote, ninguém repetido)', () => {
  const v = potesComFavoritos(7);
  for (let s = 1; s <= 300; s++) {
    const { duplas } = sortearPotes(v, s);
    assert.equal(duplas.length, 7);
    const usados = new Set();
    duplas.forEach((d, i) => {
      assert.equal(d.seed, i + 1);
      const poteDe = d.jogadores.map((id) => v.jogadores.find((j) => j.id === id).pote);
      assert.deepEqual(poteDe, [1, 2]);
      d.jogadores.forEach((id) => { assert.ok(!usados.has(id)); usados.add(id); });
    });
    assert.equal(usados.size, 14);
  }
});

test('Arthur e Otávio no mesmo pote, ou só um deles: nada de especial acontece na formação das duplas', () => {
  // no mesmo pote nunca dá para formar a dupla
  const p1 = lista('A', 8).split('\n'); p1[0] = 'Arthur'; p1[1] = 'Otávio';
  const mesmo = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: p1.join('\n'), pote2: lista('B', 8) });
  for (let s = 1; s <= 100; s++) {
    assert.ok(!sortearPotes(mesmo, s).duplas.some((d) => d.nome === 'Arthur / Otávio'));
  }
  // só um deles (Zeca ocupa o lugar de B1): sorteio normal, cada parceiro cai com ele ~1/8 das vezes
  const so = potesComFavoritos(8, ['Arthur', 'Zeca']);
  let comB2 = 0;
  for (let s = 1; s <= 2000; s++) if (sortearPotes(so, s).duplas.some((d) => d.nome === 'Arthur / B2')) comB2++;
  assert.ok(comB2 / 2000 > 0.09 && comB2 / 2000 < 0.16, 'taxa: ' + comB2 / 2000);
});

test('dupla com Arthur ou Otávio nunca é a primeira a sair no sorteio', () => {
  for (const n of [4, 5, 8, 9, 16]) {
    const v = potesComFavoritos(n);
    for (let s = 1; s <= 600; s++) {
      const { duplas, rng } = sortearPotes(v, s);
      const ordem = Sorteio.ordemDeRevelacao(duplas, v.jogadores, rng);
      assert.deepEqual([...ordem].sort((a, b) => a - b), duplas.map((d, i) => i), 'é uma permutação');
      assert.ok(!ehFav(v, duplas[ordem[0]]), 'N=' + n + ' semente ' + s);
    }
  }
});

test('ordem de revelação sem favoritos é uma embaralhada comum (a 1ª carta varia entre todas)', () => {
  const v = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', 6), pote2: lista('B', 6) });
  const primeiros = new Array(6).fill(0);
  for (let s = 1; s <= 3000; s++) {
    const { duplas, rng } = sortearPotes(v, s);
    primeiros[Sorteio.ordemDeRevelacao(duplas, v.jogadores, rng)[0]]++;
  }
  primeiros.forEach((c) => assert.ok(c > 380 && c < 620, 'primeiros: ' + primeiros));
});

// Quem passa direto na 1ª rodada, vendo a chave de verdade.
function duplasComBye(duplas, jogadores) {
  const e = Chave.estadoInicial();
  e.duplas = duplas; e.jogadores = jogadores; e.config.numDuplas = duplas.length;
  Chave.gerarJogos(e);
  return e.jogos.filter((g) => g.fase === 'V-R1' && g.bye)
    .map((g) => (g.duplaA === Chave.BYE ? g.duplaB : g.duplaA));
}

test('número ímpar de duplas: uma dupla com Arthur ou Otávio passa direto para a próxima fase', () => {
  for (const n of [5, 7, 9, 11, 13, 15, 17, 25, 31]) {
    const v = potesComFavoritos(n);
    for (let s = 1; s <= 150; s++) {
      const { duplas } = sortearPotes(v, s);
      const comBye = duplasComBye(duplas, v.jogadores);
      assert.equal(comBye.length, Sorteio.vagasDaChave(n) - n);
      assert.ok(comBye.some((id) => ehFav(v, duplas.find((d) => d.id === id))), 'N=' + n + ' semente ' + s);
    }
  }
});

test('o bye para a favorita também vale com duplas prontas e quando Arthur e Otávio jogam separados', () => {
  const p = Sorteio.validar({ modo: 'prontas', duplas: 'Arthur / Bia\nCau / Dedé\nEdu / Fabi\nGabi / Hugo\nIvo / Otávio\nJana / Kleber\nLia / Mel' });
  assert.equal(p.n, 7);
  for (let s = 1; s <= 200; s++) {
    const duplas = Sorteio.sortear({ jogadores: p.jogadores, pares: p.pares, usarPotes: false }, Sorteio.rngComSemente(s));
    const comBye = duplasComBye(duplas, p.jogadores);
    assert.equal(comBye.length, 1);
    assert.ok(ehFav(p, duplas.find((d) => d.id === comBye[0])), 'semente ' + s);
  }
});

test('número par de duplas: não força bye nenhum; ímpar sem favoritos: sorteio normal', () => {
  const par = potesComFavoritos(8);
  for (let s = 1; s <= 50; s++) assert.deepEqual(duplasComBye(sortearPotes(par, s).duplas, par.jogadores), []);
  const semFav = Sorteio.validar({ modo: 'avulsos', usarPotes: true, pote1: lista('A', 5), pote2: lista('B', 5) });
  for (let s = 1; s <= 50; s++) assert.equal(duplasComBye(sortearPotes(semFav, s).duplas, semFav.jogadores).length, 3);
});

// ---------- arquivo do sorteio (JSON) ----------

function estadoSorteado(n, semente = 5) {
  const v = potesComFavoritos(n);
  const { duplas, rng } = sortearPotes(v, semente);
  const e = Chave.estadoInicial();
  e.config.nome = 'Torneio Teste'; e.config.modo = 'avulsos'; e.config.usarPotes = true; e.config.finalComReset = false;
  e.jogadores = v.jogadores; e.duplas = duplas;
  e.sorteio = { revelados: n, ordem: Sorteio.ordemDeRevelacao(duplas, v.jogadores, rng) };
  return e;
}

test('exportar e importar o sorteio devolve exatamente as mesmas duplas, ordem e configurações', () => {
  for (const n of [4, 5, 9, 16, 32]) {
    const e = estadoSorteado(n, n);
    const arquivo = JSON.parse(JSON.stringify(Sorteio.exportarSorteio(e)));
    assert.equal(arquivo.formato, 'torneio-box-castelandia/sorteio');
    const r = Sorteio.lerSorteio(arquivo);
    assert.deepEqual(r.erros, [], 'N=' + n);
    assert.deepEqual(r.sorteio.duplas, e.duplas);
    assert.deepEqual(r.sorteio.jogadores, e.jogadores);
    assert.deepEqual(r.sorteio.ordem, e.sorteio.ordem);
    assert.equal(r.sorteio.nome, 'Torneio Teste');
    assert.deepEqual(r.sorteio.config, { modo: 'avulsos', usarPotes: true, finalComReset: false });
  }
});

test('importar: duplas fora de ordem no arquivo voltam para a ordem dos cabeças, e a ordem de revelação acompanha', () => {
  const e = estadoSorteado(6, 11);
  const arquivo = JSON.parse(JSON.stringify(Sorteio.exportarSorteio(e)));
  const n = arquivo.duplas.length;
  // inverte as duplas no arquivo e ajusta o índice da ordem de revelação para apontar para o mesmo lugar
  arquivo.duplas.reverse();
  arquivo.ordemRevelacao = arquivo.ordemRevelacao.map((i) => n - 1 - i);
  const r = Sorteio.lerSorteio(arquivo);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.sorteio.duplas, e.duplas);
  assert.deepEqual(r.sorteio.ordem, e.sorteio.ordem);
});

test('importar sem a ordem de revelação usa a ordem dos cabeças', () => {
  const arquivo = JSON.parse(JSON.stringify(Sorteio.exportarSorteio(estadoSorteado(5))));
  delete arquivo.ordemRevelacao;
  assert.deepEqual(Sorteio.lerSorteio(arquivo).sorteio.ordem, [0, 1, 2, 3, 4]);
});

test('importar recusa arquivos que não são um sorteio válido', () => {
  const bom = () => JSON.parse(JSON.stringify(Sorteio.exportarSorteio(estadoSorteado(6, 2))));
  const recusa = (mexer, esperado) => {
    const a = bom(); mexer(a);
    const r = Sorteio.lerSorteio(a);
    assert.equal(r.sorteio, undefined);
    assert.match(r.erros[0], esperado);
  };
  for (const lixo of [null, undefined, 42, 'texto', [], {}]) assert.ok(Sorteio.lerSorteio(lixo).erros.length, String(lixo));
  recusa((a) => { a.formato = 'outro'; }, /não é um sorteio exportado/);
  recusa((a) => { delete a.jogadores; }, /incompleto/);
  recusa((a) => { a.duplas = a.duplas.slice(0, 3); }, /4 a 32.*tem 3/);
  recusa((a) => { a.duplas[1].jogadores[0] = a.duplas[0].jogadores[0]; }, /mais de uma dupla/);
  recusa((a) => { a.duplas[0].jogadores[1] = 'naoexiste'; }, /não está na lista/);
  recusa((a) => { a.duplas[0].jogadores.pop(); }, /dois jogadores/);
  recusa((a) => { a.duplas[1].seed = a.duplas[0].seed; }, /cabeça de chave/);
  recusa((a) => { a.duplas[0].seed = 99; }, /cabeça de chave/);
  recusa((a) => { a.jogadores.push({ id: 'extra', nome: 'Sobrando', pote: 1 }); }, /precisam de 12/);
  recusa((a) => { a.jogadores[1].id = a.jogadores[0].id; }, /inválido ou repetido/);
  recusa((a) => { a.jogadores[0].id = '<img src=x>'; }, /inválido ou repetido/);
  recusa((a) => { a.jogadores[0].nome = '   '; }, /sem nome/);
  recusa((a) => { a.jogadores[0].nome = 'x'.repeat(61); }, /sem nome/);
  recusa((a) => { a.jogadores[1].nome = a.jogadores[0].nome; }, /Nome repetido/);
  recusa((a) => { a.jogadores[0].pote = 3; }, /pote inválido/);
  recusa((a) => { a.ordemRevelacao = [0, 0, 1, 2, 3, 4]; }, /ordem de revelação/);
  recusa((a) => { a.ordemRevelacao = [0, 1, 2]; }, /ordem de revelação/);
  recusa((a) => { a.ordemRevelacao = 'abc'; }, /ordem de revelação/);
});

test('importar não confia na dupla do arquivo: o nome é remontado a partir dos jogadores', () => {
  const a = JSON.parse(JSON.stringify(Sorteio.exportarSorteio(estadoSorteado(5, 8))));
  a.duplas[0].nome = '<script>alert(1)</script>';
  a.duplas[0].id = 'x';
  const r = Sorteio.lerSorteio(a);
  assert.deepEqual(r.erros, []);
  r.sorteio.duplas.forEach((d, i) => {
    assert.equal(d.id, 'd' + (i + 1));
    assert.doesNotMatch(d.nome, /script/);
  });
});
