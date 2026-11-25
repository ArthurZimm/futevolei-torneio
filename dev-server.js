/*
 * Servidor local para desenvolver e testar: serve os arquivos estáticos e monta /api/* com os
 * mesmos handlers da Vercel (guardando o torneio em memória, a menos que o Upstash esteja configurado).
 *   npm run dev   ->  http://localhost:3000
 * Sem as variáveis de ambiente, usa ADMIN_PASSWORD=admin e SESSION_SECRET de desenvolvimento.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
const ROTAS_API = {
  '/api/estado': () => require('./api/estado'),
  '/api/login': () => require('./api/login'),
  '/api/logout': () => require('./api/logout')
};
// Só estes caminhos são públicos (como na Vercel, onde só vai o que está no projeto, sem tests/ nem lib/).
const PUBLICOS = /^\/(index\.html|admin\.html|css\/|js\/|favicon\.svg)/;

function criarServidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let caminho = decodeURIComponent(url.pathname);

    if (ROTAS_API[caminho]) {
      try { return await ROTAS_API[caminho]()(req, res); }
      catch (e) { res.statusCode = 500; return res.end(String(e)); }
    }
    if (caminho === '/') caminho = '/index.html';
    if (caminho === '/admin') caminho = '/admin.html';
    const arquivo = path.join(RAIZ, caminho);
    if (!arquivo.startsWith(RAIZ) || !PUBLICOS.test(caminho)) { res.statusCode = 404; return res.end('Não encontrado'); }
    fs.readFile(arquivo, (err, dados) => {
      if (err) { res.statusCode = 404; return res.end('Não encontrado'); }
      res.setHeader('Content-Type', TIPOS[path.extname(arquivo)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(dados);
    });
  });
}

if (require.main === module) {
  if (!process.env.ADMIN_PASSWORD) { process.env.ADMIN_PASSWORD = 'admin'; console.log('Senha do admin (desenvolvimento): admin'); }
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'segredo-de-desenvolvimento';
  const porta = Number(process.env.PORT || 3000);
  criarServidor().listen(porta, () => console.log(`Servidor local em http://localhost:${porta}  (admin: /admin)`));
}

module.exports = { criarServidor };
