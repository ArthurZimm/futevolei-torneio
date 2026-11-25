const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'js', 'estado.js'), 'utf8');

// Carrega js/estado.js num "navegador" de mentira. `resposta` diz o que o fetch devolve.
function navegador({ hostname, protocol = 'https:', resposta }) {
  const registro = { removidos: [], cachesApagados: [], replace: null, sessionLimpo: false };
  const respostaFetch = () => {
    if (resposta === 'rede') return Promise.reject(new Error('offline'));
    return Promise.resolve({
      status: resposta.status,
      json: () => (resposta.corpo === undefined ? Promise.reject(new Error('não é JSON')) : Promise.resolve(resposta.corpo))
    });
  };
  const win = {
    location: { hostname, protocol, pathname: '/admin', hash: '#/x', replace: (u) => { registro.replace = u; } },
    localStorage: { removeItem: (k) => registro.removidos.push(k), getItem: () => null },
    sessionStorage: { clear: () => { registro.sessionLimpo = true; } },
    caches: { keys: async () => ['a', 'b'], delete: async (k) => { registro.cachesApagados.push(k); return true; } },
    navigator: {},
    Chave: { estadoInicial: () => ({}) },
    document: {}
  };
  vm.runInNewContext(codigo, { window: win, fetch: respostaFetch });
  return { Estado: win.Estado, registro };
}

test('site publicado: API com erro NÃO cai no modo local (que não tem senha)', async () => {
  const { Estado } = navegador({ hostname: 'torneio.vercel.app', resposta: { status: 500, corpo: { erro: 'Erro no servidor: banco fora' } } });
  await assert.rejects(Estado.iniciar(), (e) => e.codigo === 'servidor' && /banco fora/.test(e.message));
  assert.equal(Estado.modo, null);
});

test('site publicado: resposta que não é JSON (ex.: 404 da hospedagem) também é erro, não modo local', async () => {
  const { Estado } = navegador({ hostname: 'torneio.vercel.app', resposta: { status: 404 } });
  await assert.rejects(Estado.iniciar(), (e) => e.codigo === 'servidor' && /404/.test(e.message));
  assert.equal(Estado.modo, null);
});

test('site publicado: sem rede é erro, não modo local', async () => {
  const { Estado } = navegador({ hostname: 'torneio.vercel.app', resposta: 'rede' });
  await assert.rejects(Estado.iniciar(), (e) => e.codigo === 'rede');
  assert.equal(Estado.modo, null);
});

test('site publicado: API respondendo certo vira modo api', async () => {
  const { Estado } = navegador({ hostname: 'torneio.vercel.app', resposta: { status: 200, corpo: { mudou: true, versao: 1, estado: null } } });
  assert.equal(await Estado.iniciar(), 'api');
});

test('na máquina de desenvolvimento, sem API, vira modo local', async () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'torneio.localhost']) {
    const { Estado } = navegador({ hostname, protocol: 'http:', resposta: { status: 404 } });
    assert.equal(await Estado.iniciar(), 'local', hostname);
  }
  const { Estado } = navegador({ hostname: '', protocol: 'file:', resposta: 'rede' });
  assert.equal(await Estado.iniciar(), 'local');
});

test('limparCache apaga o armazenamento local, os caches e recarrega com endereço novo', async () => {
  const { Estado, registro } = navegador({ hostname: 'torneio.vercel.app', resposta: { status: 200, corpo: { mudou: true } } });
  await Estado.limparCache();
  assert.deepEqual(registro.removidos, ['torneio-box-castelandia']);
  assert.equal(registro.sessionLimpo, true);
  assert.deepEqual(registro.cachesApagados, ['a', 'b']);
  assert.match(registro.replace, /^\/admin\?limpo=\d+#\/x$/);
});
