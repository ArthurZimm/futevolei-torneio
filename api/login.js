// POST /api/login  { senha } -> cookie de sessão. No máximo 5 tentativas por minuto por IP.
// GET  /api/login  -> { admin: true|false } (o navegador não consegue ler o cookie httpOnly)
const { getStore } = require('../lib/store');
const { criarToken, senhaCorreta, sessaoValida, cookieDeSessao, ipDoCliente } = require('../lib/auth');
const { responder, lerJson } = require('../lib/http');

const TENTATIVAS_POR_MINUTO = 5;

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return responder(res, 200, { admin: sessaoValida(req) });

    if (req.method === 'POST') {
      const tentativas = await getStore().contar('login:' + ipDoCliente(req), 60);
      if (tentativas > TENTATIVAS_POR_MINUTO) {
        return responder(res, 429, { erro: 'Muitas tentativas. Espere um minuto e tente de novo.' }, { 'Retry-After': '60' });
      }
      let corpo;
      try { corpo = await lerJson(req); } catch (e) { return responder(res, 400, { erro: 'JSON inválido.' }); }
      if (!senhaCorreta(corpo && corpo.senha)) return responder(res, 401, { erro: 'Senha incorreta.' });
      return responder(res, 200, { ok: true }, { 'Set-Cookie': cookieDeSessao(req, criarToken()) });
    }

    res.setHeader('Allow', 'GET, POST');
    return responder(res, 405, { erro: 'Método não permitido.' });
  } catch (e) {
    console.error('[api/login]', e);
    return responder(res, 500, { erro: 'Erro no servidor: ' + e.message });
  }
};
