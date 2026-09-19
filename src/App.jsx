import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const MAX_LOGS = 2000;

// ============================================================
// AI PROVIDERS — APIs pagas OpenAI-compatible
// ============================================================
const AI_PROVIDERS = [
  { id: 'openai',     nome: 'OpenAI',       baseUrl: 'https://api.openai.com/v1',     keyHint: 'sk-...',     modelos: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'openrouter', nome: 'OpenRouter',   baseUrl: 'https://openrouter.ai/api/v1',  keyHint: 'sk-or-...',  modelos: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5', 'meta-llama/llama-3.1-70b-instruct'] },
  { id: 'groq',       nome: 'Groq',         baseUrl: 'https://api.groq.com/openai/v1', keyHint: 'gsk_...',   modelos: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  { id: 'deepseek',   nome: 'DeepSeek',     baseUrl: 'https://api.deepseek.com/v1',   keyHint: 'sk-...',     modelos: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'mistral',    nome: 'Mistral',      baseUrl: 'https://api.mistral.ai/v1',     keyHint: '...',        modelos: ['mistral-large-latest', 'mistral-small-latest'] },
  { id: 'together',   nome: 'Together AI',  baseUrl: 'https://api.together.xyz/v1',   keyHint: '...',        modelos: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'] },
  { id: 'custom',     nome: 'Custom (OpenAI-compatible)', baseUrl: '', keyHint: '', modelos: [] },
];

// ============================================================
// ÍCONES DE PLUGINS (mapeados pelo campo `icon` da extensão)
// ============================================================
const PLUGIN_ICONS = {
  globe: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />,
  microphone: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />,
  volume: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />,
  brain: (
    <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58 2.5 2.5 0 011.32-4.24 2.5 2.5 0 011.98-3A2.5 2.5 0 019.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58 2.5 2.5 0 00-1.32-4.24 2.5 2.5 0 00-1.98-3A2.5 2.5 0 0014.5 2z" />
    </g>
  ),
  default: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />,
};

// ============================================================
// MARKDOWN RENDERER (react-markdown + GFM + HTML cru)
// ============================================================
function MarkdownRenderer({ text }) {
  if (!text) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        h1: (props) => <h1 className="text-xl font-bold text-zinc-100 mt-6 mb-3" {...props} />,
        h2: (props) => <h2 className="text-lg font-semibold text-zinc-100 mt-5 mb-2" {...props} />,
        h3: (props) => <h3 className="text-base font-semibold text-zinc-200 mt-4 mb-2" {...props} />,
        h4: (props) => <h4 className="text-sm font-semibold text-zinc-200 mt-3 mb-2" {...props} />,
        p: (props) => <p className="text-zinc-400 text-[13px] leading-relaxed mb-3" {...props} />,
        a: (props) => <a className="text-emerald-400 hover:underline break-all" target="_blank" rel="noreferrer" {...props} />,
        ul: (props) => <ul className="list-disc list-inside space-y-1 text-zinc-400 ml-2 mb-3" {...props} />,
        ol: (props) => <ol className="list-decimal list-inside space-y-1 text-zinc-400 ml-2 mb-3" {...props} />,
        li: (props) => <li className="text-zinc-400 text-[13px] leading-relaxed" {...props} />,
        code: (props) => <code className="bg-zinc-800 text-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props} />,
        pre: (props) => (
          <pre
            className="bg-[#09090B] border border-zinc-800 rounded-md p-3 my-3 overflow-x-auto text-[11px] text-emerald-200 font-mono [&>code]:bg-transparent [&>code]:text-inherit [&>code]:p-0 [&>code]:text-[11px] [&>code]:rounded-none"
            {...props}
          />
        ),
        img: (props) => <img className="max-w-full h-auto rounded-md my-2 inline-block align-middle" loading="lazy" {...props} />,
        table: (props) => <div className="overflow-x-auto my-4"><table className="w-full border-collapse border border-zinc-800 text-[12px]" {...props} /></div>,
        thead: (props) => <thead className="bg-zinc-900/50" {...props} />,
        tbody: (props) => <tbody {...props} />,
        th: (props) => <th className="border border-zinc-800 px-3 py-2 text-left text-zinc-200 font-semibold" {...props} />,
        td: (props) => <td className="border border-zinc-800 px-3 py-2 text-zinc-400" {...props} />,
        blockquote: (props) => <blockquote className="border-l-2 border-emerald-500/40 pl-4 my-3 text-zinc-500 italic text-[13px]" {...props} />,
        hr: (props) => <hr className="border-zinc-800 my-6" {...props} />,
        strong: (props) => <strong className="text-zinc-200 font-semibold" {...props} />,
        em: (props) => <em className="text-zinc-300" {...props} />,
        details: (props) => <details className="my-3 text-zinc-400 text-[13px]" {...props} />,
        summary: (props) => <summary className="cursor-pointer text-zinc-300 font-medium hover:text-zinc-100" {...props} />,
        div: ({ node, ...props }) => <div {...props} />,
        span: ({ node, ...props }) => <span {...props} />,
        center: ({ node, ...props }) => <div className="text-center" {...props} />,
        br: () => <br />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ============================================================
// METADATA CHIPS (estilo HF)
// ============================================================
function ModelMetaChips({ details }) {
  if (!details) return null;
  const tags = (details.tags || []).map(t => t.toLowerCase());

  let params = null;
  const totalParams = details.safetensors?.total;
  if (totalParams) {
    const b = totalParams / 1e9;
    params = b >= 1 ? `${b.toFixed(0)}B` : `${(b * 1000).toFixed(0)}M`;
  } else {
    const pTag = tags.find(t => /^\d+(\.\d+)?b$/i.test(t));
    if (pTag) params = pTag.toUpperCase();
  }

  let arch = details.config?.model_type?.toLowerCase();
  if (!arch && details.config?.architectures?.[0]) {
    arch = details.config.architectures[0]
      .replace(/ForCausalLM|ForConditionalGeneration|ForSequenceClassification|Model/g, '')
      .toLowerCase();
  }
  if (!arch) arch = tags.find(t => /^(llama|qwen|gemma|mistral|phi|deepseek|nemotron|mixtral|olmo)/i.test(t))?.toLowerCase();

  const lang = details.cardData?.language?.[0];
  const domain = lang?.toLowerCase?.() || (tags.includes('code') ? 'code' : tags.includes('math') ? 'math' : null);

  const formats = [...new Set(tags.filter(t => ['gguf', 'mlx', 'safetensors', 'onnx', 'awq'].includes(t)))];

  const caps = [];
  if (tags.includes('vision') || tags.includes('image-text-to-text')) caps.push({ label: 'Vision', color: 'amber' });
  if (tags.includes('audio')) caps.push({ label: 'Audio', color: 'pink' });
  if (tags.includes('tool-use') || tags.includes('function-calling')) caps.push({ label: 'Tool Use', color: 'blue' });
  if (tags.includes('reasoning')) caps.push({ label: 'Reasoning', color: 'emerald' });
  if (tags.includes('code')) caps.push({ label: 'Code', color: 'cyan' });

  const capColors = {
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 border-b border-zinc-800/50">
      {params && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Params</span>
          <span className="text-zinc-200 font-semibold text-[12px]">{params}</span>
        </div>
      )}
      {arch && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Arch</span>
          <span className="bg-zinc-800 text-zinc-200 px-2 py-0.5 rounded text-[10px] font-semibold">{arch}</span>
        </div>
      )}
      {domain && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Domain</span>
          <span className="text-zinc-200 font-semibold text-[12px]">{domain}</span>
        </div>
      )}
      {formats.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Format</span>
          {formats.map(f => (
            <span key={f} className="bg-zinc-800 text-zinc-200 px-2 py-0.5 rounded text-[10px] font-semibold uppercase">{f}</span>
          ))}
        </div>
      )}
      {caps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Capabilities</span>
          {caps.map(c => (
            <span key={c.label} className={`border px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${capColors[c.color]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MORE FROM AUTHOR
// ============================================================
function MoreFromAuthor({ author, currentModelId, onSelect }) {
  const [models, setModels] = useState([]);

  useEffect(() => {
    if (!window.api) return;
    if (!author) { setModels([]); return; }
    let cancelled = false;
    fetch(`https://huggingface.co/api/models?author=${encodeURIComponent(author)}&limit=6&sort=downloads&direction=-1`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (cancelled) return;
        setModels(Array.isArray(data) ? data.filter(m => m.id !== currentModelId).slice(0, 5) : []);
      })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [author, currentModelId]);
  window.api.signalReady?.();
  if (models.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-zinc-800/50">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">More from {author}</h4>
      <div className="space-y-0.5">
        {models.map(m => {
          const name = m.id.split('/')[1] || m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelect && onSelect(m.id)}
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-zinc-800/50 transition-colors text-left gap-3"
            >
              <span className="text-[12px] text-emerald-400 hover:underline truncate">{name}</span>
              <span className="flex items-center gap-3 text-[11px] text-zinc-500 shrink-0 font-mono">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  {(m.downloads || 0).toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                  {(m.likes || 0).toLocaleString()}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// AVATAR COLORIDO
// ============================================================
function getAvatarColor(str) {
  const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-pink-600', 'bg-orange-600', 'bg-cyan-600', 'bg-rose-600', 'bg-indigo-600', 'bg-teal-600', 'bg-amber-600'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function AvatarBubble({ author, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm';
  if (failed) {
    return (
      <div className={`${sizeClass} ${getAvatarColor(author)} rounded-md shrink-0 flex items-center justify-center shadow-sm ring-1 ring-black/20`}>
        <span className="text-white font-bold uppercase tracking-tight">{author.charAt(0)}</span>
      </div>
    );
  }
  return (
    <div className={`${sizeClass} rounded-md shrink-0 overflow-hidden bg-zinc-800 ring-1 ring-zinc-800/80 shadow-sm flex items-center justify-center`}>
      <img src={`https://huggingface.co/api/avatars/${author}`} alt={author} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function App() {
  const [globalStatus, setGlobalStatus] = useState('offline');
  const [logs, setLogs] = useState(['> [SISTEMA] Interface carregada. Aguardando comandos...']);
  const [activeTab, setActiveTab] = useState('overview');
  const [engines, setEngines] = useState({
    'DISCORD-BOT': 'offline', 'IA-LOCAL': 'offline', 'SCRAPER': 'offline', 'OUVIDO-STT': 'offline', 'BOCA-TTS': 'offline'
  });
  const [extensionsList, setExtensionsList] = useState([]);
  const [pluginsModalOpen, setPluginsModalOpen] = useState(false);

  const [config, setConfig] = useState({
    systemPrompt: '', temperature: 0.7, ownerId: '', botNames: 'basilisco, bas, bot',
    ttsSpeed: 1.5, modelPath: '', gpuLayers: -1, contextSize: 4096,
    clientId: '', botToken: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [engineInfo, setEngineInfo] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoModel, setCopiadoModel] = useState(false);

  const [playgroundMessages, setPlaygroundMessages] = useState([]);
  const [playgroundInput, setPlaygroundInput] = useState('');
  const [isPlaygroundTyping, setIsPlaygroundTyping] = useState(false);

  const [hfSearchQuery, setHfSearchQuery] = useState('');
  const [hfSort, setHfSort] = useState('downloads');
  const [hfModels, setHfModels] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [modelDetails, setModelDetails] = useState(null);
  const [modelReadme, setModelReadme] = useState('');
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [hfFiles, setHfFiles] = useState([]);
  const [fileImpacts, setFileImpacts] = useState({});
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [downloads, setDownloads] = useState({});

  const [downloadsPanelOpen, setDownloadsPanelOpen] = useState(false);
  const [downloadsFilter, setDownloadsFilter] = useState('');

  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState([]);
  const [modelPickerFilter, setModelPickerFilter] = useState('');
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  // ============================================================
  // LLAMA MANAGER — states
  // ============================================================
  const [llamaInfo, setLlamaInfo] = useState(null);
  const [llamaLoading, setLlamaLoading] = useState(true);
  const [llamaInstalando, setLlamaInstalando] = useState(false);
  const [llamaStatus, setLlamaStatus] = useState(null);

  // ============================================================
  // SETUP — states
  // ============================================================
  const [portalAberto, setPortalAberto] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [validandoToken, setValidandoToken] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [tokenStatus, setTokenStatus] = useState(null);
  const [clientId, setClientId] = useState('');
  const [ownerId, setOwnerId] = useState('');

  // ============================================================
  // AUTO UPDATER — states
  // ============================================================
  const [updateInfo, setUpdateInfo] = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // ============================================================
  // AI PROVIDER — states
  // ============================================================
  const [aiConfig, setAiConfig] = useState({
    provider: 'local',
    model: '',
    baseUrl: 'https://api.openai.com/v1',
    hasKey: false,
  });
  const [selectedProviderId, setSelectedProviderId] = useState('openai');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyValidation, setKeyValidation] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [switchingProvider, setSwitchingProvider] = useState(false);

  const playgroundEndRef = useRef(null);
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);

  // ============================================================
  // DERIVADOS DE EXTENSÕES
  // ============================================================
  const enabledExtensions = extensionsList.filter(e => e.enabled !== false);
  const disabledExtensions = extensionsList.filter(e => e.enabled === false);

  const pushLog = (msg) => {
    const agora = new Date();
    const ts = agora.toLocaleTimeString('pt-BR', { hour12: false });
    setLogs((prev) => [...prev, `[${ts}] ${msg}`].slice(-MAX_LOGS));
  };

  const presets = [
    { id: 'alfred', nome: 'Alfred', desc: 'Mordomo formal, culto, altamente educado e profissional.', temp: 0.6, prompt: "O seu nome é Alfred. Você é um assistente virtual altamente formal, culto e cortês. Trate o usuário com extrema polidez, usando vocabulário refinado. Seja prestativo, mas mantenha uma postura rigorosamente profissional e distante." },
    { id: 'tecnico', nome: 'Tech Lead', desc: 'Engenheiro Sênior de Software. Foco 100% técnico em TI.', temp: 0.2, prompt: "Você é um Engenheiro de Software Sênior. Responda de forma extremamente técnica, estruturada e hiper-focada. Vá direto à lógica, sem saudações longas ou conversa fiada. Use jargões de TI de forma natural." },
    { id: 'analista', nome: 'Analista', desc: 'Assistente racional, analítico e focado em tomada de decisão.', temp: 0.4, prompt: "Você é um assistente virtual analítico e racional. Avalie cuidadosamente as informações apresentadas antes de responder. Priorize fatos, lógica, evidências e consequências. Ao comparar alternativas, apresente vantagens, desvantagens, riscos e benefícios de maneira objetiva. Evite opiniões sem justificativa e deixe claras as limitações das informações disponíveis." },
    { id: 'criativo', nome: 'Criativo', desc: 'Assistente voltado para ideias, criação e exploração de possibilidades.', temp: 0.9, prompt: "Você é um assistente virtual criativo e imaginativo. Seu objetivo é ajudar o usuário a desenvolver ideias, conceitos e soluções originais. Explore diferentes possibilidades e não tenha medo de propor abordagens incomuns quando forem adequadas. Mantenha coerência com o contexto e transforme ideias vagas em propostas concretas e utilizáveis." },
    { id: 'amigavel', nome: 'Amigável', desc: 'Assistente descontraído, acessível e fácil de conversar.', temp: 0.7, prompt: "Você é um assistente virtual amigável, descontraído e acessível. Converse de maneira natural e acolhedora, utilizando linguagem simples e informal. Demonstre interesse genuíno pelo que o usuário está dizendo. Seja prestativo sem parecer excessivamente formal ou artificial. Adapte sua linguagem ao estilo do usuário." },
    { id: 'professor', nome: 'Professor', desc: 'Assistente didático, paciente e focado em ensinar.', temp: 0.5, prompt: "Você é um professor virtual paciente e didático. Seu objetivo principal é ajudar o usuário a compreender os assuntos apresentados. Explique conceitos de maneira progressiva, começando pelo básico quando necessário e aumentando a complexidade conforme o contexto. Utilize exemplos práticos e analogias quando forem úteis. Não entregue apenas respostas prontas quando uma explicação puder ajudar o usuário a aprender." }
  ];

  const aplicarPreset = (preset) => setConfig((prev) => ({ ...prev, systemPrompt: preset.prompt, temperature: preset.temp }));

  // ============================================================
  // LISTENERS IPC
  // ============================================================
  useEffect(() => {
    if (!window.api) return;
    const handleLog = (msg) => pushLog(msg);
    const handleErrorLog = (msg) => pushLog(msg);
    const handleStatus = (status) => setGlobalStatus(status);
    const handleEngineStatus = (engine, status) => setEngines((prev) => ({ ...prev, [engine]: status }));

    const handleDownloadProgress = (data) => {
      setDownloads(prev => ({
        ...prev,
        [data.filename]: {
          ...(prev[data.filename] || { startedAt: Date.now() }),
          progress: data.progress,
          speed: data.speed || 0,
          downloaded: data.downloaded || 0,
          total: data.total || 0,
          status: 'downloading',
        }
      }));
    };
    const handleDownloadComplete = (data) => {
      setDownloads(prev => ({
        ...prev,
        [data.filename]: { ...(prev[data.filename] || {}), progress: 100, status: 'completed', completedAt: Date.now(), path: data.path }
      }));
      setConfig(prev => {
        const newConfig = { ...prev, modelPath: data.path };
        window.api.saveConfig(newConfig);
        return newConfig;
      });
      pushLog(`> [DOWNLOADER] Sucesso! ${data.filename} foi salvo e definido como motor atual.`);
    };
    const handleDownloadError = (data) => {
      setDownloads(prev => ({
        ...prev,
        [data.filename]: { ...(prev[data.filename] || {}), progress: 0, status: 'error', error: data.error }
      }));
      if (data.error !== 'Cancelado') {
        pushLog(`> [DOWNLOADER ERRO] Falha em ${data.filename}: ${data.error || 'desconhecido'}`);
      }
    };

    window.api.onLog(handleLog);
    window.api.onErrorLog(handleErrorLog);
    window.api.onStatusUpdate(handleStatus);
    window.api.onEngineStatus(handleEngineStatus);
    if (window.api.onDownloadProgress) {
      window.api.onDownloadProgress(handleDownloadProgress);
      window.api.onDownloadComplete(handleDownloadComplete);
      window.api.onDownloadError(handleDownloadError);
    }
    window.api.getConfig().then((data) => { if (data) setConfig((prev) => ({ ...prev, ...data })); });

    // Carrega config do provedor IA
    if (window.api.getAiConfig) {
      window.api.getAiConfig().then((c) => {
        if (c?.ok) {
          setAiConfig(c);
          const match = AI_PROVIDERS.find((p) => p.baseUrl && p.baseUrl === c.baseUrl);
          setSelectedProviderId(match ? match.id : 'custom');
        }
      }).catch(() => {});
    }

    // Token status inicial
    window.api.getTokenStatus?.().then?.(status => setTokenStatus(status || null)).catch(() => {});

    if (window.api.listExtensions) {
      window.api.listExtensions().then(list => setExtensionsList(Array.isArray(list) ? list : []));
    }

    // ============================================================
    // LISTENER: Portal do Discord fechado
    // ============================================================
    if (window.api?.onDiscordPortalClosed) {
      window.api.onDiscordPortalClosed(() => {
        console.log('[PORTAL] Evento de fechamento recebido');
        setPortalAberto(false);
        pushLog('> [SISTEMA] Portal do Discord fechado.');
      });
    }

    // ============================================================
    // LISTENER: Auto-updater
    // ============================================================
    if (window.api?.onUpdateStatus) {
      window.api.onUpdateStatus((data) => {
        setUpdateInfo(data);
        if (data.tipo === 'available')     pushLog(`> [UPDATER] Nova versão disponível: v${data.info?.version}`);
        if (data.tipo === 'downloaded')    pushLog(`> [UPDATER] Update baixado: v${data.info?.version} — pronto pra instalar`);
        if (data.tipo === 'up-to-date')    pushLog('> [UPDATER] Já está na última versão.');
        if (data.tipo === 'error')         pushLog(`> [UPDATER ERRO] ${data.error}`);
      });
    }

    // Pega a versão do app
    if (window.api?.getAppVersion) {
      window.api.getAppVersion().then((r) => {
        if (r?.version) setAppVersion(r.version);
      }).catch(() => {});
    }

    return () => {
      window.api.offLog?.();
      window.api.offErrorLog?.();
      window.api.offStatusUpdate?.();
      window.api.offEngineStatus?.();
      window.api.offDownloadProgress?.();
      window.api.offDownloadComplete?.();
      window.api.offDownloadError?.();
      window.api.offDiscordPortalClosed?.();
      window.api.offUpdateStatus?.();
    };
  }, []);

  // Sincroniza clientId/ownerId a partir do config carregado
  useEffect(() => {
    if (config.clientId && !clientId) setClientId(config.clientId);
    if (config.ownerId && !ownerId) setOwnerId(config.ownerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.clientId, config.ownerId]);

  const hasActiveDownload = Object.values(downloads).some(d => d.status === 'downloading');
  useEffect(() => {
    if (hasActiveDownload) setDownloadsPanelOpen(true);
  }, [hasActiveDownload]);

  
  useEffect(() => {
    if (!modelPickerOpen || !window.api?.listDownloadedModels) return;
    window.api.listDownloadedModels().then(list => setDownloadedModels(list || []));
  }, [modelPickerOpen]);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setModelPickerOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom || logs.length <= 1) container.scrollTop = container.scrollHeight;
  }, [logs]);

  useEffect(() => { playgroundEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [playgroundMessages, isPlaygroundTyping]);

  // ============================================================
  // LLAMA MANAGER — detecção no boot
  // ============================================================
  const detectarLlama = async () => {
    if (!window.api?.llamaDetect) {
      setLlamaLoading(false);
      return;
    }
    setLlamaLoading(true);
    try {
      const info = await window.api.llamaDetect();
      console.log('[LLAMA] Detecção:', info);
      setLlamaInfo(info);
      pushLog(`> [LLAMA] GPU: ${info.gpu?.nome || '?'} | Build: ${info.buildRecomendado?.label || '?'} | Instalado: ${info.instalado ? 'sim' : 'não'}`);
    } catch (e) {
      console.error('[LLAMA] Erro na detecção:', e);
      pushLog(`> [LLAMA ERRO] ${e.message}`);
    } finally {
      setLlamaLoading(false);
    }
  };

  const instalarLlama = async () => {
    if (!window.api?.llamaDownload || !llamaInfo?.buildRecomendado) return;
    setLlamaInstalando(true);
    setLlamaStatus({ etapa: 'iniciando', msg: 'Iniciando...', pct: 0 });

    try {
      const result = await window.api.llamaDownload(llamaInfo.buildRecomendado.tipo);
      if (!result.ok) {
        setLlamaStatus({ etapa: 'erro', msg: result.error || 'Falha no download' });
        setLlamaInstalando(false);
        return;
      }
      pushLog(`> [LLAMA] Instalado: ${result.tag} (${result.label})`);
      setLlamaStatus({ etapa: 'completo', msg: 'Instalação concluída!', pct: 100 });
      await detectarLlama();
    } catch (e) {
      setLlamaStatus({ etapa: 'erro', msg: e.message });
    } finally {
      setLlamaInstalando(false);
    }
  };

  useEffect(() => {
    if (!window.api?.onLlamaDownloadStatus) return;
    window.api.onLlamaDownloadStatus((status) => {
      setLlamaStatus(status);
    });
    return () => {
      window.api.offLlamaDownloadStatus?.();
    };
  }, []);

  useEffect(() => {
    detectarLlama();
  }, []);

  // ============================================================
  // SETUP — funções
  // ============================================================
  const abrirPortalDiscord = async () => {
    if (!window.api?.discordPortalOpen) return;
    const r = await window.api.discordPortalOpen();
    if (r.ok) setPortalAberto(true);
  };

  const fecharPortalDiscord = async () => {
    if (!window.api?.discordPortalClose) return;
    await window.api.discordPortalClose();
    setPortalAberto(false);
  };

  const validarToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setValidandoToken(true);
    setTokenInfo(null);
    try {
      if (!window.api?.validarTokenDiscord) {
        setTokenInfo({ ok: false, error: 'Validador não disponível.' });
        return;
      }
      const res = await window.api.validarTokenDiscord(token);
      setTokenInfo(res || { ok: false, error: 'Resposta inválida' });
    } catch (e) {
      setTokenInfo({ ok: false, error: e?.message || 'Falha ao validar' });
    } finally {
      setValidandoToken(false);
    }
  };

  const salvarCredenciais = async () => {
    // Salva token no .env (se validado com sucesso)
    if (tokenInput.trim() && tokenInfo?.ok && window.api?.saveDiscordToken) {
      const r = await window.api.saveDiscordToken(tokenInput.trim());
      if (r.ok) {
        setTokenStatus({ configurado: true });
        setTokenInput('');
        pushLog('> [SISTEMA] Token salvo no .env');
      }
    }

    // Salva clientId e ownerId no config
    const novoConfig = {
      ...config,
      clientId: clientId.trim() || config.clientId,
      ownerId: ownerId.trim() || config.ownerId,
    };
    setConfig(novoConfig);
    await window.api?.saveConfig?.(novoConfig);
    pushLog('> [SETUP] Credenciais salvas.');
  };

  // ============================================================
  // AI PROVIDER — handlers
  // ============================================================
  const handleSelectProvider = (id) => {
    setSelectedProviderId(id);
    const p = AI_PROVIDERS.find((x) => x.id === id);
    if (p && p.baseUrl) setAiConfig((prev) => ({ ...prev, baseUrl: p.baseUrl }));
    setKeyValidation(null);
    setAvailableModels([]);
  };

  const handleValidateKey = async () => {
    const key = apiKeyInput.trim();
    if (!key || !aiConfig.baseUrl) return;
    setValidatingKey(true);
    setKeyValidation(null);
    try {
      const r = await window.api.validateApiKey({ baseUrl: aiConfig.baseUrl, apiKey: key });
      setKeyValidation(r);
      if (r.ok) setAvailableModels(r.models || []);
    } catch (e) {
      setKeyValidation({ ok: false, error: e?.message || 'Falha' });
    } finally {
      setValidatingKey(false);
    }
  };

  const handleSaveAiConfig = async () => {
    try {
      await window.api.saveAiConfig({
        provider: aiConfig.provider,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
        apiKey: apiKeyInput.trim() || undefined,
      });
      setAiConfig((prev) => ({ ...prev, hasKey: prev.hasKey || !!apiKeyInput.trim() }));
      setApiKeyInput('');
      pushLog('> [SISTEMA] Config de provedor IA salva.');
    } catch (e) {
      pushLog(`> [ERRO] Falha ao salvar provedor: ${e?.message ?? e}`);
    }
  };

  const handleSwitchProvider = async () => {
    setSwitchingProvider(true);
    try {
      await window.api.saveAiConfig({
        provider: aiConfig.provider,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
        apiKey: apiKeyInput.trim() || undefined,
      });
      setAiConfig((prev) => ({ ...prev, hasKey: prev.hasKey || !!apiKeyInput.trim() }));
      setApiKeyInput('');
      await window.api.switchProvider();
      pushLog('> [SISTEMA] Engine IA reiniciada com novo provedor.');
    } catch (e) {
      pushLog(`> [ERRO] Falha ao reiniciar engine: ${e?.message ?? e}`);
    } finally {
      setSwitchingProvider(false);
    }
  };

  // ============================================================
  // TELEMETRIA — /health + hardware real
  // ============================================================
  useEffect(() => {
    if (globalStatus !== 'online') { setEngineInfo(null); return; }
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const [health, hw] = await Promise.all([
          fetch('http://localhost:1234/health')
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
          window.api?.getHardwareInfo?.().catch(() => null) ?? Promise.resolve(null),
        ]);
        if (cancelled) return;

        const gpu = hw?.gpus?.[0];
        let vramFreeMb = null;
        if (gpu?.vramFree && gpu.vramFree !== 'N/A') {
          vramFreeMb = parseInt(String(gpu.vramFree).replace(/[^\d]/g, ''), 10) || null;
        }

        setEngineInfo({
          status: health?.status || 'ok',
          vram_free_mb: vramFreeMb,
          vram_total: gpu?.vramTotal || null,
          model: health?.model || null,
        });
      } catch {}
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [globalStatus]);

  // ============================================================
  // HF API
  // ============================================================
  const searchHuggingFace = async () => {
    if (!hfSearchQuery.trim()) return;
    setIsSearching(true);
    setHfModels([]);
    setSelectedModelId(null);
    setModelDetails(null);
    setModelReadme('');
    setHfFiles([]);
    setFileImpacts({});
    try {
      const res = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(hfSearchQuery)}&filter=gguf&sort=${hfSort}&direction=-1&limit=20`);
      if (!res.ok) throw new Error("Falha ao buscar modelos");
      const data = await res.json();
      setHfModels(data);
    } catch (err) {
      pushLog(`> [HUB ERRO] ${err.message}`);
    } finally { setIsSearching(false); }
  };

  const selectModel = async (modelId) => {
    setSelectedModelId(modelId);
    setIsLoadingDetails(true);
    setModelDetails(null);
    setModelReadme('');
    setHfFiles([]);
    setFileImpacts({});
    try {
      const detailsRes = await fetch(`https://huggingface.co/api/models/${modelId}?blobs=true`);
      const details = detailsRes.ok ? await detailsRes.json() : null;
      setModelDetails(details);
      try {
        const readmeRes = await fetch(`https://huggingface.co/${modelId}/raw/main/README.md`);
        if (readmeRes.ok) {
          const raw = await readmeRes.text();
          setModelReadme(raw.replace(/^---[\s\S]*?---\n/, ''));
        }
      } catch {}
      setIsFetchingFiles(true);
      const treeRes = await fetch(`https://huggingface.co/api/models/${modelId}/tree/main`);
      if (treeRes.ok) {
        const tree = await treeRes.json();
        const ggufs = tree.filter(file => file.path.endsWith('.gguf')).map(file => {
          const rawGB = file.size ? (file.size / (1024 * 1024 * 1024)).toFixed(2) : 0;
          return {
            filename: file.path,
            size: file.size ? rawGB + ' GB' : 'Desconhecido',
            rawGB: parseFloat(rawGB),
            url: `https://huggingface.co/${modelId}/resolve/main/${file.path}?download=true`
          };
        });
        setHfFiles(ggufs);

        if (window.api?.evaluateModelImpact) {
          const impacts = {};
          for (const file of ggufs) {
            if (file.rawGB > 0) {
              impacts[file.filename] = await window.api.evaluateModelImpact(file.rawGB);
            }
          }
          setFileImpacts(impacts);
        }
      }
    } catch (err) {
      pushLog(`> [HUB ERRO] ${err.message}`);
    } finally { setIsLoadingDetails(false); setIsFetchingFiles(false); }
  };

  const startDownload = (url, filename) => {
    if (!window.api.downloadModel) { pushLog("> [ERRO] downloadModel não configurado no preload.js."); return; }
    setDownloads(prev => ({ ...prev, [filename]: { progress: 0, status: 'downloading', startedAt: Date.now(), speed: 0, downloaded: 0, total: 0 } }));
    setDownloadsPanelOpen(true);
    window.api.downloadModel(url, filename);
  };

  const removeDownload = (filename) => {
    if (window.api?.cancelDownload) {
      window.api.cancelDownload(filename);
    }
    setDownloads(prev => {
      const n = { ...prev };
      delete n[filename];
      return n;
    });
  };

  const copiarNomeModelo = async () => {
    if (!selectedModelId) return;
    try {
      await navigator.clipboard.writeText(selectedModelId);
      setCopiadoModel(true);
      setTimeout(() => setCopiadoModel(false), 1500);
    } catch {}
  };

  // ============================================================
  // CONTROLES
  // ============================================================
  const iniciar = () => window.api?.startBot();
  const parar = () => window.api?.stopBot();

  const recarregarPlugins = () => {
    if (!window.api?.listExtensions) return;
    window.api.listExtensions().then(list => {
      setExtensionsList(Array.isArray(list) ? list : []);
      pushLog(`> [SISTEMA] Plugins recarregados (${Array.isArray(list) ? list.length : 0} encontrados).`);
    });
  };

  // ============================================================
  // AUTO UPDATER — handler
  // ============================================================
  const checkUpdates = async () => {
    if (!window.api?.checkForUpdates) return;
    setCheckingUpdate(true);
    try {
      const r = await window.api.checkForUpdates();
      if (!r.ok) {
        pushLog(`> [UPDATER] ${r.error || 'Falha ao checar updates.'}`);
      } else if (r.info?.version && r.info.version !== appVersion) {
        pushLog(`> [UPDATER] Versão disponível: v${r.info.version}`);
      } else {
        pushLog('> [UPDATER] Já está na última versão.');
      }
    } catch (e) {
      pushLog(`> [UPDATER ERRO] ${e?.message ?? e}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const toggleExtension = async (filename, enabled) => {
    if (!window.api?.toggleExtension) {
      pushLog(`> [ERRO] toggleExtension não configurado no preload.js.`);
      return;
    }
    const res = await window.api.toggleExtension(filename, enabled);
    if (res?.ok) {
      const list = await window.api.listExtensions();
      setExtensionsList(Array.isArray(list) ? list : []);
      pushLog(`> [SISTEMA] Plugin ${enabled ? 'ativado' : 'desativado'}: ${filename}`);
    } else {
      pushLog(`> [ERRO] Falha ao alterar plugin: ${res?.error || 'desconhecido'}`);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try { await window.api?.saveConfig(config); }
    catch (err) { pushLog(`> [ERRO] Falha ao salvar configuração: ${err?.message ?? err}`); }
    finally { setTimeout(() => setIsSaving(false), 600); }
  };

  const handleLoadModel = async (modelPath) => {
    if (!window.api?.loadAiModel) return;
    setIsLoadingModel(true);
    try {
      await window.api.loadAiModel(modelPath);
      setConfig(prev => ({ ...prev, modelPath }));
      setModelPickerOpen(false);
    } catch (err) {
      pushLog(`> [ERRO] Falha ao carregar modelo: ${err?.message ?? err}`);
    } finally {
      setIsLoadingModel(false);
    }
  };

  const handleUnloadModel = async () => {
    if (!window.api?.unloadAiModel) return;
    setIsLoadingModel(true);
    try {
      await window.api.unloadAiModel();
      setModelPickerOpen(false);
    } catch (err) {
      pushLog(`> [ERRO] Falha ao descarregar modelo: ${err?.message ?? err}`);
    } finally {
      setIsLoadingModel(false);
    }
  };

  const limparLogs = () => setLogs(['> [SISTEMA] Logs limpos.']);
  const copiarLogs = async () => {
    try { await navigator.clipboard.writeText(logs.join('\n')); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch {}
  };

  // ============================================================
  // PLAYGROUND
  // ============================================================
  const handleSendPlayground = async () => {
    if (!playgroundInput.trim() || isPlaygroundTyping) return;
    const newUserMsg = { role: 'user', content: playgroundInput };
    const newHistory = [...playgroundMessages, newUserMsg];
    setPlaygroundMessages(newHistory);
    setPlaygroundInput('');
    setIsPlaygroundTyping(true);

    try {
      const payload = {
        messages: [{ role: 'system', content: config.systemPrompt || "Você é um assistente útil e direto." }, ...newHistory],
        temperature: config.temperature ?? 0.7, max_tokens: 1024
      };
      const res = await fetch('http://localhost:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const timings = data.timings || {};
      const completionTokens = data.usage?.completion_tokens || 0;
      const promptTokens = data.usage?.prompt_tokens || 0;

      let genTps = 0;
      let promptTps = 0;
      let genMs = 0;
      let promptMs = 0;

      if (timings.predicted_per_second) {
        genTps = timings.predicted_per_second;
        promptTps = timings.prompt_per_second || 0;
        genMs = timings.predicted_ms || 0;
        promptMs = timings.prompt_ms || 0;
      } else {
        genTps = completionTokens;
        promptTps = 0;
      }

      if (completionTokens > 0 && genTps > 0) {
        pushLog(`[METRICA] Geração: ${genTps.toFixed(1)} t/s (${genMs.toFixed(0)}ms, ${completionTokens} tokens) | Prompt: ${promptTps.toFixed(0)} t/s (${promptMs.toFixed(0)}ms, ${promptTokens} tokens)`);
      } else {
        pushLog(`[METRICA] Resposta recebida: ${completionTokens} tokens gerados | ${promptTokens} tokens de prompt (sem timings do servidor)`);
      }

      setPlaygroundMessages([...newHistory, {
        role: 'assistant',
        content: data.choices[0].message.content,
      }]);
    } catch {
      setPlaygroundMessages([...newHistory, { role: 'assistant', content: "⚠️ **Falha de Conexão:** O Start Server foi iniciado?" }]);
    } finally { setIsPlaygroundTyping(false); }
  };

  const handleKeyPress = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendPlayground(); } };
  const limparPlayground = () => setPlaygroundMessages([]);

  const downloadEntries = Object.entries(downloads)
    .filter(([filename]) => !downloadsFilter || filename.toLowerCase().includes(downloadsFilter.toLowerCase()))
    .sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));
  const activeDownloads = downloadEntries.filter(([, d]) => d.status === 'downloading');
  const completedDownloads = downloadEntries.filter(([, d]) => d.status === 'completed');
  const errorDownloads = downloadEntries.filter(([, d]) => d.status === 'error');

  const clearCompleted = () => {
    setDownloads(prev => {
      const next = { ...prev };
      for (const [filename, d] of Object.entries(next)) if (d.status === 'completed') delete next[filename];
      return next;
    });
  };

  const filteredDownloadedModels = downloadedModels.filter(m =>
    !modelPickerFilter || m.name.toLowerCase().includes(modelPickerFilter.toLowerCase())
  );
  const isModelLoaded = (modelPath) => {
    if (!config.modelPath) return false;
    return config.modelPath.toLowerCase() === modelPath.toLowerCase();
  };
  const iaOnline = engines['IA-LOCAL'] === 'online';

  const motores = [
    { id: 'DISCORD-BOT', nome: 'Discord Bot', desc: 'Orquestração Das conexões WebSocket.', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
    { id: 'IA-LOCAL', nome: 'Local AI Engine', desc: 'Motor I.A embutido.', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /> },
  ];

  const getStatusDot = (status) => status === 'online' ? 'bg-emerald-500' : status === 'loading' ? 'bg-amber-500' : 'bg-zinc-600';

  const isFullHeightTab = activeTab === 'hub' || activeTab === 'playground';
  const showLogs = activeTab === 'overview';
  const currentModelName = config.modelPath ? config.modelPath.split(/[\\/]/).pop() : null;

  // ============================================================
  // DERIVADOS AI PROVIDER
  // ============================================================
  const isApiMode = aiConfig.provider !== 'local';
  const apiProviderLabel = AI_PROVIDERS.find((p) => p.id === selectedProviderId)?.nome || aiConfig.provider;

  return (
    <div className="flex h-screen bg-[#0E0E11] text-zinc-300 font-sans overflow-hidden selection:bg-blue-500/30">

      <aside className="w-64 bg-[#18181B] border-r border-zinc-800/50 flex flex-col justify-between z-20 shrink-0">
        <div>
          <div className="p-5 flex items-center gap-3 border-b border-zinc-800/50">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
            <div>
              <h1 className="font-semibold text-zinc-100 text-sm leading-tight">LocalBot Studio</h1>
              <p className="text-zinc-500 text-[11px] font-medium tracking-wide">VERSION {appVersion || '0.9.4'}</p>
            </div>
          </div>
          <div className="p-3 flex flex-col gap-0.5">
            <p className="text-[11px] font-semibold text-zinc-500 px-3 py-2 mt-1 tracking-wider">MENU</p>
            {[
              { id: 'overview', label: 'Overview', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path> },
              { id: 'playground', label: 'Playground', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path> },
              { id: 'hub', label: 'Model Hub', accent: true, icon: (
                <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="M12 2v2M8 4h8a2 2 0 012 2v5M8 4a2 2 0 00-2 2v6a2 2 0 002 2h3" />
                  <path d="M9 9h.01M13 9h.01" />
                  <path d="M21 21l-3-3m1-4a5 5 0 11-10 0 5 5 0 0110 0z" />
                </g>
              ) },
              { id: 'model', label: 'Local Engine', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path> },
              { id: 'setup', label: 'Setup', icon: (
                <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </g>
              )},
              { id: 'config', label: 'Identity', icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? (tab.accent ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800/80 text-zinc-100')
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{tab.icon}</svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-zinc-800/50 flex flex-col gap-2.5">
          <button onClick={iniciar} disabled={globalStatus === 'online' || globalStatus === 'loading'} className="w-full flex items-center justify-center bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-900 text-sm font-semibold py-2 rounded-md transition-colors">Start Server</button>
          <button onClick={parar} disabled={globalStatus === 'offline'} className="w-full flex items-center justify-center bg-transparent border border-zinc-700 hover:bg-zinc-800 disabled:border-zinc-800/50 disabled:text-zinc-600 text-zinc-300 text-sm font-semibold py-2 rounded-md transition-colors">Stop Server</button>

          <button
            onClick={checkUpdates}
            disabled={checkingUpdate}
            className="w-full flex items-center justify-center gap-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-50 transition-colors py-1 mt-1"
            title={appVersion ? `Versão atual: v${appVersion}` : 'Checar atualizações'}
          >
            <svg className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            {checkingUpdate ? 'Checando...' : `v${appVersion || '...'}`}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Banners de atualização */}
        {updateInfo?.tipo === 'checking' && (
          <div className="bg-zinc-800/40 border-b border-zinc-800 px-4 py-1.5 flex items-center justify-center gap-2 text-[12px] shrink-0">
            <svg className="animate-spin w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span className="text-zinc-400">Checando atualizações...</span>
          </div>
        )}

        {updateInfo?.tipo === 'available' && (
          <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 flex items-center justify-center gap-3 text-sm shrink-0">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            <span className="text-blue-300">
              Atualização disponível: <strong>v{updateInfo.info?.version}</strong> — baixando...
            </span>
          </div>
        )}

        {updateInfo?.tipo === 'progress' && (
          <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 shrink-0">
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-between text-[11px] text-blue-300 mb-1">
                <span className="font-medium">Baixando atualização...</span>
                <span className="font-mono">{updateInfo.percent?.toFixed(1)}%</span>
              </div>
              <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${updateInfo.percent || 0}%` }} />
              </div>
            </div>
          </div>
        )}

        {updateInfo?.tipo === 'downloaded' && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2.5 flex items-center justify-center gap-3 text-sm shrink-0">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span className="text-emerald-300">
              Atualização <strong>v{updateInfo.info?.version}</strong> pronta pra instalar.
            </span>
            <button
              onClick={() => window.api.installUpdate()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded transition-colors"
            >
              Reiniciar e instalar
            </button>
            <button
              onClick={() => setUpdateInfo(null)}
              className="text-emerald-400/70 hover:text-emerald-300 text-xs"
            >
              Depois
            </button>
          </div>
        )}

        {updateInfo?.tipo === 'error' && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 flex items-center justify-center gap-3 text-sm shrink-0">
            <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span className="text-rose-300">Falha ao atualizar: {updateInfo.error}</span>
            <button
              onClick={() => setUpdateInfo(null)}
              className="text-rose-400/70 hover:text-rose-300 text-xs"
            >
              Fechar
            </button>
          </div>
        )}

        {/* TOP BAR */}
        <div className="h-14 px-4 flex items-center justify-center gap-2 border-b border-zinc-800/50 bg-[#0E0E11] shrink-0">
          <button
            onClick={() => !isApiMode && setModelPickerOpen(true)}
            disabled={isApiMode}
            title={isApiMode ? `${apiProviderLabel} / ${aiConfig.model || '—'}` : (iaOnline && currentModelName ? currentModelName : 'Select a model to load')}
            className={`group flex items-center gap-2 px-4 py-2 rounded-lg border transition-all max-w-2xl min-w-0 ${
              isApiMode
                ? 'bg-blue-500/5 border-blue-500/30 cursor-default'
                : iaOnline
                  ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50'
                  : 'bg-[#18181B] border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
              isApiMode ? 'bg-blue-500/20 text-blue-400' : iaOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
              </svg>
            </div>
            <span className={`text-sm font-medium truncate min-w-0 ${isApiMode ? 'text-blue-300' : iaOnline ? 'text-emerald-300' : 'text-zinc-400'}`}>
              {isApiMode ? `${apiProviderLabel} · ${aiConfig.model || 'sem modelo'}` : (iaOnline && currentModelName ? currentModelName : 'Select a model to load')}
            </span>
            {!isApiMode && <span className="text-[10px] text-zinc-600 font-mono ml-1 shrink-0">(Ctrl+L)</span>}
            {!isApiMode && (
              <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            )}
          </button>

          {iaOnline && !isApiMode && (
            <button
              onClick={handleUnloadModel}
              disabled={isLoadingModel}
              title="Descarregar IA da VRAM"
              className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50 shrink-0"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0119 12a7 7 0 11-11.41-5.42L6.17 5.17A9 9 0 1021 12c0-2.4-.95-4.58-2.5-6.83z"/>
              </svg>
            </button>
          )}
        </div>

        <div className={`flex-1 min-h-0 ${isFullHeightTab ? 'flex flex-col p-8' : 'overflow-y-auto p-8 custom-scrollbar'}`}>

          {/* Aba Overview */}
          {activeTab === 'overview' && (
            <div className="max-w-5xl mx-auto animate-in fade-in duration-300">
              <header className="mb-8 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-100 mb-1">Local Services</h2>
                  <p className="text-zinc-500 text-sm">Manage and monitor running background processes.</p>
                </div>
                <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-md border border-zinc-800">
                  <span className={`w-2 h-2 rounded-full ${getStatusDot(globalStatus)}`}></span>
                  <span className="text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">{globalStatus}</span>
                </div>
              </header>

              {/* ============================================================ */}
              {/* CARD: LLAMA SERVER STATUS                                     */}
              {/* ============================================================ */}
              <div className="mb-8">
                {llamaLoading && (
                  <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-5 flex items-center gap-3">
                    <svg className="animate-spin w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span className="text-sm text-zinc-400">Detectando hardware...</span>
                  </div>
                )}

                {!llamaLoading && llamaInfo && (
                  <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-5">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-md flex items-center justify-center border shrink-0 ${
                          llamaInfo.instalado
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        }`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-zinc-200 flex items-center gap-2 flex-wrap">
                            Llama Server
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              llamaInfo.instalado
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {llamaInfo.instalado ? 'Instalado' : 'Não instalado'}
                            </span>
                          </h3>
                          <p className="text-sm text-zinc-500 mt-0.5 truncate">
                            {llamaInfo.gpu?.nome || 'GPU desconhecida'}
                            {llamaInfo.gpu?.driver && ` • driver ${llamaInfo.gpu.driver}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {llamaInfo.instalado ? (
                          <>
                            <div className="text-right mr-2">
                              <p className="text-[11px] text-zinc-400 font-mono">
                                {llamaInfo.instalado.label}
                              </p>
                              <p className="text-[10px] text-zinc-600 font-mono">
                                {llamaInfo.instalado.tag}
                              </p>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('Desinstalar o llama-server? Você vai precisar baixar de novo pra usar o bot.')) return;
                                await window.api.llamaUninstall();
                                pushLog('> [LLAMA] llama-server desinstalado');
                                await detectarLlama();
                              }}
                              title="Desinstalar llama-server"
                              className="p-2 rounded-md border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"></path>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={instalarLlama}
                            disabled={llamaInstalando}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors"
                          >
                            {llamaInstalando ? 'Instalando...' : 'Instalar'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs pt-4 border-t border-zinc-800/50">
                      <div>
                        <p className="text-zinc-500 uppercase text-[10px] font-semibold mb-1">Vendor</p>
                        <p className="text-zinc-300">{llamaInfo.gpu?.vendor || '?'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 uppercase text-[10px] font-semibold mb-1">Compute</p>
                        <p className="text-zinc-300">{llamaInfo.gpu?.sm ? `sm_${llamaInfo.gpu.sm}` : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 uppercase text-[10px] font-semibold mb-1">Build recomendado</p>
                        <p className="text-zinc-300">{llamaInfo.buildRecomendado?.label || '?'}</p>
                      </div>
                    </div>

                    {llamaInstalando && llamaStatus && (
                      <div className="mt-4 pt-4 border-t border-zinc-800/50">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-zinc-400 truncate pr-3">{llamaStatus.msg || 'Baixando...'}</span>
                          {llamaStatus.pct !== undefined && (
                            <span className="text-emerald-400 font-mono shrink-0">{llamaStatus.pct}%</span>
                          )}
                        </div>
                        {llamaStatus.pct !== undefined && (
                          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${llamaStatus.pct}%` }}
                            />
                          </div>
                        )}
                        {llamaStatus.baixado && llamaStatus.total && (
                          <p className="text-[10px] text-zinc-500 mt-2 font-mono">
                            {(llamaStatus.baixado / 1e6).toFixed(0)} MB / {(llamaStatus.total / 1e6).toFixed(0)} MB
                          </p>
                        )}
                      </div>
                    )}

                    {llamaStatus?.etapa === 'erro' && !llamaInstalando && (
                      <div className="mt-4 pt-4 border-t border-zinc-800/50">
                        <p className="text-xs text-rose-400">❌ {llamaStatus.msg}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {motores.map((motor) => (
                  <div key={motor.id} className="bg-[#18181B] border border-zinc-800/80 hover:border-zinc-700 rounded-lg p-5 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`w-9 h-9 rounded-md flex items-center justify-center border ${engines[motor.id] === 'online' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-zinc-800/50 border-zinc-800 text-zinc-500'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{motor.icon}</svg>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(engines[motor.id])}`}></span>
                        <span className="text-[10px] font-medium text-zinc-400 uppercase">{engines[motor.id]}</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-200 mb-1">{motor.nome}</h3>
                      <p className="text-sm text-zinc-500">{motor.desc}</p>
                    </div>
                  </div>
                ))}

                {enabledExtensions.map((ext) => (
                  <div key={ext.id} className="group relative bg-[#18181B] border border-zinc-800/80 hover:border-emerald-500/30 rounded-lg p-5 transition-colors">
                    <div className="flex justify-between items-start mb-4 gap-3">
                      <div className="w-9 h-9 rounded-md flex items-center justify-center border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {PLUGIN_ICONS[ext.icon] || PLUGIN_ICONS.default}
                        </svg>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${globalStatus === 'online' ? 'bg-emerald-500' : 'bg-zinc-600'}`}></span>
                        <span className="text-[10px] font-medium text-zinc-400 uppercase">
                          {globalStatus === 'online' ? 'online' : 'offline'}
                        </span>
                        <button
                          onClick={() => toggleExtension(ext.file, false)}
                          disabled={globalStatus !== 'offline'}
                          title={globalStatus !== 'offline' ? 'Pare o servidor para remover' : 'Remover plugin'}
                          className={`ml-1 p-1 rounded transition-colors ${
                            globalStatus !== 'offline'
                              ? 'text-zinc-700 cursor-not-allowed'
                              : 'text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-200 mb-1 flex items-center gap-2">
                        {ext.name}
                        <span className="text-[10px] font-mono text-zinc-500 bg-[#09090B] border border-zinc-800 px-1.5 py-0.5 rounded tracking-wide font-normal">
                          v{ext.version}
                        </span>
                      </h3>
                      <p className="text-sm text-zinc-500 line-clamp-2">{ext.description}</p>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setPluginsModalOpen(true)}
                  disabled={globalStatus !== 'offline'}
                  title={globalStatus !== 'offline' ? 'Pare o servidor para adicionar plugins' : 'Adicionar plugin'}
                  className={`min-h-[116px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${
                    globalStatus !== 'offline'
                      ? 'border-zinc-800/50 text-zinc-700 cursor-not-allowed'
                      : 'border-zinc-800 text-zinc-500 hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span className="text-xs font-medium">Adicionar plugin</span>
                </button>
              </div>

              {globalStatus !== 'offline' && (
                <p className="text-[10px] text-zinc-600 mt-3 italic text-center">
                  !Pare o servidor para adicionar ou remover plugins!
                </p>
              )}
            </div>
          )}

          {/* Aba Model Hub */}
          {activeTab === 'hub' && (
            <div className="max-w-[1600px] mx-auto w-full h-full flex flex-col min-h-0 animate-in fade-in duration-300">
              <header className="mb-6 shrink-0">
                <h2 className="text-2xl font-semibold text-zinc-100 mb-1">Model Hub</h2>
                <p className="text-zinc-500 text-sm">Pesquise, veja detalhes e baixe modelos GGUF direto do HuggingFace.</p>
              </header>

              <div className="flex-1 flex gap-6 min-h-0">
                <div className="w-[380px] lg:w-[440px] xl:w-[520px] flex flex-col shrink-0 min-h-0">

                  <div className="relative mb-3">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <input
                      type="text"
                      value={hfSearchQuery}
                      onChange={(e) => setHfSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchHuggingFace()}
                      placeholder="Pesquisar modelos (ex: Llama-3, Qwen, Mistral)..."
                      className="w-full bg-[#18181B] border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>

                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {isSearching ? 'Buscando...' : hfModels.length > 0 ? `${hfModels.length} resultados` : ''}
                    </span>
                    <select value={hfSort} onChange={(e) => setHfSort(e.target.value)} className="bg-transparent border border-zinc-800 rounded-md px-2 py-1 text-[11px] text-zinc-400 focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                      <option value="downloads">Best Match</option>
                      <option value="likes">Most Liked</option>
                      <option value="lastModified">Recent</option>
                      <option value="trendingScore">Trending</option>
                    </select>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1 min-h-0">
                    {isSearching && (
                      <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">
                        <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        Buscando...
                      </div>
                    )}

                    {!isSearching && hfModels.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-sm text-center px-6">
                        <svg className="w-10 h-10 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        <p>Digite algo e aperte Enter pra buscar modelos GGUF no HuggingFace.</p>
                      </div>
                    )}

                    {hfModels.map((model) => {
                      const isSelected = selectedModelId === model.id;
                      const author = model.id.split('/')[0];
                      const name = model.id.split('/')[1] || model.id;
                      const isVerified = model.tags?.includes('verified') || false;
                      const downloads_count = model.downloads || 0;
                      const daysAgo = model.lastModified ? Math.floor((Date.now() - new Date(model.lastModified).getTime()) / 86400000) : null;

                      return (
                        <div key={model._id || model.id} onClick={() => selectModel(model.id)} className={`group cursor-pointer rounded-lg p-3 border transition-all ${isSelected ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-[#18181B] border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/50'}`}>
                          <div className="flex gap-3">
                            <AvatarBubble author={author} size="md" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <h3 className={`text-sm font-semibold break-all leading-snug line-clamp-2 ${isSelected ? 'text-emerald-300' : 'text-zinc-200'}`} title={name}>{name}</h3>
                                {isVerified && (
                                  <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                                )}
                              </div>
                              <p className="text-[11px] font-medium text-emerald-400/80 truncate mb-1" title={author}>{author}</p>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                {model.pipeline_tag && <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 truncate max-w-[140px]">{model.pipeline_tag}</span>}
                                <span className="flex items-center gap-1 shrink-0">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                  {downloads_count.toLocaleString()}
                                </span>
                                {daysAgo !== null && <span className="shrink-0">• {daysAgo === 0 ? 'hoje' : `${daysAgo}d`}</span>}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                                {(model.likes || 0).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 min-h-0 bg-[#18181B] border border-zinc-800/80 rounded-lg flex flex-col overflow-hidden min-w-0">
                  {!selectedModelId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 px-8 text-center">
                      <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
                      <p className="text-sm max-w-md">Selecione um modelo na lista à esquerda pra ver os detalhes e os arquivos disponíveis.</p>
                    </div>
                  ) : (
                    <>
                      <div className="px-6 py-4 border-b border-zinc-800/50 flex items-start justify-between shrink-0 gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <AvatarBubble author={selectedModelId.split('/')[0]} size="sm" />
                            <h3 className="text-base font-semibold text-zinc-100 truncate" title={selectedModelId}>{selectedModelId}</h3>
                            <button onClick={copiarNomeModelo} className="text-zinc-500 hover:text-emerald-400 transition-colors shrink-0" title="Copiar nome do modelo">
                              {copiadoModel ? (
                                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                              )}
                            </button>
                          </div>
                          {modelDetails && (
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>{(modelDetails.downloads || 0).toLocaleString()}</span>
                              <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>{(modelDetails.likes || 0).toLocaleString()}</span>
                              {modelDetails.lastModified && <span>Atualizado {new Date(modelDetails.lastModified).toLocaleDateString('pt-BR')}</span>}
                            </div>
                          )}
                        </div>
                        <button onClick={() => { setSelectedModelId(null); setModelDetails(null); setModelReadme(''); setHfFiles([]); setFileImpacts({}); }} className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                        <div className="px-6">
                          <ModelMetaChips details={modelDetails} />
                        </div>

                        {modelDetails && modelDetails.tags && modelDetails.tags.length > 0 && (
                          <div className="px-6 py-4 border-b border-zinc-800/50">
                            <div className="flex flex-wrap gap-1.5">
                              {modelDetails.tags
                                .filter(t => !['gguf','mlx','safetensors','onnx','awq','vision','audio','text-generation','image-text-to-text','tool-use','function-calling','reasoning','code'].includes(t.toLowerCase()))
                                .slice(0, 14)
                                .map((tag, i) => (
                                  <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{tag}</span>
                                ))}
                            </div>
                          </div>
                        )}

                        <div className="px-6 py-4 border-b border-zinc-800/50">
                          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Download Options</h4>
                          {isFetchingFiles ? (
                            <div className="flex items-center justify-center py-6 text-zinc-500 text-sm">
                              <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                              Resolvendo detalhes do modelo...
                            </div>
                          ) : hfFiles.length === 0 ? (
                            <p className="text-sm text-zinc-500">Nenhum arquivo .gguf encontrado.</p>
                          ) : (
                            <div className="space-y-2">
                              {hfFiles.map((file, idx) => {
                                const dlState = downloads[file.filename];
                                const impact = fileImpacts[file.filename];
                                return (
                                  <div key={idx} className="flex items-center justify-between bg-[#0E0E11] border border-zinc-800/80 rounded-md px-4 py-3">
                                    <div className="flex-1 min-w-0 pr-4">
                                      <p className="text-sm font-medium text-zinc-300 truncate" title={file.filename}>{file.filename}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[11px] text-zinc-500">{file.size}</p>
                                        {impact && (
                                          <span
                                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                              impact.classification === 'Excelente' ? 'bg-emerald-500/10 text-emerald-400' :
                                              impact.classification === 'Aceitável' ? 'bg-amber-500/10 text-amber-400' :
                                              'bg-rose-500/10 text-rose-400'
                                            }`}
                                            title={`Estimativa: ${impact.speed} | VRAM Necessária: ${impact.estimatedMemory}`}
                                          >
                                            {impact.classification === 'Excelente' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                                            {impact.classification === 'Aceitável' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>}
                                            {impact.classification === 'Não recomendado' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                                            {impact.classification}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="w-44 shrink-0 flex flex-col items-end">
                                      {dlState ? (
                                        dlState.status === 'downloading' ? (
                                          <div className="w-full">
                                            <div className="flex justify-between text-[10px] mb-1">
                                              <span className="text-emerald-400 font-medium">Baixando</span>
                                              <span className="text-zinc-400">{dlState.progress}%</span>
                                            </div>
                                            <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                                              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${dlState.progress}%` }}></div>
                                            </div>
                                          </div>
                                        ) : dlState.status === 'completed' ? (
                                          <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            Pronto
                                          </span>
                                        ) : (
                                          <span className="text-rose-400 text-xs font-medium">Erro</span>
                                        )
                                      ) : (
                                        <button onClick={() => startDownload(file.url, file.filename)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors">Baixar</button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="px-6 py-4">
                          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Readme</h4>
                          {isLoadingDetails ? (
                            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
                              <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                              Carregando README...
                            </div>
                          ) : modelReadme ? (
                            <MarkdownRenderer text={modelReadme} />
                          ) : (
                            <p className="text-sm text-zinc-500">Sem README disponível.</p>
                          )}

                          <MoreFromAuthor
                            author={selectedModelId.split('/')[0]}
                            currentModelId={selectedModelId}
                            onSelect={selectModel}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Aba Playground */}
          {activeTab === 'playground' && (
            <div className="max-w-4xl mx-auto h-full flex flex-col min-h-0 animate-in fade-in duration-300">
              <header className="mb-6 flex justify-between items-end shrink-0">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-100 mb-1">Playground</h2>
                  <p className="text-zinc-500 text-sm">
                    {isApiMode
                      ? `Converse via ${apiProviderLabel} · ${aiConfig.model || '—'}`
                      : 'Converse diretamente com o motor local (Offline Mode) para calibrar a personalidade.'}
                  </p>
                </div>
                <button onClick={limparPlayground} className="text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 px-3 py-1.5 rounded border border-zinc-800 transition-colors">Limpar Chat</button>
              </header>

              <div className="flex-1 bg-[#18181B] border border-zinc-800/80 rounded-lg flex flex-col overflow-hidden shadow-sm">
                {globalStatus !== 'online' && (
                  <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center justify-center gap-2 shrink-0">
                    <span className="text-amber-500 font-semibold text-sm">⚠️ Engine Offline:</span>
                    <span className="text-amber-500/80 text-sm">Inicie o servidor primeiro para poder conversar.</span>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#09090B]/50 min-h-0">
                  {playgroundMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                      <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                      <p className="text-sm">Envie uma mensagem para testar o bot.</p>
                    </div>
                  ) : (
                    playgroundMessages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-4 py-3 text-[14px] leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-md' : 'bg-[#18181B] border border-zinc-800 text-zinc-300 shadow-sm'}`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))
                  )}
                  {isPlaygroundTyping && (
                    <div className="flex justify-start">
                      <div className="bg-[#18181B] border border-zinc-800 rounded-xl px-4 py-3 flex gap-1.5 items-center">
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  )}
                  <div ref={playgroundEndRef} />
                </div>
                <div className="p-4 bg-[#18181B] border-t border-zinc-800/80 shrink-0">
                  <div className="relative flex items-center">
                    <textarea value={playgroundInput} onChange={(e) => setPlaygroundInput(e.target.value)} onKeyDown={handleKeyPress} disabled={globalStatus !== 'online' || isPlaygroundTyping} placeholder={globalStatus === 'online' ? "Pressione Enter para enviar..." : "Inicie o servidor para digitar..."} className="w-full bg-[#09090B] border border-zinc-800 rounded-lg pl-4 pr-12 py-3 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50 resize-none overflow-hidden h-[46px] custom-scrollbar disabled:opacity-50" rows="1" />
                    <button onClick={handleSendPlayground} disabled={!playgroundInput.trim() || isPlaygroundTyping || globalStatus !== 'online'} className="absolute right-2 p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white rounded-md transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Aba Local Engine / AI Provider */}
          {activeTab === 'model' && (
            <div className="max-w-4xl mx-auto pb-10 animate-in fade-in duration-300">
              <header className="mb-8">
                <h2 className="text-2xl font-semibold text-zinc-100 mb-1">Motor de IA</h2>
                <p className="text-zinc-500 text-sm">Escolha entre rodar local (GGUF) ou usar uma API paga OpenAI-compatible.</p>
              </header>

              {/* SELETOR: Local vs API */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => setAiConfig((p) => ({ ...p, provider: 'local' }))}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    !isApiMode
                      ? 'bg-emerald-500/10 border-emerald-500/50'
                      : 'bg-[#18181B] border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${!isApiMode ? 'bg-emerald-500' : 'bg-zinc-600'}`}></div>
                    <span className={`text-sm font-semibold ${!isApiMode ? 'text-emerald-300' : 'text-zinc-300'}`}>Local (GGUF)</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">Roda na sua GPU. Privado, offline, grátis.</p>
                </button>

                <button
                  onClick={() => setAiConfig((p) => ({ ...p, provider: p.provider === 'local' ? 'openai' : p.provider }))}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    isApiMode
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-[#18181B] border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${isApiMode ? 'bg-blue-500' : 'bg-zinc-600'}`}></div>
                    <span className={`text-sm font-semibold ${isApiMode ? 'text-blue-300' : 'text-zinc-300'}`}>API Paga</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">OpenAI, Groq, OpenRouter, DeepSeek...</p>
                </button>
              </div>

              {/* Modo local */}
              {!isApiMode && (
                <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-6 flex flex-col gap-8 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                      <label className="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                        GPU Layers (Offload)
                        <span className="text-blue-400">{config.gpuLayers === undefined || config.gpuLayers === -1 ? 'MÁXIMO' : config.gpuLayers}</span>
                      </label>
                      <input type="range" min="-1" max="100" step="1" value={config.gpuLayers ?? -1} onChange={(e) => setConfig({ ...config, gpuLayers: parseInt(e.target.value) })} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2" />
                      <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium tracking-wide"><span>CPU/RAM (0)</span><span>100% GPU (-1)</span></div>
                    </div>
                    <div>
                      <label className="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                        Memória de Contexto
                        <span className="text-blue-400">{config.contextSize ?? 4096} tokens</span>
                      </label>
                      <input type="range" min="1024" max="16384" step="1024" value={config.contextSize ?? 4096} onChange={(e) => setConfig({ ...config, contextSize: parseInt(e.target.value) })} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2" />
                      <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium tracking-wide"><span>1k (Rápido)</span><span>16k (Lento)</span></div>
                    </div>
                  </div>

                  {engineInfo && (
                    <div className="bg-[#09090B] border border-zinc-800/80 rounded-md p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Telemetria do Motor IA (ao vivo)
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <p className="text-zinc-500 text-[10px] uppercase font-medium mb-1">Status</p>
                          <p className={engineInfo.status === 'ok' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>{engineInfo.status === 'ok' ? 'Operacional' : 'Carregando'}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-[10px] uppercase font-medium mb-1">VRAM Livre</p>
                          <p className={`font-semibold ${engineInfo.vram_free_mb == null ? 'text-zinc-500' : engineInfo.vram_free_mb > 2000 ? 'text-emerald-400' : engineInfo.vram_free_mb > 800 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {engineInfo.vram_free_mb != null ? `${engineInfo.vram_free_mb} MB${engineInfo.vram_total ? ` / ${engineInfo.vram_total}` : ''}` : 'N/A'}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-zinc-500 text-[10px] uppercase font-medium mb-1">Modelo</p>
                          <p className="text-zinc-300 font-semibold truncate" title={engineInfo.model || currentModelName || '—'}>
                            {engineInfo.model || currentModelName || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-6 border-t border-zinc-800/50 flex justify-end">
                    <button onClick={handleSaveConfig} disabled={isSaving} className="flex items-center gap-2 bg-zinc-100 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 text-sm font-semibold py-2 px-6 rounded-md transition-colors">
                      {isSaving ? "Salvando..." : "Salvar Configuração de Hardware"}
                    </button>
                  </div>
                </div>
              )}

              {/* Modo API paga */}
              {isApiMode && (
                <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-6 flex flex-col gap-6 shadow-sm">

                  {/* Provider select */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Provedor</label>
                    <select
                      value={selectedProviderId}
                      onChange={(e) => handleSelectProvider(e.target.value)}
                      className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/50 cursor-pointer"
                    >
                      {AI_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Base URL</label>
                    <input
                      type="text"
                      value={aiConfig.baseUrl}
                      onChange={(e) => setAiConfig((p) => ({ ...p, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-500/50"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1.5">Sempre termine com <code className="bg-zinc-800 px-1 rounded">/v1</code> (ou equivalente do provedor).</p>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      API Key
                      {aiConfig.hasKey && !apiKeyInput && (
                        <span className="ml-2 text-[11px] text-emerald-400 font-mono">✓ já configurada</span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => { setApiKeyInput(e.target.value); setKeyValidation(null); }}
                        placeholder={AI_PROVIDERS.find((p) => p.id === selectedProviderId)?.keyHint || 'sua-chave-aqui'}
                        className="flex-1 bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-500/50"
                      />
                      <button
                        onClick={handleValidateKey}
                        disabled={!apiKeyInput.trim() || validatingKey}
                        className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm font-medium rounded-md transition-colors shrink-0"
                      >
                        {validatingKey ? 'Testando...' : 'Testar'}
                      </button>
                    </div>

                    {keyValidation?.ok && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        Key válida! {availableModels.length} modelos disponíveis.
                      </div>
                    )}
                    {keyValidation && !keyValidation.ok && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-rose-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        {keyValidation.error}
                      </div>
                    )}
                  </div>

                  {/* Modelo */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Modelo</label>
                    {availableModels.length > 0 ? (
                      <select
                        value={aiConfig.model}
                        onChange={(e) => setAiConfig((p) => ({ ...p, model: e.target.value }))}
                        className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-500/50 cursor-pointer"
                      >
                        <option value="">— Escolha um modelo —</option>
                        {availableModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={aiConfig.model}
                          onChange={(e) => setAiConfig((p) => ({ ...p, model: e.target.value }))}
                          placeholder="gpt-4o-mini"
                          list="modelos-sugeridos"
                          className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-500/50"
                        />
                        <datalist id="modelos-sugeridos">
                          {(AI_PROVIDERS.find((p) => p.id === selectedProviderId)?.modelos || []).map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                        <p className="text-[11px] text-zinc-500 mt-1.5">Teste a key pra listar todos os modelos disponíveis.</p>
                      </>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="pt-6 border-t border-zinc-800/50 flex items-center justify-between gap-3">
                    <button
                      onClick={handleSaveAiConfig}
                      disabled={!aiConfig.baseUrl || (isApiMode && !aiConfig.hasKey && !apiKeyInput.trim())}
                      className="text-sm font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800/50 hover:bg-zinc-800 px-4 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Salvar sem reiniciar
                    </button>
                    <button
                      onClick={handleSwitchProvider}
                      disabled={switchingProvider || !aiConfig.baseUrl || (!aiConfig.hasKey && !apiKeyInput.trim()) || !aiConfig.model}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2 px-6 rounded-md transition-colors flex items-center gap-2"
                    >
                      {switchingProvider ? (
                        <>
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                          Reiniciando...
                        </>
                      ) : 'Salvar e Reiniciar IA'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba Setup do Bot */}
          {activeTab === 'setup' && (
            <div className="max-w-4xl mx-auto pb-10 animate-in fade-in duration-300">
              <header className="mb-8">
                <h2 className="text-2xl font-semibold text-zinc-100 mb-1">Setup do Bot</h2>
                <p className="text-zinc-500 text-sm">Configure o token, o ID da aplicação e o seu ID de usuário do Discord.</p>
              </header>

              {/* CARD 1 — Portal do Discord */}
              <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-6 mb-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-100 mb-1 flex items-center gap-2">
                      <span className="text-xl"></span>
                      Ainda não tem um bot?
                    </h3>
                    <p className="text-sm text-zinc-500">
                      Abra o Portal do Desenvolvedor do Discord dentro do app. Lá você cria a aplicação,
                      pega o token e o ID.
                    </p>
                  </div>
                  <button
                    onClick={portalAberto ? fecharPortalDiscord : abrirPortalDiscord}
                    className={`shrink-0 text-sm font-semibold px-5 py-2.5 rounded-md transition-colors ${
                      portalAberto
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {portalAberto ? 'Fechar Portal' : 'Abrir Portal do Discord'}
                  </button>
                </div>

                <div className="bg-[#09090B] border border-zinc-800/60 rounded-md p-4 text-xs text-zinc-500 space-y-1.5">
                  <p className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] mb-2">Como pegar as credenciais</p>
                  <p><strong className="text-zinc-300">1.</strong> Crie uma nova application</p>
                  <p><strong className="text-zinc-300">2.</strong> Vá em <strong className="text-zinc-300">Bot</strong> → clique em "Reset Token" → copie o token</p>
                  <p><strong className="text-zinc-300">3.</strong> Vá em <strong className="text-zinc-300">General Information</strong> → copie o "Application ID" (vai no Client ID)</p>
                  <p><strong className="text-zinc-300">4.</strong> No app do Discord: <strong className="text-zinc-300">Configurações → Avançado → Modo Desenvolvedor ON</strong></p>
                  <p><strong className="text-zinc-300">5.</strong> Clique com o botão direito no <strong className="text-zinc-300">seu nome</strong> → "Copiar ID" (vai no Owner ID)</p>
                </div>
              </div>

              {/* CARD 2 — Credenciais */}
              <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-6 flex flex-col gap-6">

                {/* TOKEN */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Bot Token
                    {tokenStatus?.configurado && !tokenInput && (
                      <span className="ml-2 text-[11px] text-emerald-400 font-mono">
                        ✓ já configurado
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="MTIzNJU2Nzg5..."
                      className="flex-1 bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-emerald-500/50"
                    />
                    <button
                      onClick={validarToken}
                      disabled={!tokenInput.trim() || validandoToken}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm font-medium rounded-md transition-colors"
                    >
                      {validandoToken ? 'Validando...' : 'Validar'}
                    </button>
                  </div>

                  {tokenInfo?.ok && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      Conectado como <strong>{tokenInfo.botTag}</strong> <span className="text-zinc-500">(ID: {tokenInfo.botId})</span>
                    </div>
                  )}
                  {tokenInfo && !tokenInfo.ok && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-rose-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                      {tokenInfo.error}
                    </div>
                  )}
                </div>

                {/* CLIENT ID */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Application ID (Client ID)</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="1234567890123456789"
                    className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-emerald-500/50"
                  />
                  {config.clientId && !clientId && (
                    <p className="text-[11px] text-zinc-500 mt-1.5 font-mono">Atual: {config.clientId}</p>
                  )}
                </div>

                {/* OWNER ID */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Seu Discord ID (Owner)</label>
                  <input
                    type="text"
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    placeholder="1176662505959985152"
                    className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-emerald-500/50"
                  />
                  {config.ownerId && !ownerId && (
                    <p className="text-[11px] text-zinc-500 mt-1.5 font-mono">Atual: {config.ownerId}</p>
                  )}
                </div>

                {/* AÇÕES */}
                <div className="pt-6 border-t border-zinc-800/50 flex justify-end">
                  <button
                    onClick={salvarCredenciais}
                    disabled={!tokenInfo?.ok && !clientId && !ownerId}
                    className="bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-900 text-sm font-semibold py-2 px-6 rounded-md transition-colors"
                  >
                    Salvar Credenciais
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Aba Configurações (Persona) */}
          {activeTab === 'config' && (
            <div className="max-w-4xl mx-auto pb-10 animate-in fade-in duration-300">
              <header className="mb-8">
                <h2 className="text-2xl font-semibold text-zinc-100 mb-1">Bot Identity & Permissions</h2>
                <p className="text-zinc-500 text-sm">Ajuste a personalidade da IA e defina quem tem privilégios de criador.</p>
              </header>

              <div className="bg-[#18181B] border border-zinc-800/80 rounded-lg p-6 flex flex-col gap-6 shadow-sm">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">Personality Presets</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {presets.map((preset) => (
                      <div key={preset.id} onClick={() => aplicarPreset(preset)} className={`cursor-pointer p-4 rounded-md border transition-colors ${config.systemPrompt === preset.prompt ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-zinc-800/50 border-zinc-800 hover:border-zinc-600'}`}>
                        <h4 className="text-sm font-semibold text-zinc-200 mb-1">{preset.nome}</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed">{preset.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-800/80 pt-4">
                  <button onClick={() => setIsPromptExpanded(!isPromptExpanded)} className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors">
                    <span>Configurações Avançadas de Prompt</span>
                    <svg className={`w-4 h-4 transition-transform ${isPromptExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>

                  {isPromptExpanded && (
                    <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                      <textarea value={config.systemPrompt} onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })} className="w-full h-40 bg-[#09090B] border border-zinc-800/80 rounded-md p-4 text-[13px] text-zinc-300 focus:outline-none focus:border-emerald-500/50 transition-colors custom-scrollbar leading-relaxed mb-3" spellCheck="false" />
                      <button onClick={() => setConfig({ ...config, systemPrompt: '' })} className="text-[11px] font-medium text-rose-500 hover:text-rose-400">Limpar Prompt Manual</button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Admin Discord ID</label>
                    <input type="text" value={config.ownerId} onChange={(e) => setConfig({ ...config, ownerId: e.target.value })} className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Gatilhos de Chamada</label>
                    <input type="text" value={config.botNames} onChange={(e) => setConfig({ ...config, botNames: e.target.value })} className="w-full bg-[#09090B] border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                      Temperatura <span className="text-blue-400">{config.temperature?.toFixed(1) ?? '0.7'}</span>
                    </label>
                    <input type="range" min="0.1" max="1.5" step="0.1" value={config.temperature ?? 0.7} onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2" />
                    <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium tracking-wide"><span>PREVISÍVEL</span><span>CRIATIVO</span></div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                      Velocidade da Voz (TTS) <span className="text-blue-400">{(config.ttsSpeed ?? 1.5).toFixed(1)}x</span>
                    </label>
                    <input type="range" min="0.8" max="2.0" step="0.1" value={config.ttsSpeed ?? 1.5} onChange={(e) => setConfig({ ...config, ttsSpeed: parseFloat(e.target.value) })} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2" />
                    <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium tracking-wide"><span>LENTO</span><span>RÁPIDO</span></div>
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-800/50 flex justify-end">
                  <button onClick={handleSaveConfig} disabled={isSaving} className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-semibold py-2 px-6 rounded-md">
                    {isSaving ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Developer Logs (Apenas no Overview) */}
        {showLogs && (
          <div className="h-[35%] min-h-[250px] bg-[#09090B] border-t border-zinc-800/80 flex flex-col shrink-0">
            <div className="h-10 px-5 flex items-center justify-between border-b border-zinc-800/50 bg-[#0E0E11]">
              <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M4 17h16a2 2 0 002-2V5a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                <span>Developer Logs</span>
                <span className="bg-zinc-800 text-[10px] px-1.5 py-0.5 rounded text-zinc-300 ml-2">{logs.length} events</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={copiarLogs} className={`text-[11px] font-medium px-2 py-1 rounded transition-colors flex items-center gap-1 ${copiado ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
                  {copiado ? "Copiado" : "Copiar"}
                </button>
                <button onClick={limparLogs} className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors">Limpar</button>
              </div>
            </div>
            <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed custom-scrollbar bg-[#09090B]">
              {logs.map((log, index) => {
                let colorClass = "text-zinc-400";
                if (log.includes("ERRO")) colorClass = "text-rose-400 font-semibold";
                else if (log.includes("[METRICA]") || log.includes("[GERACAO]") || log.includes("[DOWNLOADER]")) colorClass = "text-emerald-400 font-bold";
                else if (log.includes("[PROMPT]")) colorClass = "text-cyan-400 font-medium";
                else if (log.includes("[USO]")) colorClass = "text-blue-400 font-medium";
                else if (log.includes("[PENSANDO]")) colorClass = "text-amber-400 animate-pulse";
                else if (log.includes("[BOOT]")) colorClass = "text-zinc-500";
                else if (log.includes("[DISCORD-BOT]")) colorClass = "text-indigo-300";
                else if (log.includes("[IA-LOCAL]")) colorClass = "text-emerald-200";
                else if (log.includes("[LLAMA]")) colorClass = "text-purple-300";

                return <div key={index} className={`mb-0.5 whitespace-pre-wrap ${colorClass}`}>{log}</div>;
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </main>

      {/* BOTÃO DOWNLOAD FLUTUANTE */}
      {!downloadsPanelOpen && (
        <button
          onClick={() => setDownloadsPanelOpen(true)}
          className="fixed bottom-4 right-4 z-50 bg-[#18181B] border border-zinc-800 hover:border-emerald-500/40 rounded-lg px-3 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/50 transition-all hover:scale-[1.02]"
        >
          <div className="relative">
            {activeDownloads.length > 0 ? (
              <svg className="w-5 h-5 text-emerald-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            )}
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Downloads</span>
            <span className={`text-xs font-semibold ${activeDownloads.length > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {activeDownloads.length > 0 ? `${activeDownloads.length} ativo${activeDownloads.length > 1 ? 's' : ''}` : `${Object.keys(downloads).length} no log`}
            </span>
          </div>
        </button>
      )}

      {/* PAINEL DE DOWNLOADS */}
      {downloadsPanelOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[420px] max-h-[500px] bg-[#18181B] border border-zinc-800 rounded-lg shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="h-11 px-4 flex items-center justify-between border-b border-zinc-800/80 bg-[#0E0E11] shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              <span className="text-sm font-semibold text-zinc-200">Downloads</span>
              {activeDownloads.length > 0 && <span className="bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeDownloads.length}</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearCompleted} disabled={completedDownloads.length === 0} title="Limpar completados" className={`p-1.5 rounded transition-colors ${completedDownloads.length > 0 ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800' : 'text-zinc-700 cursor-not-allowed'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"></path></svg>
              </button>
              <button onClick={() => setDownloadsPanelOpen(false)} title="Minimizar" className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>
            </div>
          </div>

          <div className="p-3 border-b border-zinc-800/50 shrink-0">
            <input type="text" value={downloadsFilter} onChange={(e) => setDownloadsFilter(e.target.value)} placeholder="Filter downloads..." className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50" />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeDownloads.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Em andamento</p>
                <div className="space-y-3">
                  {activeDownloads.map(([filename, d]) => (
                    <div key={filename} className="bg-[#0E0E11] border border-zinc-800/60 rounded-md p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-200 truncate" title={filename}>{filename.split('/').pop()}</p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5" title={filename}>{filename}</p>
                        </div>
                        <button onClick={() => removeDownload(filename)} className="text-zinc-600 hover:text-rose-400 transition-colors shrink-0 p-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] mb-1.5">
                        <span className="text-emerald-400 font-semibold">Baixando</span>
                        <span className="text-zinc-400 font-mono">{d.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300" style={{ width: `${d.progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1.5">
                        <span>{formatBytes(d.downloaded)} / {formatBytes(d.total)}</span>
                        {d.speed > 0 && <span className="text-emerald-400/80 font-mono">{formatBytes(d.speed)}/s</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorDownloads.length > 0 && (
              <div className="px-4 py-3 border-t border-zinc-800/50">
                <p className="text-[10px] font-semibold text-rose-400/80 uppercase tracking-wider mb-2">Com erro</p>
                <div className="space-y-2">
                  {errorDownloads.map(([filename, d]) => (
                    <div key={filename} className="bg-rose-500/5 border border-rose-500/20 rounded-md p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-200 truncate">{filename.split('/').pop()}</p>
                          <p className="text-[10px] text-rose-400/80 truncate mt-0.5">{d.error || 'Erro desconhecido'}</p>
                        </div>
                        <button onClick={() => removeDownload(filename)} className="text-zinc-600 hover:text-rose-400 transition-colors shrink-0 p-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedDownloads.length > 0 && (
              <div className="px-4 py-3 border-t border-zinc-800/50">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Completos</p>
                <div className="space-y-2">
                  {completedDownloads.map(([filename, d]) => (
                    <div key={filename} className="bg-[#0E0E11] border border-zinc-800/60 rounded-md p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-200 truncate flex items-center gap-1.5" title={filename}>
                          <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                          {filename.split('/').pop()}
                        </p>
                      </div>
                      <button onClick={() => removeDownload(filename)} className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0 p-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeDownloads.length === 0 && completedDownloads.length === 0 && errorDownloads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-zinc-500 text-xs">
                <svg className="w-10 h-10 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                <p>Nenhum download no histórico.</p>
              </div>
            )}
          </div>

          <div className="h-9 px-4 flex items-center justify-between border-t border-zinc-800/80 bg-[#0E0E11] shrink-0">
            <span className="text-[10px] text-zinc-500">{activeDownloads.length > 0 ? `${activeDownloads.length} ativo(s)` : 'Inativo'}</span>
            <button onClick={() => { setDownloads({}); setDownloadsFilter(''); }} className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors" disabled={Object.keys(downloads).length === 0}>Limpar tudo</button>
          </div>
        </div>
      )}

      {/* MODAL: PLUGINS DISPONÍVEIS */}
      {pluginsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => setPluginsModalOpen(false)}>
          <div className="w-full max-w-2xl max-h-[75vh] bg-[#18181B] border border-zinc-800 rounded-xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>

            <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  Adicionar Plugin
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Plugins encontrados na pasta /extensions que ainda não estão ativos.</p>
              </div>
              <button onClick={() => setPluginsModalOpen(false)} className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {disabledExtensions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-zinc-500">
                  <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <p className="text-sm mb-1">Nenhum plugin disponível</p>
                  <p className="text-xs text-zinc-600">Todos os plugins da pasta /extensions já estão ativos.</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {disabledExtensions.map((ext) => (
                    <div key={ext.id} className="bg-[#0E0E11] border border-zinc-800/60 rounded-lg p-4 flex gap-3 items-start hover:border-zinc-700 transition-colors">
                      <div className="w-10 h-10 bg-zinc-800 text-zinc-500 flex items-center justify-center rounded-lg border border-zinc-800 shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {PLUGIN_ICONS[ext.icon] || PLUGIN_ICONS.default}
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 flex-wrap">
                          {ext.name}
                          <span className="text-[10px] font-mono text-zinc-500 bg-[#09090B] border border-zinc-800 px-1.5 py-0.5 rounded tracking-wide">
                            v{ext.version}
                          </span>
                        </h4>
                        <p className="text-[12px] text-zinc-500 mt-1 leading-snug">{ext.description}</p>
                        <p className="text-[10px] text-zinc-600 mt-1.5 font-mono truncate" title={ext.file}>{ext.file}</p>
                      </div>
                      <button
                        onClick={() => toggleExtension(ext.file, true)}
                        className="shrink-0 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        Adicionar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800/80 bg-[#0E0E11] shrink-0">
              <button
                disabled
                title="Em breve — busca e download de plugins externos"
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-600 text-sm font-medium py-2.5 rounded-md cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                Procurar & Baixar Extensões
                <span className="text-[10px] font-mono bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded ml-1">EM BREVE</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MODEL PICKER */}
      {modelPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => setModelPickerOpen(false)}>
          <div className="w-full max-w-5xl max-h-[80vh] bg-[#18181B] border border-zinc-800 rounded-xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>

            <div className="p-4 border-b border-zinc-800/80 flex items-center gap-3 shrink-0">
              <input
                type="text"
                value={modelPickerFilter}
                onChange={(e) => setModelPickerFilter(e.target.value)}
                placeholder="Type to filter models..."
                autoFocus
                className="flex-1 bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
              <button onClick={() => setModelPickerOpen(false)} className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="px-4 py-2.5 border-b border-zinc-800/50 flex items-center justify-between bg-[#0E0E11] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Modelos baixados</span>
                <span className="bg-zinc-800 text-[10px] px-1.5 py-0.5 rounded text-zinc-400 font-mono">{filteredDownloadedModels.length}</span>
              </div>
              {iaOnline && (
                <span className="text-[11px] text-emerald-400/80 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  IA carregada na VRAM
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredDownloadedModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-zinc-500">
                  <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  <p className="text-sm mb-1">Nenhum modelo baixado ainda</p>
                  <p className="text-xs text-zinc-600">Vá em Model Hub e baixe um modelo GGUF pra começar.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/50">
                  {filteredDownloadedModels.map((model) => {
                    const loaded = iaOnline && isModelLoaded(model.path);
                    return (
                      <div key={model.path} className={`px-4 py-3 flex items-center gap-3 transition-colors ${loaded ? 'bg-emerald-500/5' : 'hover:bg-zinc-800/30'}`}>
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${loaded ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-200 break-all leading-snug line-clamp-2" title={model.name}>{model.name}</p>
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5" title={model.path}>{model.relative}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-mono text-zinc-300">{formatBytes(model.size)}</p>
                            <p className="text-[10px] text-zinc-500">{new Date(model.modified).toLocaleDateString('pt-BR')}</p>
                          </div>

                          {loaded ? (
                            <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Em uso
                            </div>
                          ) : (
                            <button
                              onClick={() => handleLoadModel(model.path)}
                              disabled={isLoadingModel}
                              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                              </svg>
                              Carregar
                            </button>
                          )}

                          {/* BOTÃO REMOVER */}
                          <button
                            onClick={async () => {
                              if (!confirm(`Remover "${model.name}"? Essa ação não pode ser desfeita.`)) return;
                              const r = await window.api.deleteModel(model.path);
                              if (r.ok) {
                                const list = await window.api.listDownloadedModels();
                                setDownloadedModels(list || []);
                                pushLog(`> [SISTEMA] Modelo removido: ${model.name}`);
                              } else {
                                pushLog(`> [ERRO] ${r.error}`);
                              }
                            }}
                            disabled={loaded || isLoadingModel}
                            title={loaded ? 'Descarregue o modelo antes de remover' : 'Remover modelo'}
                            className={`p-1.5 rounded-md transition-colors shrink-0 ${
                              loaded || isLoadingModel
                                ? 'text-zinc-700 cursor-not-allowed'
                                : 'text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800/80 bg-[#0E0E11] flex items-center justify-between shrink-0">
              <span className="text-[10px] text-zinc-500">Ctrl+L para abrir/fechar • Esc para fechar</span>
              <button onClick={() => setModelPickerOpen(false)} className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;