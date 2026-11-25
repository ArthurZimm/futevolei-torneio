// POST /api/logout -> apaga o cookie de sessão.
const { cookieDeSessao } = require('../lib/auth');
const { responder } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return responder(res, 405, { erro: 'Método não permitido.' });
  }
  return responder(res, 200, { ok: true }, { 'Set-Cookie': cookieDeSessao(req, '', 0) });
};
