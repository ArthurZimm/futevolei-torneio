/*
 * Onde o torneio fica guardado: Upstash Redis na Vercel, memória no desenvolvimento local.
 * O torneio inteiro é UM registro JSON (chave "torneio"); o número da versão fica numa chave
 * separada para dar para conferir e gravar de forma atômica (compare-and-set em Lua).
 */
const CHAVE = 'torneio';
const CHAVE_VERSAO = 'torneio:versao';

// Grava só se a versão guardada for a que o admin tinha. Devolve a nova versão, ou -1 se mudou.
const SCRIPT_CAS = `
local atual = tonumber(redis.call('GET', KEYS[2]) or '0')
if atual ~= tonumber(ARGV[1]) then return -1 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(atual + 1))
return atual + 1
`;

function criarStoreUpstash(url, token) {
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url, token });
  return {
    tipo: 'upstash',
    async ler() {
      const [bruto, versao] = await Promise.all([redis.get(CHAVE), redis.get(CHAVE_VERSAO)]);
      // o cliente do Upstash já devolve o JSON como objeto
      const estado = typeof bruto === 'string' ? JSON.parse(bruto) : (bruto || null);
      return { estado, versao: Number(versao || 0) };
    },
    async gravar(estado, versaoBase) {
      const r = await redis.eval(SCRIPT_CAS, [CHAVE, CHAVE_VERSAO], [String(versaoBase), JSON.stringify(estado)]);
      if (Number(r) === -1) return { ok: false, versaoAtual: (await this.ler()).versao };
      return { ok: true, versao: Number(r) };
    },
    async contar(chave, janelaSeg) {
      const n = await redis.incr(chave);
      if (n === 1) await redis.expire(chave, janelaSeg);
      return n;
    }
  };
}

function criarStoreMemoria() {
  let estado = null, versao = 0;
  const contadores = new Map();
  return {
    tipo: 'memoria',
    async ler() { return { estado: estado ? JSON.parse(JSON.stringify(estado)) : null, versao }; },
    async gravar(novo, versaoBase) {
      if (versaoBase !== versao) return { ok: false, versaoAtual: versao };
      estado = JSON.parse(JSON.stringify(novo));
      versao += 1;
      return { ok: true, versao };
    },
    async contar(chave, janelaSeg) {
      const agora = Date.now(), c = contadores.get(chave);
      if (!c || c.expira < agora) { contadores.set(chave, { n: 1, expira: agora + janelaSeg * 1000 }); return 1; }
      c.n += 1;
      return c.n;
    }
  };
}

let instancia = null;
function getStore() {
  if (instancia) return instancia;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) instancia = criarStoreUpstash(url, token);
  else if (process.env.VERCEL) throw new Error('Upstash Redis não está ligado ao projeto (faltam as variáveis de ambiente).');
  else instancia = criarStoreMemoria();
  return instancia;
}

// Só para testes: força um store específico (ou zera para recriar).
function _definirStore(s) { instancia = s; }

module.exports = { getStore, criarStoreMemoria, _definirStore };
