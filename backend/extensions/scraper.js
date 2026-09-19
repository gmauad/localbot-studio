const path = require('path');
const Extension = require('../sdk/Extension');
const axios = require('axios');

class ScraperExtension extends Extension {
  constructor() {
    super({
      id: 'core_scraper',
      name: 'Web Scraper',
      version: '1.0.0',
      icon: 'globe',
      description: 'Conecta o Bot à internet...'
    });

    this.systemPromptInject = `[FERRAMENTA DE BUSCA WEB DISPONÍVEL]
Você tem acesso à ferramenta 'buscar_web' (internet em tempo real).
Use-a SEMPRE que a resposta depender de:
- fatos recentes, notícias, eventos, esportes
- preços, cotações, clima
- lançamentos, versões, produtos novos
- qualquer info que você não tenha 100% de certeza

Se a ferramenta não estiver disponível por qualquer motivo, use a tag <BUSCAR>termo da pesquisa</BUSCAR> como fallback.

NUNCA invente dados. NUNCA responda de memória quando o assunto exigir informação atual.`;

    this.toolSchema = {
      type: "function",
      function: {
        name: "buscar_web",
        description: "Busca informações atualizadas na internet em tempo real. Use para fatos recentes, notícias, preços, lançamentos e qualquer informação que possa ter mudado.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Termo de busca otimizado e direto, em português"
            }
          },
          required: ["query"]
        }
      }
    };
  }

  // ============================================================
  // Método interno compartilhado
  // ============================================================
  async _executarBusca(query) {
    console.log(`[PLUGIN: SCRAPER] 🔎 Buscando: "${query}"`);

    try {
      const res = await axios.get(`http://localhost:3000/buscar?q=${encodeURIComponent(query)}`);
      const data = res.data.resultados;

      if (!Array.isArray(data) || data.length === 0) {
        return "A busca não retornou resultados relevantes.";
      }

      return data.map(r => {
        const linhas = [`[FONTE]: ${r.titulo}`];
        if (r.data) linhas.push(`[DATA]: ${r.data}`);
        if (r.fonte) linhas.push(`[VEÍCULO]: ${r.fonte}`);
        linhas.push(`[DADOS]: ${r.resumo}`);
        return linhas.join('\n');
      }).join('\n\n');

    } catch (err) {
      console.error("[PLUGIN: SCRAPER ERRO]", err.message);
      return "Erro técnico ao acessar a internet. Avise o usuário que a busca falhou.";
    }
  }

  // ============================================================
  // Tool calling nativo
  // ============================================================
  async executeTool({ args, contextId, userId }) {
    const query = args?.query || args?.q || "";
    if (!query) {
      return "Erro: query vazia na chamada da ferramenta.";
    }
    return await this._executarBusca(query);
  }

  // ============================================================
  // Fallback legado <BUSCAR>
  // ============================================================
  async onBeforeSend({ rawContent, contextId, userId, helpers }) {
    if (!rawContent) return null;

    const buscarMatch = rawContent.match(/<BUSCAR>(.*?)<\/BUSCAR>/i);
    if (!buscarMatch) return null;

    const query = buscarMatch[1].trim();
    console.log(`[PLUGIN: SCRAPER] Fallback <BUSCAR> acionado: "${query}"`);

    try {
      const resultado = await this._executarBusca(query);

      const promptRequisicao = `[DIRETRIZ PÓS-BUSCA — FALLBACK]
Resultados reais da internet para "${query}":

${resultado}

AGORA responda ao usuário usando APENAS os dados acima. Mantenha a personalidade ríspida e curta.
REGRAS:
1. Se os resultados respondem a pergunta, use o dado LITERALMENTE.
2. Se não respondem, diga "Não achei a informação exata."
3. É PROIBIDO usar a tag <BUSCAR> novamente nesta resposta.
4. É PROIBIDO responder de memória de treino.
5. Máximo 2 frases.`;

      helpers.addMessage(contextId, { role: "assistant", content: `<BUSCAR>${query}</BUSCAR>` }, userId);
      helpers.addMessage(contextId, { role: "user", content: promptRequisicao }, userId);

      return { action: 're-prompt' };

    } catch (err) {
      console.error("[PLUGIN: SCRAPER ERRO]", err.message);
      return { action: 'override-response', text: "Minha API de busca falhou. O motor secundário deve ter estourado." };
    }
  }
}

module.exports = new ScraperExtension();