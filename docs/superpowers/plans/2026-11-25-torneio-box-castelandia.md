# Torneio Box Castelândia — Plano de implementação

> Execução inline, tarefa por tarefa, com teste ao fim de cada uma. A pasta não é repositório git, então não há etapa de commit.

**Goal:** site de torneio de futevôlei com sorteio de duplas e chave de dupla eliminação (vencedores/perdedores), público para visitantes e editável só pelo admin.

**Architecture:** front estático (HTML/CSS/JS puro + Bootstrap 5.3 escuro via CDN) e 3 Vercel Functions em `/api`. O torneio inteiro é um único JSON (`estado`) guardado no Upstash Redis (chave `torneio`). Toda a lógica da chave é pura (`js/chave.js`, sem DOM) e roda igual no navegador e no Node (testes). O estado dos jogos é derivado: `historico` (lista de ações) + chave gerada; "desfazer" remove a última ação e reaplica o resto.

**Tech Stack:** HTML, CSS, JS, Bootstrap 5.3, Node 24 (testes e servidor de desenvolvimento), `@upstash/redis`.

**Spec:** prompt "Prompt — Site do Torneio Box Castelândia" (https://claude.ai/artifact/A3GgVmmBiMhAsXE6bbRSZ9) e wireframe (https://claude.ai/artifact/87amfvomutL1vi2hK7og6r).

## Global Constraints

- Tema escuro Bootstrap 5.3 (`data-bs-theme="dark"`); cores `--fundo #0B0D10`, `--card #15181D`, `--card-2 #1D2128`, `--borda #2A2F38`, `--texto #F2F4F7`, `--texto-2 #9AA3AF`, `--destaque #D7FF3F`, `--perdedores #FF9A8F`.
- Fontes Space Grotesk (títulos e placares) e Inter (texto). Alvos de toque ≥ 44 px. Mobile-first.
- Duplas sempre pelo nome dos jogadores ("Arthur / Matheus").
- Chave para N de 4 a 16 duplas; jogos reais = 2N − 2, +1 se o reset for disputado.
- Senha só no servidor (`ADMIN_PASSWORD`); cookie `httpOnly`, assinado com `SESSION_SECRET`, 12 h; 5 tentativas de login por minuto por IP; `POST /api/estado` exige cookie e confere `versao` (409 se desatualizado).
- Formato por fase: pontos 15/18, MD1/MD3/MD5, set decisivo 11/15/igual; trava ao iniciar o torneio.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `js/chave.js` | lógica pura: gerar chave, byes, lançar set/vencedor/WO, desfazer, fila, classificação |
| `js/sorteio.js` | ler jogadores/duplas, sortear duplas com ou sem potes, RNG com semente |
| `js/estado.js` | carregar/salvar (API ou localStorage), sessão do admin, polling |
| `js/ui.js` | componentes e telas públicas (início, sorteio, chave, jogos, classificação) |
| `js/publico.js` | roteamento e atualização automática do `index.html` |
| `js/admin.js` | login, configuração, sorteio, configurar jogos, placar, manutenção |
| `css/app.css` | variáveis e ajustes mínimos sobre o Bootstrap |
| `lib/store.js`, `lib/auth.js`, `lib/http.js` | Upstash (ou memória em dev), cookie assinado e helpers de resposta (ficam em `lib/` para a Vercel não publicá-los como rotas) |
| `api/estado.js`, `login.js`, `logout.js` | Vercel Functions |
| `dev-server.js` | servidor local: estáticos + `/api` (store em memória) |
| `tests/*.test.js` | testes Node (`node --test`) |
| `DEPLOY.md` | passo a passo da Vercel |

## Tarefas

### 1. `js/chave.js` + `tests/chave.test.js`
- **Produz:** `Chave.estadoInicial()`, `Chave.fasesDaChave(n)`, `Chave.ATALHOS`, `Chave.formatosDoAtalho(n, atalho)`, `Chave.totalJogos(n)`, `Chave.gerarJogos(estado)`, `Chave.iniciarTorneio(estado)`, `Chave.registrarSet(estado, id, a, b)`, `Chave.registrarParcial(estado, id, a, b)`, `Chave.registrarVencedor(estado, id, vencedorId, placar)`, `Chave.registrarWO(estado, id, faltouId)`, `Chave.desfazer(estado)`, `Chave.fila(estado)`, `Chave.jogoEmQuadra(estado)`, `Chave.moverNaFila(estado, id, dir)`, `Chave.classificacao(estado)`, `Chave.campeao(estado)`, `Chave.progresso(estado)`, `Chave.derrotas(estado, duplaId)`, `Chave.placarExibicao(jogo)`, `Chave.alvoDoSet(jogo)`, `Chave.nomeDupla(estado, id)`.
- **Testes:** N de 4 a 16 — nº de jogos (2N−2, +1 reset), ninguém some com 1 derrota, simulação aleatória (reset ligado/desligado, MD1/MD3/MD5, WO), desfazer em todos os passos, classificação completa, fila respeitando dependências.

### 2. `js/sorteio.js` + `tests/sorteio.test.js`
- **Produz:** `Sorteio.parseJogadores(texto)`, `Sorteio.parseDuplasProntas(texto)`, `Sorteio.sortearDuplas({jogadores, usarPotes, rng})`, `Sorteio.rngComSemente(n)`, `Sorteio.validar(...)`.

### 3. `css/app.css`, `js/ui.js`, `js/estado.js`, `index.html`, `js/publico.js`
- Telas públicas do wireframe, com a chave geral desenhada em SVG, testadas no navegador com um torneio de exemplo.

### 4. `admin.html`, `js/admin.js`
- Login → configuração → sorteio (cartas) → configurar jogos → iniciar → placar (em pé, deitado, só resultado final, WO, desfazer, fila) → manutenção.

### 5. `api/*`, `dev-server.js`, `tests/api.test.js`
- Login com limite de tentativas, cookie assinado, `GET/POST /api/estado` com compare-and-set atômico (Lua no Upstash).

### 6. `DEPLOY.md` e teste de ponta a ponta no navegador (visitante e admin em abas diferentes).
