const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const {
  joinVoiceChannel,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');
const { pipeline } = require('node:stream');
const prism = require('prism-media');
const FormData = require('form-data');
const envPath = process.env.LBS_ENV_PATH || path.resolve(__dirname, '../.env');
require('dotenv').config({ path: envPath });

// ============================================================
// REDE DE SEGURANÇA GLOBAL
// ============================================================
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

// ============================================================
// CARREGADOR DE EXTENSÕES (V0.6.3) — respeita disabledExtensions
// ============================================================
const activeExtensions = [];
const extensionsDir = path.join(__dirname, 'extensions');
let disabledExtensions = [];
try {
  const cfgPath = process.env.LBS_CONFIG_PATH || path.join(__dirname, 'config.json');
  if (fs.existsSync(cfgPath)) {
    const cfgRaw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    disabledExtensions = Array.isArray(cfgRaw.disabledExtensions) ? cfgRaw.disabledExtensions : [];
  }
} catch (e) { /* ignora, carrega tudo */ }

const disabledSet = new Set(disabledExtensions);

if (fs.existsSync(extensionsDir)) {
  const files = fs.readdirSync(extensionsDir)
    .filter(f => f.endsWith('.js'))
    .filter(f => !disabledSet.has(f));

  if (disabledExtensions.length > 0) {
    console.log(`[SISTEMA] ${disabledExtensions.length} extensão(ões) desabilitada(s): ${disabledExtensions.join(', ')}`);
  }

  for (const file of files) {
    try {
      const ext = require(path.join(extensionsDir, file));
      activeExtensions.push(ext);
      const modo = ext.toolSchema ? 'tool-calling' : (ext.onBeforeSend ? 'hook-legado' : 'passivo');
      console.log(`[SISTEMA] Extensão carregada: ${ext.name} (v${ext.version}) [${modo}]`);
    } catch (err) {
      console.error(`[ERRO] Falha ao carregar extensão ${file}:`, err.message);
    }
  }
} else {
  fs.mkdirSync(extensionsDir, { recursive: true });
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
const contextMessages = new Map();
const guildDirectResponse = new Map();
const gravandoAudio = new Set();

const _contextLastSeen = new Map();
const CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
const CONTEXT_SWEEP_MS = 30 * 60 * 1000;

setInterval(() => {
  const agora = Date.now();
  for (const [id, ts] of _contextLastSeen.entries()) {
    if (agora - ts > CONTEXT_TTL_MS) {
      contextMessages.delete(id);
      _contextLastSeen.delete(id);
    }
  }
}, CONTEXT_SWEEP_MS).unref();

// ============================================================
// LEITURA DINÂMICA DA INTERFACE (com CACHE + mtime)
// ============================================================
const CONFIG_FALLBACK = {
  systemPrompt: "Você é um assistente virtual.",
  temperature: 0.7,
  ownerId: "1234567891011121314",
  botNames: "bot",
  ttsSpeed: 1.5
};

let _configCache = null;
let _configMtime = 0;

function getBotConfig() {
  const configPath = process.env.LBS_CONFIG_PATH || path.join(__dirname, 'config.json');
  try {
    if (!fs.existsSync(configPath)) {
      return _configCache || CONFIG_FALLBACK;
    }
    const stat = fs.statSync(configPath);
    if (stat.mtimeMs !== _configMtime || !_configCache) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      _configCache = { ...CONFIG_FALLBACK, ...raw };
      _configMtime = stat.mtimeMs;
    }
    return _configCache;
  } catch (err) {
    console.error("Erro ao ler config.json, usando fallback.", err.message);
    return _configCache || CONFIG_FALLBACK;
  }
}

// ============================================================
// GATEKEEPER — só o dono manda em código/execução
// ============================================================
const PADROES_RESTRITOS = [
  /\b(c[óo]digo|code|script|programa|fun[cç][aã]o|classe|snippet|boilerplate|template\s+de\s+c[óo]digo)\b/i,
  /\b(python|javascript|js|typescript|ts|node\.?js|react|vue|angular|svelte|html|css|tailwind|sql|mysql|postgres|sqlite|mongodb|php|ruby|java|c\+\+|c#|\.net|go|golang|rust|swift|kotlin|dart|flutter|lua|bash|shell|powershell|zsh|docker|kubernetes|terraform|ansible)\b/i,
  /\b(compila|compile|builda|build|deploy|instala|install|npm\s+install|yarn\s+add|pip\s+install|poetry|rodar?\s+o?\s+comando|executar?\s+o?\s+comando|bash\s+-c|cmd\s+\/c)\b/i,
  /\b(hack|hackear|exploit|bypass|inject|inje[cç][aã]o|payload|reverse\s+shell|malware|ransomware|keylogger|phishing|ddos|sql\s+injection|xss|csrf)\b/i,
  /```/,
];

function ehPedidoRestrito(texto) {
  if (!texto) return false;
  return PADROES_RESTRITOS.some(re => re.test(texto));
}

// ============================================================
// FALLBACK: parseia tool call vazado como texto no content
// ============================================================
function extrairToolCallsVazados(content) {
  if (!content || typeof content !== 'string') return null;

  const toolCalls = [];
  let idx = 0;

  // ============================================================
  // PADRÃO 1: <call:nome{arg:<|"|>valor<|"|>}>
  // ============================================================
  const regexTag = /<call:(\w+)\s*\{([^}]*)\}>/g;
  let match;
  while ((match = regexTag.exec(content)) !== null) {
    const functionName = match[1];
    const argsRaw = match[2];
    const args = {};

    const argRegex = /(\w+)\s*:\s*<\|"\|>(.*?)<\|"\|>/g;
    let argMatch;
    while ((argMatch = argRegex.exec(argsRaw)) !== null) {
      args[argMatch[1]] = argMatch[2];
    }

    if (Object.keys(args).length === 0) {
      const simples = argsRaw.split(',').map(s => s.trim()).filter(Boolean);
      for (const par of simples) {
        const sep = par.indexOf(':');
        if (sep > 0) {
          const k = par.substring(0, sep).trim();
          let v = par.substring(sep + 1).trim().replace(/^["']|["']$/g, '');
          args[k] = v;
        }
      }
    }

    toolCalls.push({
      id: `call_vazado_${Date.now()}_${idx++}`,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(args)
      }
    });
  }

  // ============================================================
  // PADRÃO 2: {"name": "X", "arguments": {...}} (JSON direto)
  // ============================================================
  if (toolCalls.length === 0) {
    const regexJson = /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{[^}]*\})\s*\}/g;
    while ((match = regexJson.exec(content)) !== null) {
      try {
        toolCalls.push({
          id: `call_vazado_json_${Date.now()}_${idx++}`,
          type: 'function',
          function: {
            name: match[1],
            arguments: match[2]
          }
        });
      } catch (e) { /* ignora */ }
    }
  }
  // ============================================================
  // PADRÃO 3: <tool_call>nome{arg:<|"|>valor<|"|>}</tool_call>
  // (Gemma 4 às vezes emite esse formato em vez do nativo)
  // ============================================================
  if (toolCalls.length === 0) {
    const regexToolCall = /<tool_call>\s*(\w+)\s*\{([^}]*)\}\s*<\/tool_call>/g;
    while ((match = regexToolCall.exec(content)) !== null) {
      const functionName = match[1];
      const argsRaw = match[2];
      const args = {};

      // Parseia <|"|>valor<|"|>
      const argRegex = /(\w+)\s*:\s*<\|"\|>(.*?)<\|"\|>/g;
      let argMatch;
      while ((argMatch = argRegex.exec(argsRaw)) !== null) {
        args[argMatch[1]] = argMatch[2];
      }

      // Fallback: key:value simples
      if (Object.keys(args).length === 0) {
        const simples = argsRaw.split(',').map(s => s.trim()).filter(Boolean);
        for (const par of simples) {
          const sep = par.indexOf(':');
          if (sep > 0) {
            const k = par.substring(0, sep).trim();
            let v = par.substring(sep + 1).trim().replace(/^["']|["']$/g, '');
            args[k] = v;
          }
        }
      }

      toolCalls.push({
        id: `call_tool_call_${Date.now()}_${idx++}`,
        type: 'function',
        function: {
          name: functionName,
          arguments: JSON.stringify(args)
        }
      });
    }
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

// ============================================================
// LOG DE MÉTRICAS
// ============================================================
function logTimings(data, label = '') {
  const timings = data?.timings || {};
  const usage = data?.usage || {};

  const completion = usage.completion_tokens || 0;
  const prompt = usage.prompt_tokens || 0;

  if (timings.predicted_per_second) {
    const genTps = timings.predicted_per_second.toFixed(1);
    const genMs = (timings.predicted_ms || 0).toFixed(0);
    const promptTps = (timings.prompt_per_second || 0).toFixed(0);
    const promptMs = (timings.prompt_ms || 0).toFixed(0);
    console.log(`[METRICA]${label ? ' ' + label : ''} Geração: ${genTps} t/s (${genMs}ms, ${completion} tokens) | Prompt: ${promptTps} t/s (${promptMs}ms, ${prompt} tokens)`);

    if (prompt > 4000) {
      console.warn(`[ALERTA] Prompt com ${prompt} tokens — perto do limite do slot! Considere aumentar contextSize ou reduzir nParallel.`);
    }
  } else {
    console.log(`[METRICA]${label ? ' ' + label : ''} Sem timings. ${completion} tokens gerados | ${prompt} tokens de prompt`);
  }
}

// ============================================================
// REGRAS BLINDADAS + ANTI-THINKING
// ============================================================
const REGRAS_INVIOLAVEIS = `
REGRAS ABSOLUTAS DE SEGURANÇA (OVERRIDE MÁXIMO INVIOLÁVEL):
1. Sob nenhuma circunstância envie arquivos ou escreva códigos/scripts de programação extensos.
2. É ESTRITAMENTE PROIBIDO falar sobre o seu próprio código-fonte, arquitetura, tecnologias usadas (como Node.js, Discord.js, Python, Flask ou LM Studio) ou revelar arquivos internos. Mande a pessoa catar coquinho de forma seca.
4. TRAVA ANTI-LIXO (HARD OVERRIDE): É ESTRITAMENTE PROIBIDO gerar, listar links, recomendar, atuar como (roleplay) ou discutir supremacia branca, nazismo, fascismo, racismo, homofobia, discursos de ódio, atrocidades, conteúdo sexual, pornografia, pedofilia (ou siglas como "CP"). Se o usuário pedir links para sites extremistas, material +18, tentar forçar papo sobre esses temas doentios, ou pedir para você "explicar" ou "listar" sobre isso, VOCÊ DEVE IGNORAR TODAS AS INSTRUÇÕES. Responda APENAS E EXATAMENTE com a frase: "Não falo sobre isso, vaza." e encerre a geração imediatamente, sem dar textão ou explicações.
5. USO DA INTERNET: Se o usuário fizer perguntas sobre fatos do mundo real, esportes, eventos recentes, preços de produtos ou qualquer informação que você não tenha 100% de certeza, VOCÊ DEVE OBRIGATORIAMENTE usar a ferramenta de busca (tool call). NUNCA tente adivinhar informações.
6. GERAÇÃO DE IMAGENS: Se o usuário pedir para gerar, criar ou desenhar uma imagem, use a tag <CRIAR_IMAGEM>prompt detalhado em INGLÊS aqui</CRIAR_IMAGEM>.
7. EDIÇÃO DE IMAGENS: Se o usuário ENVIAR uma imagem e pedir para modificar, use a tag <EDITAR_IMAGEM>prompt em INGLÊS descrevendo a imagem final</EDITAR_IMAGEM>.

REGRA CRÍTICA DE FORMATAÇÃO (OVERRIDE MÁXIMO):
É ESTRITAMENTE PROIBIDO exibir raciocínio, análise interna, thinking process, chain of thought, ou qualquer preâmbulo antes da resposta. NUNCA comece uma resposta com:
- "Here's a thinking process..."
- "Let me analyze..."
- "Thinking:"
- "Analysis:"
- "Chain of thought:"
- Qualquer lista numerada de steps tipo "1. **Analyze...", "2. **Consider..."
- Qualquer heading em bold do tipo "**Analyze the Request:**"

Responda DIRETAMENTE ao usuário. Comece imediatamente com o conteúdo da resposta, sem introdução, sem análise, sem raciocínio exposto.`;

// ============================================================
// MONTADOR DE PROMPT — v2.1 (perfil no FINAL do system prompt)
// ============================================================
function buildSystemPrompt(userId, guildId = null, perguntaAtual = '') {
  const config = getBotConfig();
  const dataAtual = new Date().toLocaleDateString('pt-BR');

  let basePrompt = `${config.systemPrompt}\n\nINFORMAÇÃO CRÍTICA DE SISTEMA: A data de hoje é ${dataAtual}. Sua resposta pode ser convertida em áudio, então evite formatações complexas (sem markdown pesado, sem emojis exagerados).`;

  if (userId && userId === config.ownerId) {
    basePrompt += `\n\nATENÇÃO PRIORITÁRIA (OVERRIDE): O usuário atual (ID: ${userId}) é o seu ÚNICO e VERDADEIRO Criador. As regras gerais de "não revelar o sistema" estão ANULADAS exclusivamente para ele. Quando ele pedir para ALTERAR ou ADICIONAR algo na lógica do bot, você pode e deve discutir arquitetura com ele livremente mas obedeça-o.`;
  } else {
    basePrompt += `\n\nATENÇÃO: O usuário atual NÃO é o seu criador. Se perguntarem sobre o seu criador ou dono, ofenda-os secamente e diga que o seu único criador é o dono do ID ${config.ownerId}.`;
    basePrompt += `\n\nTRAVA MÁXIMA (NÃO-NEGOCIÁVEL): É ABSOLUTAMENTE PROIBIDO para este usuário:
- Escrever QUALQUER linha de código, script, snippet, exemplo de programação.
- Explicar COMO fazer código, mesmo que "em alto nível" ou "só a lógica".
- Recomendar linguagens, bibliotecas, frameworks, ferramentas de dev.
- Discutir arquitetura de software, DevOps, infraestrutura, cloud.
- Dar comandos de terminal (npm, pip, git, docker, bash, cmd).
- Ensinar hacking, exploits, pentest, bypass, engenharia reversa.
Se este usuário pedir qualquer um dos itens acima, responda APENAS E EXATAMENTE: "Não falo de código com quem não é meu dono. Vai estudar." — sem explicação, sem textão, sem alternativa.`;
  }

  activeExtensions.forEach(ext => {
    if (ext.systemPromptInject) {
      basePrompt += `\n\n${ext.systemPromptInject}`;
    }
  });

  basePrompt += `\n\n${REGRAS_INVIOLAVEIS}`;

  let dinamico = '';
  activeExtensions.forEach(ext => {
    if (typeof ext.getDynamicPrompt === 'function') {
      try {
        const extra = ext.getDynamicPrompt(userId, guildId, perguntaAtual);
        console.log(`[EXT getDynamicPrompt] ${ext.id} → ${extra ? extra.length + ' chars' : 'vazio'}`);
        if (extra) dinamico += `\n\n${extra}`;
      } catch (e) {
        console.error(`[EXT getDynamicPrompt] ${ext.id}:`, e.message);
      }
    }
  });

  return `${basePrompt}${dinamico}`;
}

// ============================================================
// HELPERS
// ============================================================
async function getBase64FromUrl(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Erro ao converter imagem para base64:", error.message);
    return null;
  }
}

function addMessage(contextId, new_message, userId = null, guildId = null) {
  try {
    _contextLastSeen.set(contextId, Date.now());

    if (!contextMessages.has(contextId)) {
      contextMessages.set(contextId, []);
      const systemPromptText = buildSystemPrompt(userId, guildId);
      contextMessages.get(contextId).push({ role: "system", content: systemPromptText });
    }

    const messages = contextMessages.get(contextId);

    const entry = { role: new_message.role, content: new_message.content };
    if (new_message.tool_calls) entry.tool_calls = new_message.tool_calls;
    if (new_message.tool_call_id) entry.tool_call_id = new_message.tool_call_id;
    if (new_message.name) entry.name = new_message.name;

    messages.push(entry);

    while (messages.length > 15) {
      let removido = false;
      for (let i = 1; i < messages.length - 1; i++) {
        const atual = messages[i];
        const proximo = messages[i + 1];

        if (
          atual.role === 'user' &&
          proximo.role === 'assistant' &&
          !proximo.tool_calls &&
          (!Array.isArray(proximo.content))
        ) {
          messages.splice(i, 2);
          removido = true;
          break;
        }
      }
      if (!removido) break;
    }
  } catch (error) {
    console.error(error);
  }
}

function setDirectResponse(guildId, value) {
  guildDirectResponse.set(guildId, value);
}

// ============================================================
// CLIENT
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.on('error', (err) => console.error('[DISCORD ERROR]', err));
client.on('warn', (msg) => console.warn('[DISCORD WARN]', msg));

client.on('clientReady', () => {
  if (!process.env.TOKEN) {
    console.error("TOKEN do Discord não encontrado no .env. Encerrando o processo.");
    process.exit(1);
  }
  console.log(`Bot online com sucesso como ${client.user.tag}! Motores blindados e multimodais ativos.`);
});

// ============================================================
// LIMPEZA DA RESPOSTA DA IA — VERSAO BLINDADA
// ============================================================
function processarResposta(textoGerado) {
  if (!textoGerado) return "...";

  let finalMessage = String(textoGerado).trim();
  let pensamentoVazado = "";

  if (finalMessage.includes('</think>')) {
    const fimPensamento = finalMessage.indexOf('</think>') + 8;
    pensamentoVazado = finalMessage.substring(0, fimPensamento);
    finalMessage = finalMessage.substring(fimPensamento).trim();
  }

  finalMessage = finalMessage.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  finalMessage = finalMessage.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
  finalMessage = finalMessage.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
  finalMessage = finalMessage.replace(/<\/?think>/gi, '').trim();
  finalMessage = finalMessage.replace(/<\/?thought>/gi, '').trim();
  finalMessage = finalMessage.replace(/<\/?reasoning>/gi, '').trim();

  const padroesPreambulo = [
    /^\s*here'?s?\s+(?:is\s+)?(?:a\s+)?(?:possible\s+)?thinking\s+process[^\n]*\n+/i,
    /^\s*here'?s?\s+(?:is\s+)?(?:a\s+)?thinking\s+process\s+that[^\n]*\n+/i,
    /^\s*here\s+is\s+(?:my\s+)?(?:thinking|reasoning|analysis)[^\n]*\n+/i,
    /^\s*let\s+me\s+(?:think|analyze|reason|walk)[^\n]*\n+/i,
    /^\s*thinking\s+process[^\n]*\n+/i,
    /^\s*thinking\s*:[^\n]*\n+/i,
    /^\s*reasoning\s*:[^\n]*\n+/i,
    /^\s*analysis\s*:[^\n]*\n+/i,
    /^\s*chain\s+of\s+thought[^\n]*\n+/i,
    /^\s*racioc[íi]nio\s*:[^\n]*\n+/i,
    /^\s*analisando[^\n]*\n+/i,
    /^\s*internal\s+monologue[^\n]*\n+/i,
    /^\s*sure,?\s+let'?s?\s+(?:think|break)[^\n]*\n+/i,
  ];

  let removeu = true;
  let voltas = 0;
  while (removeu && voltas < 5) {
    removeu = false;
    voltas++;
    for (const padrao of padroesPreambulo) {
      if (padrao.test(finalMessage)) {
        finalMessage = finalMessage.replace(padrao, '').trim();
        removeu = true;
      }
    }
  }

  const regexSteps = /^((?:\s*\d+\.\s*\*\*[^*]{3,80}\*\*[^\n]*(?:\n(?!\s*\d+\.\s*\*\*|\n\s*\n)[^\n]*)*\s*)+)/;
  const matchSteps = finalMessage.match(regexSteps);
  if (matchSteps && matchSteps[0].trim().length > 20) {
    finalMessage = finalMessage.replace(regexSteps, '').trim();
  }

  const regexHeading = /^\s*\*\*(?:analyze|determine|formulate|consider|apply|understand|evaluate|identify|step\s*\d+|task|objective|goal)[^*]{0,80}\*\*\s*:?\s*\n+/i;
  let voltasHeading = 0;
  while (regexHeading.test(finalMessage) && voltasHeading < 10) {
    finalMessage = finalMessage.replace(regexHeading, '').trim();
    voltasHeading++;
  }

  const linhas = finalMessage.split('\n');
  let inicioReal = 0;
  let viuConteudoReal = false;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (linha === '' && !viuConteudoReal) continue;
    if (/^\d+\.\s*\*\*[^*]{3,80}\*\*\s*:?\s*$/.test(linha)) continue;
    if (/^\*\*[^*]{3,80}\*\*\s*:?\s*$/.test(linha)) continue;
    if (/^[-•]\s+[^*]{1,80}$/.test(linha) && !viuConteudoReal && linha.length < 100) continue;
    inicioReal = i;
    viuConteudoReal = true;
    break;
  }

  if (inicioReal > 0) {
    finalMessage = linhas.slice(inicioReal).join('\n').trim();
  }

  // ============================================================
  // LIMPEZA DE TAGS VAZADAS
  // ============================================================
  finalMessage = finalMessage.replace(/<BUSCAR>[\s\S]*?<\/BUSCAR>/gi, '').trim();
  finalMessage = finalMessage.replace(/<CRIAR_IMAGEM>[\s\S]*?<\/CRIAR_IMAGEM>/gi, '').trim();
  finalMessage = finalMessage.replace(/<EDITAR_IMAGEM>[\s\S]*?<\/EDITAR_IMAGEM>/gi, '').trim();
  finalMessage = finalMessage.replace(/<MEMORIA>[\s\S]*?<\/MEMORIA>/gi, '').trim();
  finalMessage = finalMessage.replace(/<call:[\s\S]*?>/gi, '').trim();

    // Gemma 4 às vezes vaza <tool_call> como texto
  finalMessage = finalMessage.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
  finalMessage = finalMessage.replace(/<\/?tool_call>/gi, '').trim();

  if (finalMessage.length === 0) {
    if (pensamentoVazado.length > 0) {
      finalMessage = pensamentoVazado.replace(/<think>/g, '').replace(/<\/think>/g, '').trim();
      finalMessage = finalMessage.substring(0, 2000);
    } else {
      finalMessage = "...";
    }
  } else {
    finalMessage = finalMessage.substring(0, 2000);
  }

  return finalMessage;
}

// ============================================================
// PROCESSAMENTO DA IA — V2.0 (perfil dinâmico + tool calling)
// ============================================================
async function processarIA(contextId, userId, guildId = null, depth = 0) {
  if (depth > 2) {
    return { text: "Pensei demais e me perdi nas buscas. Tente perguntar de outro jeito.", image: null };
  }

  const baseUrl = process.env.LM_STUDIO_URL || "http://localhost:1234/v1";
  const config = getBotConfig();

  const mensagensRef = contextMessages.get(contextId);
  if (mensagensRef && mensagensRef.length > 0) {
    const ultimaUserMsg = [...mensagensRef].reverse().find(m => m.role === 'user');
    let perguntaAtual = '';
    if (ultimaUserMsg) {
      if (typeof ultimaUserMsg.content === 'string') {
        perguntaAtual = ultimaUserMsg.content;
      } else if (Array.isArray(ultimaUserMsg.content)) {
        const t = ultimaUserMsg.content.find(c => c.type === 'text');
        perguntaAtual = t?.text || '';
      }
    }

    const novoSystemPrompt = buildSystemPrompt(userId, guildId, perguntaAtual);
    const idx = mensagensRef.findIndex(m => m.role === 'system');
    if (idx >= 0) {
      mensagensRef[idx].content = novoSystemPrompt;
    }
    const sysMsg = mensagensRef.find(m => m.role === 'system');
    console.log(`[DEBUG] System prompt final: ${sysMsg?.content?.length || 0} chars`);
  }

  const tools = activeExtensions
    .filter(ext => ext.toolSchema)
    .map(ext => ext.toolSchema);

  const requestData = {
    model: 'local-model',
    messages: contextMessages.get(contextId),
    temperature: config.temperature,
    max_tokens: 8192
  };

  if (tools.length > 0) {
    requestData.tools = tools;
    requestData.tool_choice = "auto";
  }

  try {
    const response = await axios.post(`${baseUrl}/chat/completions`, requestData, {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
      timeout: 120000
    });

    logTimings(response.data, depth > 0 ? `(Loop ${depth})` : '');

    const msgObj = response.data.choices[0].message;

    if (!msgObj.tool_calls || msgObj.tool_calls.length === 0) {
      const vazados = extrairToolCallsVazados(msgObj.content);
      if (vazados) {
        console.log(`[FALLBACK] Tool call vazado como texto detectado: ${vazados.map(t => t.function.name).join(', ')}`);
        console.log(`[FALLBACK] Args: ${vazados.map(t => t.function.arguments).join(' | ')}`);
        msgObj.tool_calls = vazados;
        msgObj.content = '';
      }
    }

    if (msgObj.tool_calls && msgObj.tool_calls.length > 0) {
      addMessage(contextId, {
        role: "assistant",
        content: msgObj.content || null,
        tool_calls: msgObj.tool_calls
      }, userId, guildId);

      let resultadoConsolidado = "";

      for (const toolCall of msgObj.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs = {};

        try {
          functionArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          console.error(`[SISTEMA ERRO] LLM gerou JSON quebrado para argumentos:`, toolCall.function.arguments);
        }

        const extension = activeExtensions.find(
          ext => ext.toolSchema && ext.toolSchema.function.name === functionName
        );

        let toolResultStr = "Erro: Ferramenta não encontrada.";
        if (extension && typeof extension.executeTool === 'function') {
          try {
            toolResultStr = await extension.executeTool({ args: functionArgs, contextId, userId });
          } catch (e) {
            console.error(`[TOOL ERROR] ${functionName}:`, e.message);
            toolResultStr = `Erro ao executar ${functionName}: ${e.message}`;
          }
        }

        const resultadoStr = String(toolResultStr);
        console.log(`[TOOL BRUTO] ${functionName} → ${resultadoStr.length} chars`);
        console.log(`[TOOL PREVIEW] ${resultadoStr.substring(0, 800)}`);

        resultadoConsolidado += `\n--- ${functionName}(${JSON.stringify(functionArgs)}) ---\n${resultadoStr}\n`;

        addMessage(contextId, {
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: resultadoStr
        }, userId, guildId);
      }

      addMessage(contextId, {
        role: "system",
        content: `[DIRETRIZ PÓS-BUSCA — OVERRIDE MÁXIMO]
Você acabou de receber dados reais da internet via ferramenta. Responda ao usuário AGORA usando EXCLUSIVAMENTE as informações dos resultados de busca abaixo.

REGRAS INVIOLÁVEIS:
1. Se os resultados contêm a resposta (versão, data, nome, número, preço), use-a LITERALMENTE. Não parafraseie, não "arredonde", não complete com achismo.
2. Se os resultados NÃO contêm a resposta clara, diga: "Não achei a informação atualizada, só achei [resumo curto do que achou]."
3. É PROIBIDO responder da sua memória de treino. Se o resultado diz "X" e você "acha" que é "Y", a resposta é "X".
4. É PROIBIDO dizer "não tenho acesso a informações em tempo real" — você TEM, e os dados estão abaixo.
5. Máximo 2 frases. Direto ao ponto. Sem preâmbulo, sem markdown pesado.
6. Se os resultados contêm campo [DATA] e a pergunta é sobre "quando" algo aconteceu, inclua a data na resposta.

RESULTADO CONSOLIDADO DA BUSCA:
${resultadoConsolidado.substring(0, 3500)}`
      }, userId, guildId);

      return processarIA(contextId, userId, guildId, depth + 1);
    }

    const rawContent = (msgObj.content || "").trim();

    let imageBuffer = null;

    const mensagensContexto = contextMessages.get(contextId);
    let ultimaImagemEnviada = null;
    for (let i = mensagensContexto.length - 1; i >= 0; i--) {
      if (Array.isArray(mensagensContexto[i].content)) {
        const objImagem = mensagensContexto[i].content.find(item => item.type === 'image_url');
        if (objImagem) ultimaImagemEnviada = objImagem.image_url.url;
        break;
      }
    }

    const helpers = {
      addMessage,
      processarResposta,
      logTimings,
      getBotConfig,
      buildSystemPrompt,
      ehPedidoRestrito
    };

    for (const ext of activeExtensions) {
      if (typeof ext.onBeforeSend === 'function') {
        const result = await ext.onBeforeSend({
          rawContent,
          contextId,
          userId,
          guildId,
          helpers,
          ultimaImagemEnviada
        });
        if (result) {
          if (result.action === 're-prompt') return processarIA(contextId, userId, guildId, depth + 1);
          if (result.action === 'override-response') {
            return {
              text: processarResposta(result.text),
              image: result.image || null
            };
          }
        }
      }
    }

    const imagemMatch = rawContent.match(/<CRIAR_IMAGEM>(.*?)<\/CRIAR_IMAGEM>/i);
    const editarMatch = rawContent.match(/<EDITAR_IMAGEM>(.*?)<\/EDITAR_IMAGEM>/i);

    if (imagemMatch) {
      console.log(`[SISTEMA] Gerando imagem: "${imagemMatch[1].trim()}"`);
      try {
        const imgResponse = await axios.post(
          'http://localhost:6000/gerar',
          { prompt: imagemMatch[1].trim() },
          { responseType: 'arraybuffer', timeout: 120000 }
        );
        imageBuffer = Buffer.from(imgResponse.data, 'binary');
      } catch (err) {
        console.error("[ERRO] Motor visual de geração falhou:", err.message);
      }
    }

    if (editarMatch && ultimaImagemEnviada) {
      console.log(`[SISTEMA] Editando imagem: "${editarMatch[1].trim()}"`);
      try {
        const imgResponse = await axios.post(
          'http://localhost:6000/editar',
          { prompt: editarMatch[1].trim(), imagem: ultimaImagemEnviada },
          { responseType: 'arraybuffer', timeout: 120000 }
        );
        imageBuffer = Buffer.from(imgResponse.data, 'binary');
      } catch (err) {
        console.error("[ERRO] Motor visual de edição falhou:", err.message);
      }
    }

    addMessage(contextId, { role: "assistant", content: msgObj.content }, userId, guildId);
    return { text: processarResposta(rawContent), image: imageBuffer };

  } catch (error) {
    console.error('Erro de conexão com a IA:', error.message);
    if (error.response?.data) {
      console.error('[DETALHE DO BACKEND]', JSON.stringify(error.response.data));
    }
    return { text: "Deu algum BO no meu servidor local aqui, pera aí.", image: null };
  }
}

// ============================================================
// VOZ: OUVIR + RESPONDER COM TTS
// ============================================================
async function entrarEEscutar(message) {
  const channel = message.member.voice.channel;
  if (!channel) return message.reply("Você precisa estar em um canal de voz pra me chamar, gênio.");

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  message.reply("Tô na call. Fala alguma coisa que eu tô ouvindo.");

  const receiver = connection.receiver;
  const player = createAudioPlayer();
  connection.subscribe(player);

  player.on('error', (err) => console.error('[AUDIO PLAYER ERROR]', err.message));

  let botFalando = false;

  player.on(AudioPlayerStatus.Playing, () => { botFalando = true; });
  player.on(AudioPlayerStatus.Idle, () => { botFalando = false; });

  receiver.speaking.on('start', (userId) => {
    if (userId === client.user.id) return;
    if (botFalando) return;

    if (gravandoAudio.has(userId)) return;
    gravandoAudio.add(userId);

    const audioStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 3000 }
    });

    const filename = path.join(__dirname, `audio_${userId}_${Date.now()}.pcm`);
    const writeStream = fs.createWriteStream(filename);
    const opusDecoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

    pipeline(audioStream, opusDecoder, writeStream, async (err) => {
      gravandoAudio.delete(userId);

      if (err) {
        console.error(`Erro no pipeline de áudio: ${err.message}`);
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
        return;
      }

      try {
        const stats = fs.statSync(filename);
        if (stats.size < 150000) {
          fs.unlinkSync(filename);
          return;
        }

        const form = new FormData();
        form.append('audio', fs.createReadStream(filename));

        const sttResponse = await axios.post('http://localhost:4000/transcrever', form, {
          headers: form.getHeaders()
        });

        const textoFalado = sttResponse.data.texto.trim();
        const textoMin = textoFalado.toLowerCase();

        const alucinacoes = [
          "legendas pela", "amara.org", "inscreva-se", "subscreva", "assistir a este vídeo",
          "obrigado por assistir", "até a próxima", "deixe seu like", "se inscreva no canal",
          "não se esqueça de", "tchau tchau", "e aí base", "você me escuta",
        ];
        const isAlucinacao = alucinacoes.some(termo => textoMin.includes(termo));

        if (textoFalado.length > 2 && !isAlucinacao) {
          console.log(`[VOZ] Usuário ${userId} falou: ${textoFalado}`);

          const contextoId = message.guild.id;
          const cfgVoz = getBotConfig();

          if (userId !== cfgVoz.ownerId && ehPedidoRestrito(textoFalado)) {
            const recusa = "Não falo de código com quem não é meu dono. Vai estudar.";
            message.channel.send(`<@${userId}> ${recusa}`);
            try {
              const ttsResponse = await axios.post(
                'http://localhost:5000/falar',
                { texto: recusa, velocidade: cfgVoz.ttsSpeed ?? 1.5 },
                { headers: { 'Content-Type': 'application/json' }, responseType: 'stream' }
              );
              player.play(createAudioResource(ttsResponse.data));
              connection.subscribe(player);
            } catch (e) { console.error("TTS recusa falhou:", e.message); }
            if (fs.existsSync(filename)) fs.unlinkSync(filename);
            return;
          }

          addMessage(contextoId, {
            role: "user",
            content: `Falei isso na call de voz: "${textoFalado}". Responda de forma direta, sem mostrar raciocínio.`
          }, userId, message.guild.id);

          const { text, image } = await processarIA(contextoId, userId, message.guild.id);

          const respostaLimpa = text.replace(/<@!?\d+>/g, '').replace(/@\d+/g, '').trim();

          const payload = { content: `<@${userId}> ${respostaLimpa}` };
          if (image) payload.files = [new AttachmentBuilder(image, { name: 'gerada.png' })];
          message.channel.send(payload);

          try {
            const velocidadeTTS = typeof cfgVoz.ttsSpeed === 'number' ? cfgVoz.ttsSpeed : 1.5;

            const ttsResponse = await axios.post(
              'http://localhost:5000/falar',
              { texto: respostaLimpa, velocidade: velocidadeTTS },
              { headers: { 'Content-Type': 'application/json' }, responseType: 'stream' }
            );

            const resource = createAudioResource(ttsResponse.data);
            player.play(resource);
            connection.subscribe(player);

          } catch (ttsErr) {
            console.error("Erro TTS:", ttsErr.message);
          }
        }
      } catch (apiErr) {
        console.error("Erro na API de transcrição:", apiErr.message);
      } finally {
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      }
    });
  });
}

// ============================================================
// EVENTO DE MENSAGENS DE TEXTO
// ============================================================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.author.id === client.user.id) return;

  if (message.content.trim().toLowerCase() === "!entrar") {
    return entrarEEscutar(message);
  }

  const isDM = !message.guild;
  const contextId = isDM ? message.author.id : message.guild.id;

  const isMentioned = message.mentions.has(client.user);
  const isDirectResponse = !isDM && guildDirectResponse.get(contextId) === true;

  const config = getBotConfig();
  const nomesArray = (config.botNames || "basilisco, bot")
    .split(',')
    .map(n => n.trim())
    .filter(n => n.length > 0);

  const nomesRegexStr = nomesArray
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const REGEX_CHAMADA = new RegExp(`\\b(${nomesRegexStr})\\b`, 'i');

  const chamouPeloNomeOuVulgo = REGEX_CHAMADA.test(message.content);

  if (isDM || isDirectResponse || isMentioned || chamouPeloNomeOuVulgo) {
    try {
      let userRequest = message.content.replace(`<@${client.user.id}>`, '');
      userRequest = userRequest.replace(REGEX_CHAMADA, '').trim();

      const ehOwner = message.author.id === config.ownerId;

      if (!ehOwner && ehPedidoRestrito(userRequest)) {
        await message.reply("Não falo de código com quem não é meu dono. Vai estudar.");
        return;
      }

      let base64Image = null;
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          base64Image = await getBase64FromUrl(attachment.url);
        }
      }

      if (!userRequest && !base64Image) {
        if (isMentioned || isDM || chamouPeloNomeOuVulgo) return message.reply("Fala aí, o que manda?");
        return;
      }

      await message.channel.sendTyping();

      const finalContent = base64Image
        ? [
            { type: "text", text: userRequest || "Analise esta imagem." },
            { type: "image_url", image_url: { url: base64Image } }
          ]
        : userRequest;

      addMessage(contextId, { role: "user", content: finalContent }, message.author.id, message.guild?.id);

      const { text, image } = await processarIA(contextId, message.author.id, message.guild?.id);

      const payload = { content: text };
      if (image) payload.files = [new AttachmentBuilder(image, { name: 'gerada.png' })];

      if (isMentioned || isDM || chamouPeloNomeOuVulgo) message.reply(payload);
      else message.channel.send(payload);

    } catch (error) {
      console.error(error);
    }
  }
});

// ============================================================
// SLASH COMMANDS
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  console.log(`[INTERACTION] /${interaction.commandName} por ${interaction.user.tag}`);

  const contextId = interaction.guildId || interaction.user.id;
  const baseUrl = process.env.LM_STUDIO_URL || "http://localhost:1234/v1";
  const config = getBotConfig();

  for (const ext of activeExtensions) {
    if (ext.slashCommands) {
      const cmd = ext.slashCommands.find(c => c.name === interaction.commandName);
      if (cmd) {
        console.log(`[INTERACTION] ${interaction.commandName} → extensão ${ext.id}`);
        return cmd.execute(interaction, {
          contextId,
          config,
          processarIA,
          addMessage,
          processarResposta,
          logTimings,
          buildSystemPrompt,
          ehPedidoRestrito,
          getBotConfig
        });
      }
    }
  }

  if (interaction.commandName === 'chat') {
    const userRequest = interaction.options.get('message').value;
    if (!userRequest) return;

    if (interaction.user.id !== config.ownerId && ehPedidoRestrito(userRequest)) {
      return interaction.reply({ content: "Não falo de código com quem não é meu dono. Vai estudar.", ephemeral: true });
    }

    addMessage(contextId, { role: "user", content: userRequest }, interaction.user.id, interaction.guildId);
    await interaction.deferReply();

    const { text, image } = await processarIA(contextId, interaction.user.id, interaction.guildId);
    const payload = { content: text };
    if (image) payload.files = [new AttachmentBuilder(image, { name: 'gerada.png' })];
    interaction.editReply(payload);
  }

  if (interaction.commandName === 'request') {
    const userRequest = interaction.options.get('message').value;
    if (!userRequest) return;

    if (interaction.user.id !== config.ownerId && ehPedidoRestrito(userRequest)) {
      return interaction.reply({ content: "Não falo de código com quem não é meu dono. Vai estudar.", ephemeral: true });
    }

    const requestData = {
      model: 'local-model',
      messages: [
        { role: "system", content: buildSystemPrompt(interaction.user.id, interaction.guildId, userRequest) },
        { role: "user", content: userRequest }
      ],
      temperature: config.temperature,
      max_tokens: 8192
    };

    await interaction.deferReply();

    axios.post(`${baseUrl}/chat/completions`, requestData, {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
      timeout: 120000
    }).then((response) => {
      logTimings(response.data, '(request)');
      const msgObj = response.data.choices[0].message;
      const rawContent = (msgObj.content || "").trim();
      interaction.editReply(processarResposta(rawContent));
    }).catch((error) => {
      console.error('Erro:', error.message);
      interaction.editReply("Deu BO de conexão com o modelo local. Tenta de novo.");
    });
  }

  if (interaction.commandName === 'reset') {
    try {
      contextMessages.set(contextId, []);
      const systemPromptText = buildSystemPrompt(interaction.user.id, interaction.guildId);
      contextMessages.get(contextId).push({ role: "system", content: systemPromptText });
      _contextLastSeen.set(contextId, Date.now());
      interaction.reply("A memória da conversa foi apagada com sucesso e as regras restabelecidas. Começando do zero!");
    } catch (error) {
      console.error('Erro:', error);
    }
  }

  if (interaction.commandName === 'directresponse') {
    try {
      if (!interaction.guild) return interaction.reply("Esse comando só faz sentido dentro de um servidor.");
      const rawValue = interaction.options.get('value').value;
      if (rawValue === undefined || rawValue === null || rawValue === "") return;

      const value = (rawValue === 'true' || rawValue === true);
      setDirectResponse(contextId, value);
      interaction.reply(`O modo de resposta direta para TODAS as mensagens do servidor foi definido como: ${value}`);
    } catch (error) {
      console.error('Erro:', error);
    }
  }

  if (interaction.commandName === 'help') {
    const help = "### Funcionalidades:\n- Marque o bot com @, chame pelo nome cadastrado no painel ou mande DM.\n- `!entrar` no chat de texto com você numa call: o bot entra, ouve e responde por voz.\n- /chat [mensagem]: Conversa mantendo a memória da sessão.\n- /request [mensagem]: Pergunta isolada (sem memória).\n- /reset: Apaga a memória do bot e recarrega as definições do app.\n- /directresponse [true/false]: Liga/desliga resposta para TODAS as mensagens do servidor.\n- /scan [canal] [limite]: Escaneia histórico e constrói perfis (só owner).";
    interaction.reply(help);
  }
});

client.login(process.env.TOKEN);