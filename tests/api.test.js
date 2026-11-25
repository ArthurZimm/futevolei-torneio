const test = require('node:test');
const assert = require('node:assert/strict');

// A senha (Admin123) e o segredo ficam fixos em lib/auth.js; o teste não define nada de ambiente.
delete process.env.ADMIN_PASSWORD; delete process.env.SESSION_SECRET;
delete process.env.VERCEL;
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;

const { criarServidor } = require('../dev-server.js');
const auth = require('../lib/auth.js');
const Chave = require('../js/chave.js');

let servidor, base;
test.before(async () => {
  servidor = criarServidor();
  await new Promise((ok) => servidor.listen(0, ok));
  base = 'http://localhost:' + servidor.address().port;
});
test.after(() => servidor.close());

let ipSeq = 0;
const novoIp = () => '10.0.0.' + (++ipSeq);

async function api(caminho, { metodo = 'GET', corpo, cookie, ip } = {}) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip || novoIp(),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json, setCookie: r.headers.get('set-cookie') };
}

async function entrar() {
  const r = await api('/api/login', { metodo: 'POST', corpo: { senha: 'Admin123' } });
  assert.equal(r.status, 200);
  return r.setCookie.split(';')[0]; // "sessao=..."
}

const estadoDeTeste = (extra = {}) => ({ ...Chave.estadoInicial(), ...extra });

test('GET inicial: ainda não existe torneio', async () => {
  const r = await api('/api/estado');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { mudou: true, versao: 0, estado: null });
});

test('login: senha errada recusada, senha certa devolve cookie httpOnly/SameSite/12h', async () => {
  const ruim = await api('/api/login', { metodo: 'POST', corpo: { senha: 'errada' } });
  assert.equal(ruim.status, 401);
  assert.equal(ruim.setCookie, null);
  assert.equal((await api('/api/login', { metodo: 'POST', corpo: {} })).status, 401);
  assert.equal((await api('/api/login', { metodo: 'POST', corpo: { senha: 123 } })).status, 401);

  const ok = await api('/api/login', { metodo: 'POST', corpo: { senha: 'Admin123' } });
  assert.equal(ok.status, 200);
  assert.match(ok.setCookie, /^sessao=/);
  assert.match(ok.setCookie, /HttpOnly/);
  assert.match(ok.setCookie, /SameSite=Strict/);
  assert.match(ok.setCookie, /Max-Age=43200/);
  assert.doesNotMatch(ok.setCookie, /Secure/); // http local
  assert.doesNotMatch(ok.setCookie, /Admin123/);
});

test('cookie Secure quando a requisição veio por https', async () => {
  const r = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': novoIp() },
    body: JSON.stringify({ senha: 'Admin123' })
  });
  assert.match(r.headers.get('set-cookie'), /; Secure/);
});

test('GET /api/login informa se a sessão é de admin', async () => {
  assert.deepEqual((await api('/api/login')).json, { admin: false });
  const cookie = await entrar();
  assert.deepEqual((await api('/api/login', { cookie })).json, { admin: true });
  assert.deepEqual((await api('/api/login', { cookie: 'sessao=999.abc' })).json, { admin: false });
});

test('POST /api/estado sem login, com cookie falso ou expirado: 401', async () => {
  assert.equal((await api('/api/estado', { metodo: 'POST', corpo: { estado: estadoDeTeste(), versaoBase: 0 } })).status, 401);
  assert.equal((await api('/api/estado', { metodo: 'POST', cookie: 'sessao=9999999999999.assinaturafalsa', corpo: { estado: estadoDeTeste(), versaoBase: 0 } })).status, 401);
  // token válido, mas de 13 horas atrás
  const velho = auth.criarToken(Date.now() - 13 * 3600 * 1000);
  assert.equal(auth.tokenValido(velho), false);
  assert.equal((await api('/api/estado', { metodo: 'POST', cookie: 'sessao=' + encodeURIComponent(velho), corpo: { estado: estadoDeTeste(), versaoBase: 0 } })).status, 401);
  // token trocado (expiração mexida, assinatura antiga)
  const bom = auth.criarToken();
  const adulterado = (Number(bom.split('.')[0]) + 99999999) + '.' + bom.split('.')[1];
  assert.equal(auth.tokenValido(adulterado), false);
});

test('gravar e ler: versão sobe, GET com ?v= igual responde mudou:false', async () => {
  const cookie = await entrar();
  const antes = (await api('/api/estado')).json.versao;
  const r = await api('/api/estado', { metodo: 'POST', cookie, corpo: { estado: estadoDeTeste({ fase: 'sorteio' }), versaoBase: antes } });
  assert.equal(r.status, 200);
  assert.equal(r.json.versao, antes + 1);
  assert.equal(r.json.estado.versao, antes + 1);
  assert.ok(r.json.estado.atualizadoEm);

  const lido = (await api('/api/estado')).json;
  assert.equal(lido.mudou, true);
  assert.equal(lido.estado.fase, 'sorteio');
  assert.equal(lido.versao, antes + 1);

  assert.deepEqual((await api('/api/estado?v=' + (antes + 1))).json, { mudou: false, versao: antes + 1 });
  assert.equal((await api('/api/estado?v=' + antes)).json.mudou, true);
});

test('versão desatualizada: 409 e nada é sobrescrito', async () => {
  const cookie = await entrar();
  const atual = (await api('/api/estado')).json.versao;
  await api('/api/estado', { metodo: 'POST', cookie, corpo: { estado: estadoDeTeste({ fase: 'configJogos' }), versaoBase: atual } });
  const velho = await api('/api/estado', { metodo: 'POST', cookie, corpo: { estado: estadoDeTeste({ fase: 'config' }), versaoBase: atual } });
  assert.equal(velho.status, 409);
  assert.equal(velho.json.versaoAtual, atual + 1);
  assert.equal((await api('/api/estado')).json.estado.fase, 'configJogos');
});

test('dois admins gravando ao mesmo tempo: só um vence (compare-and-set)', async () => {
  const cookie = await entrar();
  const atual = (await api('/api/estado')).json.versao;
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    api('/api/estado', { metodo: 'POST', cookie, corpo: { estado: estadoDeTeste({ fase: 'andamento', nota: i }), versaoBase: atual } })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 7);
  assert.equal((await api('/api/estado')).json.versao, atual + 1);
});

test('corpo inválido: 400', async () => {
  const cookie = await entrar();
  const v = (await api('/api/estado')).json.versao;
  for (const corpo of [{}, { estado: 'x', versaoBase: v }, { estado: { fase: 1 }, versaoBase: v }, { estado: estadoDeTeste(), versaoBase: 'a' }, { estado: estadoDeTeste(), versaoBase: -1 }]) {
    assert.equal((await api('/api/estado', { metodo: 'POST', cookie, corpo })).status, 400, JSON.stringify(corpo).slice(0, 60));
  }
  const cru = await fetch(base + '/api/estado', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{quebrado' });
  assert.equal(cru.status, 400);
});

test('corpo grande demais: 413', async () => {
  const cookie = await entrar();
  const v = (await api('/api/estado')).json.versao;
  const enorme = estadoDeTeste({ lixo: 'x'.repeat(1100 * 1024) });
  assert.equal((await api('/api/estado', { metodo: 'POST', cookie, corpo: { estado: enorme, versaoBase: v } })).status, 413);
});

test('limite de login: 5 tentativas por minuto por IP; outro IP não é afetado', async () => {
  const ip = novoIp();
  for (let i = 1; i <= 5; i++) {
    assert.equal((await api('/api/login', { metodo: 'POST', corpo: { senha: 'errada' }, ip })).status, 401, 'tentativa ' + i);
  }
  const bloqueado = await api('/api/login', { metodo: 'POST', corpo: { senha: 'errada' }, ip });
  assert.equal(bloqueado.status, 429);
  // nem a senha certa passa enquanto estiver bloqueado
  assert.equal((await api('/api/login', { metodo: 'POST', corpo: { senha: 'Admin123' }, ip })).status, 429);
  assert.equal((await api('/api/login', { metodo: 'POST', corpo: { senha: 'Admin123' }, ip: novoIp() })).status, 200);
});

test('logout apaga o cookie', async () => {
  const r = await api('/api/logout', { metodo: 'POST' });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /Max-Age=0/);
  assert.equal((await api('/api/logout')).status, 405);
});

test('métodos não permitidos: 405', async () => {
  assert.equal((await api('/api/estado', { metodo: 'DELETE' })).status, 405);
  assert.equal((await api('/api/login', { metodo: 'PUT' })).status, 405);
});

test('servidor só publica index, admin, css e js (nada de lib, api, tests, package.json)', async () => {
  for (const c of ['/lib/auth.js', '/tests/chave.test.js', '/package.json', '/dev-server.js', '/api/estado.js', '/../package.json', '/docs/superpowers/plans/x.md']) {
    const r = await fetch(base + c);
    assert.equal(r.status, 404, c);
  }
  assert.equal((await fetch(base + '/js/chave.js')).status, 200);
});

test('senha e segredo nunca aparecem em nenhum arquivo servido ao navegador', async () => {
  const fs = require('fs'), path = require('path');
  for (const pasta of ['js', 'css']) {
    for (const f of fs.readdirSync(path.join(__dirname, '..', pasta))) {
      const txt = fs.readFileSync(path.join(__dirname, '..', pasta, f), 'utf8');
      assert.doesNotMatch(txt, /ADMIN_PASSWORD|SESSION_SECRET|Admin123|segredo-de-brincadeira/, pasta + '/' + f);
    }
  }
});

test('só a senha Admin123 entra: errada, parecida, vazia e variável de ambiente são recusadas', async () => {
  process.env.ADMIN_PASSWORD = 'outra-senha'; // variável de ambiente não manda mais nada
  try {
    for (const senha of ['Admin', 'admin123', 'Admin123 ', '', 'outra-senha', 'qualquer coisa']) {
      const r = await api('/api/login', { metodo: 'POST', corpo: { senha }, ip: novoIp() });
      assert.equal(r.status, 401, JSON.stringify(senha));
      assert.equal(r.setCookie, null, JSON.stringify(senha));
    }
    for (const corpo of [{}, { senha: 123 }, { senha: null }, null]) {
      const r = await api('/api/login', { metodo: 'POST', corpo, ip: novoIp() });
      assert.equal(r.status, 401, JSON.stringify(corpo));
    }
    const ok = await api('/api/login', { metodo: 'POST', corpo: { senha: 'Admin123' }, ip: novoIp() });
    assert.equal(ok.status, 200);
  } finally { delete process.env.ADMIN_PASSWORD; }
});
