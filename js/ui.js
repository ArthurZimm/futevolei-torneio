/*
 * Componentes visuais e telas públicas. Tudo devolve HTML (string); quem chama coloca na página.
 * Todo texto vindo do usuário (nomes) passa por UI.esc.
 */
(function (root) {
  'use strict';
  var Chave = root.Chave;
  var UI = {};

  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var esc = UI.esc;

  function svg(caminho, tam) {
    return '<svg width="' + (tam || 22) + '" height="' + (tam || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + caminho + '</svg>';
  }
  UI.icone = {
    casa: function () { return svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'); },
    chave: function () { return svg('<path d="M4 5h5v6H4M4 13h5v6H4M9 8h3v8H9M12 12h8"/>'); },
    lista: function () { return svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'); },
    trofeu: function (t) { return svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>', t); },
    dados: function () { return svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/>'); },
    cadeado: function (t) { return svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', t || 16); },
    voltar: function () { return svg('<path d="M15 6l-6 6 6 6"/>', 18); },
    cima: function () { return svg('<path d="M6 15l6-6 6 6"/>', 16); },
    baixo: function () { return svg('<path d="M6 9l6 6 6-6"/>', 16); },
    play: function () { return svg('<path d="M7 4v16l13-8z" fill="currentColor"/>', 18); }
  };

  // ---------- Textos dos jogos ----------

  function formatoDoJogo(estado, g) {
    var f = g.formato || (estado.config.formatos && estado.config.formatos[g.fase]) || null;
    return f ? { pontos: f.pontos, md: f.md } : null;
  }
  UI.formatoDoJogo = formatoDoJogo;

  // "15" (MD1) ou "18 · MD3"
  UI.formatoCurto = function (estado, g) {
    var f = formatoDoJogo(estado, g);
    if (!f) return '';
    return f.md > 1 ? f.pontos + ' · MD' + f.md : String(f.pontos);
  };

  UI.tituloFase = function (estado, g) {
    if (g.id === 'GF2') return 'Reset';
    if (g.id === 'GF') return 'Grande final';
    if (g.fase === 'V-F') return 'Final dos vencedores';
    if (g.fase === 'P-F') return 'Final dos perdedores';
    if (g.chave === 'V') {
      var R = Math.log2(Chave.tamanhoDaChave(estado.duplas.length));
      return 'Vencedores · ' + (g.rodada === R - 1 ? 'semifinal' : 'R' + g.rodada);
    }
    return 'Perdedores · R' + g.rodada;
  };

  UI.descricaoJogo = function (estado, g) {
    var f = formatoDoJogo(estado, g);
    return UI.tituloFase(estado, g) + (f ? ' · até ' + f.pontos + (f.md > 1 ? ' · MD' + f.md : '') : '');
  };

  // Posições na fila só dos jogos prontos: 0 = em quadra agora, 1 = próximo...
  UI.contexto = function (estado) {
    var fila = Chave.fila(estado);
    var prontos = fila.filter(function (g) { return g.status === 'pronto' || g.status === 'emQuadra'; });
    var pos = {};
    prontos.forEach(function (g, i) { pos[g.id] = i; });
    var emQuadra = Chave.jogoEmQuadra(estado);
    return { fila: fila, prontos: prontos, pos: pos, emQuadra: emQuadra, emQuadraId: emQuadra ? emQuadra.id : null };
  };

  function statusCurto(g, ctx) {
    if (g.status === 'finalizado') return 'fim';
    if (g.status === 'wo') return 'WO';
    if (g.status === 'bye') return 'bye';
    if (g.status === 'dispensado') return 'não precisou';
    if (g.id === 'GF2' && g.status === 'aguardando') return 'se necessário';
    if (g.id === ctx.emQuadraId) return 'em quadra';
    if (g.status === 'pronto' || g.status === 'emQuadra') return ctx.pos[g.id] + 'º na fila';
    return g.bye ? 'bye' : 'aguardando';
  }
  UI.statusCurto = statusCurto;

  function linhaCard(estado, g, lado) {
    var id = g['dupla' + lado];
    var nome = Chave.rotuloDoSlot(estado, g, lado);
    var terminou = g.status === 'finalizado' || g.status === 'wo' || g.status === 'bye';
    var cls = '';
    if (!id || id === Chave.BYE) cls = 'indef';
    else if (terminou) cls = g.vencedor === id ? 'venceu' : 'perdeu';
    var p = Chave.placarExibicao(g), pt = '–';
    var valor = lado === 'A' ? p.a : p.b;
    if (valor != null) pt = valor;
    else if (g.status === 'finalizado' && g.vencedor === id) pt = 'V';
    if (g.status === 'wo' && g.perdedor === id) pt = 'WO';
    return '<div class="jogo-linha ' + cls + '"><span class="nome">' + esc(nome) + '</span><span class="pt">' + esc(pt) + '</span></div>';
  }

  // Card de um jogo (clicável: abre o detalhe com os sets).
  UI.cardJogo = function (estado, g, ctx, extraStyle) {
    var fmt = UI.formatoCurto(estado, g);
    var vivo = g.id === ctx.emQuadraId;
    var cls = 'jogo jogo-grade' + (vivo ? ' ao-vivo' : '') + (g.status === 'dispensado' ? ' dispensado' : '') + (g.bye ? ' bye' : '');
    return '<button type="button" class="' + cls + '" data-jogo="' + g.id + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
      '<span class="jogo-cab"><span class="id">' + g.id + '</span><span>' + esc(fmt ? fmt + ' · ' : '') + statusCurto(g, ctx) + '</span></span>' +
      linhaCard(estado, g, 'A') + linhaCard(estado, g, 'B') + '</button>';
  };

  // Conteúdo do diálogo com os detalhes de um jogo.
  UI.detalheJogo = function (estado, g) {
    var ctx = UI.contexto(estado);
    var a = Chave.rotuloDoSlot(estado, g, 'A'), b = Chave.rotuloDoSlot(estado, g, 'B');
    var p = Chave.placarExibicao(g);
    var linhas = '';
    if (g.sets.length) {
      linhas = g.sets.map(function (s, i) {
        return '<div class="d-flex justify-content-between py-1 border-bottom" style="border-color:var(--linha)!important"><span class="texto-2">Set ' + (i + 1) + '</span><span class="titulo">' + s.a + ' × ' + s.b + '</span></div>';
      }).join('');
    }
    var resumo;
    if (g.status === 'finalizado' || g.status === 'wo') {
      resumo = '<div class="mt-3"><span class="rotulo">Vencedor</span><div class="titulo fs-5 destaque">' + esc(Chave.nomeDupla(estado, g.vencedor)) + '</div>' +
        (g.status === 'wo' ? '<div class="texto-2 small">WO: ' + esc(Chave.nomeDupla(estado, g.perdedor)) + ' não compareceu.</div>' : '') + '</div>';
    } else {
      resumo = '<div class="mt-3 texto-2">' + (g.id === ctx.emQuadraId && estado.fase === 'andamento' ? 'Em quadra agora.' : (statusCurto(g, ctx) === 'aguardando' ? 'Aguardando as duplas.' : esc(statusCurto(g, ctx)) + '.')) + '</div>';
    }
    if (p.tipo === 'sets' && p.a != null && g.status !== 'finalizado' && g.status !== 'wo') {
      resumo += '<div class="texto-2 small">Sets ganhos: ' + p.a + ' × ' + p.b + '</div>';
    }
    return '<div class="d-flex justify-content-between align-items-start gap-3">' +
      '<div><div class="rotulo">' + g.id + '</div><div class="titulo fs-5">' + esc(UI.tituloFase(estado, g)) + '</div>' +
      '<div class="texto-2 small">' + esc(UI.descricaoJogo(estado, g).replace(UI.tituloFase(estado, g), '').replace(/^ · /, '')) + '</div></div>' +
      '<button type="button" class="btn-mini" data-fechar aria-label="Fechar">✕</button></div>' +
      '<div class="mt-3 d-flex flex-column gap-1"><div class="fs-6 fw-semibold">' + esc(a) + '</div><div class="texto-2 small">contra</div><div class="fs-6 fw-semibold">' + esc(b) + '</div></div>' +
      (linhas ? '<div class="mt-3">' + linhas + '</div>' : '') + resumo;
  };

  // ---------- Peças de tela ----------

  UI.cabecalho = function (estado, opcoes) {
    opcoes = opcoes || {};
    var entrar = opcoes.semAdmin ? '' :
      '<a class="pilula" href="admin.html" aria-label="Entrar como administrador">' + UI.icone.cadeado() + 'Admin</a>';
    return '<header class="topo"><div class="d-flex flex-column"><span class="sobre">Torneio</span>' +
      '<span class="nome">' + esc(estado.config.nome.replace(/^Torneio\s+/i, '')) + '</span></div>' + entrar + '</header>';
  };

  UI.navInferior = function (rota) {
    var itens = [['inicio', 'Início', 'casa'], ['sorteio', 'Sorteio', 'dados'], ['chave', 'Chave', 'chave'], ['jogos', 'Jogos', 'lista'], ['podio', 'Pódio', 'trofeu']];
    return '<nav class="nav-inferior" aria-label="Navegação">' + itens.map(function (i) {
      return '<a href="#/' + i[0] + '"' + (rota === i[0] ? ' class="on" aria-current="page"' : '') + '>' + UI.icone[i[2]]() + i[1] + '</a>';
    }).join('') + '</nav>';
  };

  UI.vazio = function (titulo, texto) {
    return '<div class="cartao p-4 text-center my-3"><div class="titulo fs-5 mb-1">' + esc(titulo) + '</div><div class="texto-2">' + esc(texto) + '</div></div>';
  };

  function nomesPartidos(estado, id) { return esc(Chave.nomeDupla(estado, id)); }

  function seloChave(g) {
    var c = g.chave === 'V' ? 'selo-v' : (g.chave === 'P' ? 'selo-p' : 'selo-gf');
    var t = g.chave === 'GF' ? 'GF' : g.chave;
    return '<span class="selo ' + c + '">' + t + '</span>';
  }

  // Texto de rodapé do jogo em quadra
  function avisoDoJogo(estado, g) {
    if (g.id === 'GF2') return 'Jogo decisivo: quem vencer é campeão';
    if (g.id === 'GF') return estado.config.finalComReset ? 'Se a dupla de baixo vencer, tem um jogo extra (reset)' : 'Quem vencer é campeão';
    if (g.fase === 'V-F') return 'Quem perder vai para a final dos perdedores';
    if (g.chave === 'V') return 'Quem perder cai para a chave dos perdedores';
    return 'Quem perder está eliminado';
  }

  function placarAoVivo(estado, g) {
    var p = Chave.placarExibicao(g);
    var a = p.a == null ? 0 : p.a, b = p.b == null ? 0 : p.b;
    var extra = '';
    if (p.tipo === 'sets') {
      var numero = g.sets.length + 1, parcial = g.parcial ? g.parcial.a + ' × ' + g.parcial.b : '0 × 0';
      extra = '<div class="texto-2 small text-center mt-1">Set ' + numero + ' · ' + parcial +
        (g.sets.length ? ' · ' + g.sets.map(function (s) { return s.a + '–' + s.b; }).join(', ') : '') + '</div>';
    }
    return '<div><div class="placar-grande"><span class="n' + (a > b ? ' lider' : '') + '">' + a + '</span><span class="x">×</span><span class="n' + (b > a ? ' lider' : '') + '">' + b + '</span></div>' + extra + '</div>';
  }

  // ---------- Início ----------

  UI.viewInicio = function (estado) {
    var h = UI.cabecalho(estado) + '<main class="d-flex flex-column gap-3">';
    var ctx = UI.contexto(estado);

    if (estado.fase === 'config' || estado.fase === 'sorteio') {
      h += UI.vazio('O torneio ainda não começou', 'O sorteio das duplas vai acontecer em breve. Esta página atualiza sozinha.');
    } else if (estado.fase === 'configJogos') {
      h += UI.vazio('Sorteio feito!', 'As duplas e a chave já estão definidas. Falta o administrador iniciar o torneio.') +
        '<a class="btn btn-sec" href="#/sorteio">Ver as duplas sorteadas</a><a class="btn btn-sec" href="#/chave">Ver a chave</a>';
    } else {
      var pr = Chave.progresso(estado);
      var campeao = Chave.campeao(estado);
      var pct = pr.total ? Math.round(pr.feitos * 100 / pr.total) : 0;
      h += '<div><div class="d-flex justify-content-between small texto-2 mb-2"><span>' +
        (campeao ? 'Torneio encerrado' : 'Jogo ' + Math.min(pr.feitos + 1, pr.total) + ' de ' + pr.total) + '</span><span>' +
        estado.duplas.length + ' duplas · dupla eliminação</span></div>' +
        '<div class="barra" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><div style="width:' + pct + '%"></div></div></div>';

      if (campeao) {
        h += '<section class="cartao cartao-ao-vivo text-center"><div class="destaque mb-1">' + UI.icone.trofeu(32) + '</div>' +
          '<div class="rotulo destaque">Campeões</div><div class="titulo fs-3">' + nomesPartidos(estado, campeao) + '</div></section>' +
          '<a class="btn btn-destaque d-flex align-items-center justify-content-center" href="#/podio">Ver classificação final</a>';
      } else if (ctx.emQuadra) {
        var g = ctx.emQuadra;
        h += '<section class="cartao cartao-ao-vivo d-flex flex-column gap-3" aria-label="Jogo em quadra">' +
          '<div class="d-flex justify-content-between align-items-center"><span class="rotulo destaque"><span class="ponto-vivo"></span>Em quadra agora</span>' +
          '<span class="small texto-2">' + esc(UI.descricaoJogo(estado, g)) + '</span></div>' +
          '<div class="row g-2 align-items-center text-center"><div class="col-4 d-flex flex-column gap-1"><span class="fw-semibold">' + nomesPartidos(estado, g.duplaA) + '</span>' +
          '<span class="small texto-2">' + derrotasTexto(estado, g.duplaA) + '</span></div>' +
          '<div class="col-4">' + placarAoVivo(estado, g) + '</div>' +
          '<div class="col-4 d-flex flex-column gap-1"><span class="fw-semibold">' + nomesPartidos(estado, g.duplaB) + '</span>' +
          '<span class="small texto-2">' + derrotasTexto(estado, g.duplaB) + '</span></div></div>' +
          '<p class="small texto-2 text-center mb-0">' + esc(avisoDoJogo(estado, g)) + '</p></section>';
      }

      var proximos = ctx.fila.filter(function (g) { return g !== ctx.emQuadra; }).slice(0, 3);
      if (proximos.length && !campeao) {
        h += '<section class="d-flex flex-column gap-2"><h2 class="rotulo m-0">Próximos na fila</h2>' + proximos.map(function (g, i) {
          var a = Chave.rotuloDoSlot(estado, g, 'A'), b = Chave.rotuloDoSlot(estado, g, 'B');
          var indef = g.status === 'aguardando';
          return '<div class="item-lista"><span class="n">' + (i + 1) + '</span><div class="flex-grow-1 d-flex flex-column"><span class="' + (indef ? 'texto-2' : '') + '" style="font-size:15px;font-weight:500">' +
            esc(a) + ' × ' + esc(b) + '</span><span class="small texto-2">' + esc(UI.descricaoJogo(estado, g)) + '</span></div>' + seloChave(g) + '</div>';
        }).join('') + '</section>';
      }
      h += '<a class="btn btn-sec d-flex align-items-center justify-content-center" href="#/chave">Ver chave completa</a>';
    }
    return h + '<button type="button" class="btn btn-link texto-2 small mt-2" data-acao="limpar-cache">Limpar cache</button></main>';
  };

  function derrotasTexto(estado, id) {
    var d = Chave.derrotas(estado, id);
    return d === 0 ? 'invicta' : d + (d === 1 ? ' derrota' : ' derrotas');
  }

  // ---------- Sorteio (público, depois de confirmado) ----------

  UI.viewSorteio = function (estado) {
    var h = UI.cabecalho(estado) + '<main class="d-flex flex-column gap-3">';
    if (estado.fase === 'config' || estado.fase === 'sorteio' || !estado.jogos.length) {
      return h + UI.vazio('Sorteio ainda não confirmado', 'As duplas aparecem aqui assim que o administrador confirmar o sorteio.') + '</main>';
    }
    h += '<div><h2 class="titulo fs-5 mb-1">Duplas sorteadas</h2><p class="texto-2 small mb-0">A ordem é a dos cabeças de chave: a 1ª dupla enfrenta a última, e assim por diante.</p></div>';
    h += '<div class="d-flex flex-column gap-2">' + estado.duplas.map(function (d) {
      return '<div class="item-lista"><span class="n">' + d.seed + '</span><span class="flex-grow-1 fw-semibold">' + esc(d.nome) + '</span>' +
        (d.seed <= Chave.tamanhoDaChave(estado.duplas.length) - estado.duplas.length ? '<span class="selo selo-v">bye</span>' : '') + '</div>';
    }).join('') + '</div></main>';
    return h;
  };

  // ---------- Chave ----------

  function jogosDaFase(estado, chave, rodada) {
    return estado.jogos.filter(function (g) { return g.chave === chave && g.rodada === rodada; });
  }

  function nomeColunaV(R, r) { return r === R ? 'Final V' : (r === R - 1 ? 'Semifinal' : 'Rodada ' + r); }
  function nomeColunaP(R, k) {
    if (k % 2 === 1) return 'Rodada ' + k;
    var m = k / 2 + 1;
    var quem = m === R ? '+ final V' : (m === R - 1 ? '+ semi' : '+ R' + m);
    return (k === 2 * R - 2 ? 'Final P' : 'Rodada ' + k) + ' · ' + quem;
  }

  // A chave inteira num desenho só: vencedores em cima, perdedores embaixo, finais à direita.
  UI.chaveGeral = function (estado) {
    var ctx = UI.contexto(estado);
    var S = Chave.tamanhoDaChave(estado.duplas.length), R = Math.log2(S), totalP = 2 * R - 2;
    var CW = 150, CH = 64, GX = 36, ST = CW + GX, X0 = 24, RY = 72;
    var pos = {}, r, k, i;
    var vr = [], pr = [];

    var yV0 = 64;
    for (r = 1; r <= R; r++) {
      vr[r] = jogosDaFase(estado, 'V', r);
      vr[r].forEach(function (g, idx) {
        var y = r === 1 ? yV0 + idx * RY : (pos[vr[r - 1][2 * idx].id].y + pos[vr[r - 1][2 * idx + 1].id].y) / 2;
        pos[g.id] = { x: X0 + (r - 1) * ST, y: y };
      });
    }
    var vBase = yV0 + vr[1].length * RY - 8;
    var yP0 = vBase + 70;
    for (k = 1; k <= totalP; k++) {
      pr[k] = jogosDaFase(estado, 'P', k);
      pr[k].forEach(function (g, idx) {
        var y;
        if (k === 1) y = yP0 + idx * RY;
        else if (k % 2 === 0) y = pos[pr[k - 1][idx].id].y;
        else y = (pos[pr[k - 1][2 * idx].id].y + pos[pr[k - 1][2 * idx + 1].id].y) / 2;
        pos[g.id] = { x: X0 + (k - 1) * ST, y: y };
      });
    }
    var vFinal = vr[R][0], pFinal = pr[totalP][0];
    var gx = X0 + totalP * ST, gy = (pos[vFinal.id].y + pos[pFinal.id].y) / 2;
    pos.GF = { x: gx, y: gy };
    var gf2 = estado.jogos.filter(function (g) { return g.id === 'GF2'; })[0];
    if (gf2) pos.GF2 = { x: gx + ST, y: gy };
    var pBase = yP0 + pr[1].length * RY - 8;
    var largura = (gf2 ? gx + ST + CW : gx + CW) + X0, altura = pBase + 60;

    var caminhos = estado.jogos.map(function (g) {
      var d = g.destinoVencedor;
      if (!d || !pos[g.id] || !pos[d.jogo]) return '';
      var a = pos[g.id], b = pos[d.jogo];
      var x1 = a.x + CW, y1 = a.y + CH / 2, x2 = b.x, y2 = b.y + CH / 2, xm = x2 - GX / 2;
      var feito = g.status === 'finalizado' || g.status === 'wo' || (g.status === 'bye' && g.vencedor !== Chave.BYE);
      return '<path d="M ' + x1 + ' ' + y1 + ' H ' + xm + ' V ' + y2 + ' H ' + x2 + '" stroke="' + (feito ? '#8FA82B' : '#4A515C') + '"/>';
    }).join('');
    if (gf2) {
      caminhos += '<path d="M ' + (pos.GF.x + CW) + ' ' + (gy + CH / 2) + ' H ' + pos.GF2.x + '" stroke="#4A515C" stroke-dasharray="6 6"/>';
    }

    var h = '<div class="chave-geral" style="width:' + largura + 'px;height:' + altura + 'px">' +
      '<svg width="' + largura + '" height="' + altura + '" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round">' + caminhos + '</svg>';
    h += '<div class="abs tit destaque" style="left:24px;top:12px">Chave dos vencedores</div>';
    for (r = 1; r <= R; r++) h += '<div class="abs col" style="left:' + pos[vr[r][0].id].x + 'px;top:40px">' + nomeColunaV(R, r) + '</div>';
    h += '<div class="abs tit perdedores" style="left:24px;top:' + (vBase + 20) + 'px">Chave dos perdedores</div>';
    for (k = 1; k <= totalP; k++) h += '<div class="abs col" style="left:' + pos[pr[k][0].id].x + 'px;top:' + (vBase + 46) + 'px">' + nomeColunaP(R, k) + '</div>';
    h += '<div class="abs tit" style="left:' + gx + 'px;top:' + (gy - 24) + 'px">Grande final</div>';
    if (gf2) h += '<div class="abs tit texto-2" style="left:' + pos.GF2.x + 'px;top:' + (gy - 24) + 'px">Reset</div>';
    estado.jogos.forEach(function (g) {
      if (pos[g.id]) h += UI.cardJogo(estado, g, ctx, 'left:' + pos[g.id].x + 'px;top:' + pos[g.id].y + 'px');
    });
    h += '<div class="abs small texto-2" style="left:24px;top:' + (altura - 34) + 'px;white-space:nowrap">Perdeu em cima, cai pra baixo · perdeu embaixo, está fora · borda amarela = em quadra' +
      (gf2 ? ' · reset só se a dupla de baixo vencer' : '') + '</div></div>';
    return h;
  };

  // Uma chave por vez, em colunas por rodada (abas Vencedores, Perdedores e Finais).
  UI.chaveColunas = function (estado, aba) {
    var ctx = UI.contexto(estado);
    var R = Math.log2(Chave.tamanhoDaChave(estado.duplas.length)), cols = [], r, k;
    function formatoColuna(jogos) {
      var f = jogos.length ? UI.formatoDoJogo(estado, jogos[0]) : null;
      return f ? 'até ' + f.pontos + (f.md > 1 ? ' · MD' + f.md : '') : '';
    }
    if (aba === 'V') for (r = 1; r <= R; r++) cols.push({ t: r === R ? 'Final' : (r === R - 1 ? 'Semifinal' : 'Rodada ' + r), jogos: jogosDaFase(estado, 'V', r) });
    if (aba === 'P') for (k = 1; k <= 2 * R - 2; k++) cols.push({ t: k === 2 * R - 2 ? 'Final' : 'Rodada ' + k, jogos: jogosDaFase(estado, 'P', k) });
    if (aba === 'F') {
      cols.push({ t: 'Grande final', jogos: estado.jogos.filter(function (g) { return g.id === 'GF'; }) });
      var g2 = estado.jogos.filter(function (g) { return g.id === 'GF2'; });
      if (g2.length) cols.push({ t: 'Reset', jogos: g2, sub: 'se o de baixo vencer' });
    }
    return '<div class="chave-colunas">' + cols.map(function (c) {
      return '<div class="chave-coluna"><div class="d-flex justify-content-between small texto-2 px-1"><span class="fw-semibold text-uppercase">' + c.t + '</span><span>' + esc(c.sub || formatoColuna(c.jogos)) + '</span></div>' +
        '<div class="jogos">' + c.jogos.map(function (g) { return UI.cardJogo(estado, g, ctx); }).join('') + '</div></div>';
    }).join('') + '</div><p class="small texto-2 mt-2">Arraste para o lado para ver as próximas rodadas.</p>';
  };

  UI.viewChave = function (estado, aba) {
    aba = aba || 'G';
    var h = '<header class="topo"><div class="d-flex flex-column"><span class="nome">Chave</span><span class="small texto-2">Perdeu 2 vezes, está fora</span></div></header>';
    if (!estado.jogos.length) return h + UI.vazio('A chave ainda não existe', 'Ela aparece depois do sorteio das duplas.');
    var abas = [['G', 'Geral'], ['V', 'Vencedores'], ['P', 'Perdedores'], ['F', 'Finais']];
    h += '<div class="abas mb-3" role="tablist">' + abas.map(function (a) {
      return '<button type="button" role="tab" class="aba' + (aba === a[0] ? ' on' : '') + '" data-aba="' + a[0] + '" aria-selected="' + (aba === a[0]) + '">' + a[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="chave-rolagem">' + (aba === 'G' ? UI.chaveGeral(estado) : UI.chaveColunas(estado, aba)) + '</div>';
    return h;
  };

  // ---------- Jogos ----------

  UI.viewJogos = function (estado) {
    var h = '<header class="topo"><div class="d-flex flex-column"><span class="nome">Jogos</span><span class="small texto-2">Fila da quadra e resultados</span></div></header>';
    if (!estado.jogos.length) return h + UI.vazio('Nenhum jogo ainda', 'Os jogos aparecem depois do sorteio.');
    var ctx = UI.contexto(estado);
    var itens = ctx.fila;
    h += '<section class="d-flex flex-column gap-2 mb-4"><h2 class="rotulo m-0">Fila</h2>';
    if (!itens.length) h += '<div class="texto-2 small">Nenhum jogo na fila.</div>';
    itens.forEach(function (g, i) {
      var vivo = g.id === ctx.emQuadraId;
      h += '<button type="button" class="item-lista text-start w-100 border" style="color:inherit;' + (vivo ? 'border-color:var(--destaque)!important' : '') + '" data-jogo="' + g.id + '">' +
        '<span class="n">' + (vivo ? '▶' : i + 1) + '</span><div class="flex-grow-1 d-flex flex-column"><span class="' + (g.status === 'aguardando' ? 'texto-2' : '') + '" style="font-size:15px;font-weight:500">' +
        esc(Chave.rotuloDoSlot(estado, g, 'A')) + ' × ' + esc(Chave.rotuloDoSlot(estado, g, 'B')) + '</span>' +
        '<span class="small texto-2">' + g.id + ' · ' + esc(UI.descricaoJogo(estado, g)) + '</span></div>' + seloChave(g) + '</button>';
    });
    h += '</section>';

    // Já jogados: o mais recente primeiro
    var ordem = {};
    estado.historico.forEach(function (a, idx) { ordem[a.jogo] = idx; });
    var feitos = estado.jogos.filter(function (g) { return g.status === 'finalizado' || g.status === 'wo'; })
      .sort(function (x, y) { return (ordem[y.id] || 0) - (ordem[x.id] || 0); });
    h += '<section class="d-flex flex-column gap-2"><h2 class="rotulo m-0">Já jogados (' + feitos.length + ')</h2>';
    if (!feitos.length) h += '<div class="texto-2 small">Nenhum jogo terminou ainda.</div>';
    feitos.forEach(function (g) {
      var p = Chave.placarExibicao(g);
      // placar do vencedor primeiro, para combinar com "X venceu Y"
      var placar = p.a != null ? (g.vencedor === g.duplaA ? p.a + ' × ' + p.b : p.b + ' × ' + p.a) : (g.status === 'wo' ? 'WO' : '');
      h += '<button type="button" class="item-lista text-start w-100 border" style="color:inherit" data-jogo="' + g.id + '"><div class="flex-grow-1 d-flex flex-column">' +
        '<span style="font-size:15px"><span class="fw-semibold">' + esc(Chave.nomeDupla(estado, g.vencedor)) + '</span> <span class="texto-2">venceu ' + esc(Chave.nomeDupla(estado, g.perdedor)) + '</span></span>' +
        '<span class="small texto-2">' + g.id + ' · ' + esc(UI.tituloFase(estado, g)) + '</span></div><span class="titulo destaque">' + esc(placar) + '</span></button>';
    });
    return h + '</section>';
  };

  // ---------- Classificação ----------

  UI.viewPodio = function (estado) {
    var c = Chave.classificacao(estado);
    var h = '<header class="topo"><div class="d-flex flex-column"><span class="sobre">' + (c.encerrado ? 'Torneio encerrado' : 'Torneio em andamento') + '</span><span class="nome">Classificação</span></div></header>';
    if (!estado.jogos.length) return h + UI.vazio('Sem classificação ainda', 'Ela aparece quando o torneio começar.');
    h += '<main class="d-flex flex-column gap-4 pt-2">';
    function nomes(id) {
      var d = estado.duplas.filter(function (x) { return x.id === id; })[0];
      if (!d) return '';
      var parts = d.nome.split(' / ');
      return '<span class="fw-semibold">' + esc(parts[0]) + '</span><span class="small" style="color:#C9CED6;margin-top:-6px">' + esc(parts[1] || '') + '</span>';
    }
    if (c.encerrado) {
      var seg = c.linhas[1], ter = c.linhas[2];
      h += '<div class="podio"><div class="col">' + nomes(seg.duplas[0]) + '<div class="degrau" style="height:110px;font-size:32px">2</div></div>' +
        '<div class="col primeiro"><span class="destaque">' + UI.icone.trofeu(28) + '</span><span class="titulo destaque" style="font-size:20px;line-height:1.15;display:flex;flex-direction:column;align-items:center">' +
        nomes(c.linhas[0].duplas[0]).replace('fw-semibold', 'fw-bold destaque') + '</span><div class="degrau" style="height:150px;font-size:40px">1</div></div>' +
        '<div class="col">' + (ter ? nomes(ter.duplas[0]) : '') + '<div class="degrau" style="height:80px;font-size:28px">3</div></div></div>';
      var resto = c.linhas.slice(3);
      if (resto.length) {
        h += '<section class="cartao overflow-hidden">' + resto.map(function (l) {
          return '<div class="linha-pos"><span class="pos">' + l.pos + '</span><span class="flex-grow-1">' + l.duplas.map(function (d) { return esc(Chave.nomeDupla(estado, d)); }).join(' · ') +
            '</span><span class="small texto-2">' + esc(l.motivo) + '</span></div>';
        }).join('') + '</section>';
      }
      var pr = Chave.progresso(estado), gf2 = estado.jogos.filter(function (g) { return g.id === 'GF2'; })[0];
      var comReset = gf2 && gf2.status !== 'dispensado';
      h += '<div class="row g-2"><div class="col-6"><div class="cartao p-3"><div class="titulo fs-4">' + pr.feitos + '</div><span class="small texto-2">jogos disputados</span></div></div>' +
        '<div class="col-6"><div class="cartao p-3"><div class="titulo fs-4">' + (comReset ? 'Com reset' : 'Sem reset') + '</div><span class="small texto-2">' + (comReset ? 'a grande final teve jogo extra' : 'campeão sem nenhuma derrota') + '</span></div></div></div>';
    } else {
      h += UI.vazio('O pódio aparece no fim', 'Quando a grande final acabar, a classificação completa fica aqui.');
      if (c.linhas.length) {
        h += '<section><h2 class="rotulo mb-2">Já eliminadas</h2><div class="cartao overflow-hidden">' + c.linhas.map(function (l) {
          return '<div class="linha-pos"><span class="flex-grow-1">' + l.duplas.map(function (d) { return esc(Chave.nomeDupla(estado, d)); }).join(' · ') + '</span><span class="small texto-2">' + esc(l.motivo) + '</span></div>';
        }).join('') + '</div></section>';
      }
      h += '<div class="small texto-2">' + c.vivos.length + ' dupla' + (c.vivos.length === 1 ? '' : 's') + ' ainda na disputa.</div>';
    }
    return h + '</main>';
  };

  // ---------- Avisos ----------

  UI.toast = function (mensagem, tipo) {
    var area = document.getElementById('toasts');
    if (!area) { area = document.createElement('div'); area.id = 'toasts'; area.className = 'toast-area'; area.setAttribute('role', 'status'); area.setAttribute('aria-live', 'polite'); document.body.appendChild(area); }
    var t = document.createElement('div');
    t.className = 'toast-msg' + (tipo === 'erro' ? ' erro' : '');
    t.textContent = mensagem;
    area.appendChild(t);
    setTimeout(function () { t.remove(); }, tipo === 'erro' ? 6000 : 3200);
  };

  root.UI = UI;
})(window);
