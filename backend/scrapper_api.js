const express = require('express');
const axios = require('axios');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = 3000;

// ============================================================
// UTIL — checa se a query é do tipo "notícia datada"
// ============================================================
function ehQueryNewsy(query) {
  return /\b(quando|data|que\s+dia|lan[çc]ou|lan[çc]amento|estreou|estreia|saiu|aconteceu|not[íi]cia|[úu]ltima|[úu]ltimas|hoje|ontem|essa\s+semana|esse\s+m[êe]s|divulgou|liberou|publicou)\b/i.test(query);
}

// ============================================================
// UTIL — normaliza data: descarta relativas ("há 8 meses")
// ============================================================
function normalizarData(data) {
  if (!data) return null;
  if (typeof data !== 'string') return null;

  const trimmed = data.trim();
  if (trimmed.length === 0) return null;

  // Descarta datas relativas: "há 8 meses", "há 3 dias", "há 2 horas"
  if (/^h[áa]\s+/i.test(trimmed)) return null;

  // Descarta outras variações comuns em pt-BR
  if (/^(ontem|hoje|agora|semana\s+passada|m[êe]s\s+passado)\b/i.test(trimmed)) return null;

  return trimmed;
}

// ============================================================
// FILTRO 1: PRODUTO (antigo, mantido pra shopping/answerBox)
// ============================================================
function validarRelevanciaProduto(titulo, queryOriginal) {
  if (!titulo) return false;
  const titleLower = titulo.toLowerCase();
  const queryLower = queryOriginal.toLowerCase();

  if (!queryLower.includes('ti') && titleLower.includes('ti')) return false;
  if (!queryLower.includes('super') && titleLower.includes('super')) return false;

  const lixoSEO = ['cabo', 'placa mãe', 'placa-mãe', 'compatível', 'espelho', 'adesivo', 'suporte', 'waterblock', 'cooler', 'fan', 'dissipador', 'caixa', 'pasta térmica'];
  for (let palavra of lixoSEO) {
    if (titleLower.includes(palavra)) return false;
  }

  const numerosBusca = queryLower.match(/\d{4}/g);
  if (numerosBusca) {
    for (let num of numerosBusca) {
      if (!titleLower.includes(num)) return false;
    }
  }

  return true;
}

// ============================================================
// FILTRO 2: NOTÍCIA (overlap de palavras-chave)
// ============================================================
const STOPWORDS = new Set([
  'que', 'qual', 'quando', 'quem', 'onde', 'como', 'por', 'para', 'com', 'sem',
  'dos', 'das', 'de', 'da', 'do', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma',
  'uns', 'umas', 'o', 'a', 'os', 'as', 'e', 'ou', 'saiu', 'sair', 'foi', 'era',
  'sao', 'são', 'esta', 'está', 'esse', 'essa', 'isso', 'aquilo', 'parada',
  'coisa', 'negocio', 'negócio', 'sobre', 'tem', 'ter', 'tinha', 'vai', 'vou',
  'ainda', 'muito', 'pouco', 'mais', 'menos', 'tudo', 'nada', 'aqui', 'ali'
]);

function validarRelevanciaNewsy(titulo, queryOriginal) {
  if (!titulo || !queryOriginal) return false;

  const titleLower = titulo.toLowerCase();
  const queryLower = queryOriginal.toLowerCase();

  const palavrasQuery = queryLower
    .replace(/[^\wÀ-ÿ\s]/g, ' ')
    .split(/\s+/)
    .filter(p => p.length >= 4 && !STOPWORDS.has(p));

  if (palavrasQuery.length === 0) return true;

  const overlaps = palavrasQuery.filter(p => titleLower.includes(p)).length;

  if (palavrasQuery.length >= 3) {
    return overlaps >= 2;
  }

  return overlaps >= 1;
}

// ============================================================
// MOTOR A: Google Custom Search
// ============================================================
async function buscarGoogle(query) {
  console.log(`[MOTOR A] Usando Google Custom Search...`);
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;

  if (!apiKey || !cx) throw new Error("Faltam as chaves do Google no .env");

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&hl=pt-BR`;
  const response = await axios.get(url);

  let extraidos = [];
  if (response.data.items) {
    extraidos = response.data.items.slice(0, 5).map(item => {
      let dataPub = null;
      try {
        const metatags = item.pagemap?.metatags?.[0];
        if (metatags) {
          dataPub = metatags['article:published_time']
            || metatags['og:updated_time']
            || metatags['datePublished']
            || metatags['date']
            || null;
        }
        if (!dataPub && item.pagemap?.newsarticle?.[0]) {
          dataPub = item.pagemap.newsarticle[0].datepublished
            || item.pagemap.newsarticle[0].datepublish
            || null;
        }
      } catch (e) { /* ignora */ }

      return {
        titulo: item.title,
        resumo: item.snippet,
        data: normalizarData(dataPub)
      };
    });
  }
  return extraidos;
}

// ============================================================
// MOTOR B: Serper.dev — roda /search SEMPRE + /news se datada
// ============================================================
async function buscarSerper(query) {
  console.log(`[MOTOR B] Usando Serper.dev com validação semântica sênior...`);
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) throw new Error("Falta a chave do Serper no .env");

  const usarNews = ehQueryNewsy(query);
  console.log(`[MOTOR B] Query datada? ${usarNews ? 'SIM — rodando /search + /news' : 'NÃO — só /search'}`);

  const extraidos = [];
  const vistos = new Set();

  // -------- SEMPRE roda /search --------
  try {
    const searchResp = await axios({
      method: 'post',
      url: 'https://google.serper.dev/search',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      data: JSON.stringify({ q: query, gl: "br", hl: "pt-br" })
    });

    const validados = processarSearchResults(searchResp.data, query);
    validados.forEach(r => {
      const key = (r.titulo || '').toLowerCase().substring(0, 60);
      if (!vistos.has(key)) { vistos.add(key); extraidos.push(r); }
    });
    console.log(`[MOTOR B] /search retornou ${validados.length} resultados válidos`);
  } catch (e) {
    console.error(`[MOTOR B] /search falhou: ${e.message}`);
  }

  // -------- SE for query datada, TAMBÉM roda /news --------
  if (usarNews) {
    try {
      const newsResp = await axios({
        method: 'post',
        url: 'https://google.serper.dev/news',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        data: JSON.stringify({ q: query, gl: "br", hl: "pt-br" })
      });

      let newsValidos = 0;
      if (newsResp.data.news) {
        newsResp.data.news.forEach(item => {
          if (!validarRelevanciaNewsy(item.title, query)) return;
          const key = (item.title || '').toLowerCase().substring(0, 60);
          if (vistos.has(key)) return;
          vistos.add(key);

          if (extraidos.length < 8) {
            extraidos.push({
              titulo: item.title,
              resumo: item.snippet,
              data: normalizarData(item.date),
              link: item.link || null,
              fonte: item.source || null
            });
            newsValidos++;
          }
        });
      }
      console.log(`[MOTOR B] /news retornou ${newsValidos} resultados válidos`);
    } catch (e) {
      console.error(`[MOTOR B] /news falhou: ${e.message}`);
    }
  }

  return extraidos;
}

// ============================================================
// Processa resposta do /search (answerBox + shopping + organic)
// ============================================================
function processarSearchResults(data, query) {
  let extraidos = [];

  // Gaveta 1: Resposta Direta
  if (data.answerBox && validarRelevanciaProduto(data.answerBox.title || '', query)) {
    extraidos.push({
      titulo: `[RESPOSTA DIRETA] ${data.answerBox.title || 'Informação'}`,
      resumo: data.answerBox.answer || data.answerBox.snippet,
      data: null
    });
  }

  // Gaveta 2: Google Shopping
  if (data.shopping) {
    let itensShopping = [];

    data.shopping.forEach(item => {
      if (!validarRelevanciaProduto(item.title, query)) return;

      let precoNum = 999999;
      if (item.price) {
        const limpo = item.price.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.');
        precoNum = parseFloat(limpo);
      }

      itensShopping.push({
        titulo: `[LOJA: ${item.source}] ${item.title}`,
        resumo: `Preço: ${item.price}`,
        precoMatematico: isNaN(precoNum) ? 999999 : precoNum
      });
    });

    itensShopping.sort((a, b) => a.precoMatematico - b.precoMatematico);
    itensShopping.slice(0, 3).forEach(item => {
      extraidos.push({ titulo: item.titulo, resumo: item.resumo, data: null });
    });
  }

  // Gaveta 3: Resultados Orgânicos
  if (data.organic) {
    data.organic.forEach(item => {
      if (!validarRelevanciaNewsy(item.title, query)) return;
      if (extraidos.length < 6) {
        extraidos.push({
          titulo: item.title,
          resumo: item.snippet,
          data: normalizarData(item.date),
          link: item.link || null,
          fonte: item.source || null
        });
      }
    });
  }

  return extraidos;
}

// ============================================================
// ROTA PRINCIPAL
// ============================================================
app.get('/buscar', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ erro: "Faltou a query de busca." });

  const motorSelecionado = process.env.MOTOR_DE_BUSCA || 'SERPER';
  console.log(`\n[API] Recebi pedido do Basilisco: "${query}"`);

  try {
    let resultados = [];

    if (motorSelecionado === 'GOOGLE') {
      resultados = await buscarGoogle(query);
    } else {
      resultados = await buscarSerper(query);
    }

    console.log(`[API] Sucesso! Enviei ${resultados.length} resultados mastigados para o Basilisco.`);
    res.json({ resultados });

  } catch (erro) {
    console.error(`[API] Erro fatal: ${erro.message}`);
    res.status(500).json({ erro: "A API de busca falhou.", detalhe: erro.message });
  }
});

app.listen(PORT, () => {
  console.log(` Scraper Profissional ligado na porta ${PORT}!`);
  console.log(` Motor atual configurado no .env: ${process.env.MOTOR_DE_BUSCA || 'SERPER'}`);
});