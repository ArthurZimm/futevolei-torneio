/*
 * Sessão do administrador: cookie httpOnly assinado com HMAC, válido por 12 h.
 * A senha só existe no servidor, nunca no JavaScript do navegador.
 *
 * ATENÇÃO: por ser um torneio de brincadeira, a senha e o segredo ficam fixos aqui no código,
 * sem variáveis de ambiente. Quem lê o repositório vê a senha. Para algo sério, tire daqui.
 */
const crypto = require('crypto');

const DURACAO_MS = 12 * 60 * 60 * 1000;
const NOME_COOKIE = 'sessao';
const SENHA_ADMIN = 'Admin123';
const SEGREDO_DA_SESSAO = 'torneio-box-castelandia-segredo-de-brincadeira';

function segredo() {
  return SEGREDO_DA_SESSAO;
}

function assinar(valor) {
  return crypto.createHmac('sha256', segredo()).update(valor).digest('base64url');
}

function iguais(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function criarToken(agora = Date.now()) {
  const expira = String(agora + DURACAO_MS);
  return expira + '.' + assinar(expira);
}

function tokenValido(token, agora = Date.now()) {
  if (typeof token !== 'string') return false;
  const i = token.indexOf('.');
  if (i < 1) return false;
  const expira = token.slice(0, i), assinatura = token.slice(i + 1);
  if (!iguais(assinatura, assinar(expira))) return false;
  return Number(expira) > agora;
}

// Compara pelos hashes, para o tempo da comparação não revelar nada da senha.
function senhaCorreta(tentativa) {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return typeof tentativa === 'string' && crypto.timingSafeEqual(h(tentativa), h(SENHA_ADMIN));
}

function lerCookie(req, nome) {
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function sessaoValida(req) {
  return tokenValido(lerCookie(req, NOME_COOKIE));
}

// "Secure" só vale em https (na Vercel sempre); no teste local por http fica de fora.
function cookieDeSessao(req, token, maxAgeSeg = DURACAO_MS / 1000) {
  const https = req.headers['x-forwarded-proto'] === 'https' || !!process.env.VERCEL;
  return `${NOME_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeg}` + (https ? '; Secure' : '');
}

function ipDoCliente(req) {
  const f = req.headers['x-forwarded-for'];
  if (f) return String(f).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

module.exports = { criarToken, tokenValido, senhaCorreta, sessaoValida, cookieDeSessao, ipDoCliente, DURACAO_MS };
