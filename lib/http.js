// Ajudantes para as funções em /api, só com o que o Node já tem (funcionam na Vercel e no servidor local).

function responder(res, status, corpo, cabecalhos) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(cabecalhos || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(corpo));
}

const LIMITE_BYTES = 1024 * 1024; // 1 MB: o torneio inteiro cabe com folga

// Na Vercel o corpo JSON já vem em req.body; no servidor local lemos o stream.
async function lerJson(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const partes = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > LIMITE_BYTES) throw Object.assign(new Error('Corpo grande demais.'), { status: 413 });
    partes.push(p);
  }
  const texto = Buffer.concat(partes).toString('utf8');
  return texto ? JSON.parse(texto) : {};
}

module.exports = { responder, lerJson, LIMITE_BYTES };
