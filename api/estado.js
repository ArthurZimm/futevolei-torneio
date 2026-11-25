// GET  /api/estado?v=12  público. Devolve o torneio (ou só { mudou: false } se a versão for a mesma).
// POST /api/estado       só admin (cookie). Corpo: { estado, versaoBase }. 409 se a versão guardada mudou.
const { getStore } = require('../lib/store');
const { sessaoValida } = require('../lib/auth');
const { responder, lerJson, LIMITE_BYTES } = require('../lib/http');

function estadoPlausivel(e) {
  return e && typeof e === 'object' && !Array.isArray(e)
    && typeof e.fase === 'string' && e.config && typeof e.config === 'object'
    && Array.isArray(e.jogos) && Array.isArray(e.duplas) && Array.isArray(e.historico);
}

module.exports = async function handler(req, res) {
  try {
    const store = getStore();

    if (req.method === 'GET') {
      const { estado, versao } = await store.ler();
      const conhecida = new URL(req.url, 'http://x').searchParams.get('v');
      if (estado && conhecida !== null && String(versao) === conhecida) return responder(res, 200, { mudou: false, versao });
      return responder(res, 200, { mudou: true, versao, estado });
    }

    if (req.method === 'POST') {
      // A conferência é no servidor: sem cookie válido ninguém grava nada.
      if (!sessaoValida(req)) return responder(res, 401, { erro: 'Sessão expirada. Entre de novo como administrador.' });

      let corpo;
      try { corpo = await lerJson(req); }
      catch (e) { return responder(res, e.status || 400, { erro: e.status === 413 ? 'Torneio grande demais.' : 'JSON inválido.' }); }

      const { estado, versaoBase } = corpo || {};
      if (!estadoPlausivel(estado) || !Number.isInteger(versaoBase) || versaoBase < 0) {
        return responder(res, 400, { erro: 'Dados do torneio inválidos.' });
      }
      estado.versao = versaoBase + 1;
      estado.atualizadoEm = new Date().toISOString();
      if (JSON.stringify(estado).length > LIMITE_BYTES) return responder(res, 413, { erro: 'Torneio grande demais.' });

      const r = await store.gravar(estado, versaoBase);
      if (!r.ok) {
        return responder(res, 409, { erro: 'Outro aparelho alterou o torneio. Recarregue a página.', versaoAtual: r.versaoAtual });
      }
      return responder(res, 200, { versao: r.versao, estado });
    }

    res.setHeader('Allow', 'GET, POST');
    return responder(res, 405, { erro: 'Método não permitido.' });
  } catch (e) {
    console.error('[api/estado]', e);
    return responder(res, 500, { erro: 'Erro no servidor: ' + e.message });
  }
};
