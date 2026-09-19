const { execSync } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const extract = require('extract-zip');

const LLAMA_DIR_NAME = 'llama';
const RELEASES_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30';

// Padrões de assets para cada build (nome do arquivo no GitHub Releases)
const BUILD_PATTERNS = {
  'cuda-12.4': {
    main: /^llama-.*-bin-win-cuda-12\.4-x64\.zip$/,
    cudart: /^cudart-llama-bin-win-cuda-12\.4-x64\.zip$/,
    label: 'CUDA 12.4',
    descricao: 'NVIDIA (Turing → Blackwell)',
  },
  'vulkan': {
    main: /^llama-.*-bin-win-vulkan-x64\.zip$/,
    cudart: null,
    label: 'Vulkan',
    descricao: 'AMD, Intel ou NVIDIA antiga',
  },
  'cpu-avx2': {
    main: /^llama-.*-bin-win-cpu-x64\.zip$/,
    cudart: null,
    label: 'CPU (AVX2)',
    descricao: 'Sem GPU dedicada',
  },
};

// ============================================================
// CLASSIFICADOR DE GPU POR NOME
// Retorna { vendor, score, tipo, ehApu } ou null (se virtual/básica)
// Score: 0-100 (maior = melhor pra inferência)
// ============================================================
function classificarGPU(nomeGPU) {
  if (!nomeGPU) return null;
  const n = nomeGPU.toLowerCase();

  // ---------- IGNORA GPUs VIRTUAIS / BÁSICAS ----------
  if (
    n.includes('microsoft basic') ||
    n.includes('remote display') ||
    n.includes('virtual') ||
    n.includes('parsec') ||
    n.includes('vmware') ||
    n.includes('citrix') ||
    n.includes('meta virtual')
  ) {
    return null;
  }

  // ============================================================
  // NVIDIA
  // ============================================================
  if (
    n.includes('nvidia') || n.includes('geforce') ||
    n.includes('quadro') || n.includes('tesla') ||
    n.includes('rtx') || n.includes('gtx')
  ) {
    if (n.includes('rtx 50')) return { vendor: 'NVIDIA', score: 100, tipo: 'dgpu', ehApu: false };
    if (n.includes('rtx 40')) return { vendor: 'NVIDIA', score: 95,  tipo: 'dgpu', ehApu: false };
    if (n.includes('rtx 30')) return { vendor: 'NVIDIA', score: 90,  tipo: 'dgpu', ehApu: false };
    if (n.includes('rtx 20')) return { vendor: 'NVIDIA', score: 80,  tipo: 'dgpu', ehApu: false };
    if (n.includes('gtx 16')) return { vendor: 'NVIDIA', score: 70,  tipo: 'dgpu', ehApu: false };
    if (n.includes('gtx 10')) return { vendor: 'NVIDIA', score: 60,  tipo: 'dgpu', ehApu: false };
    if (n.includes('gtx 9'))  return { vendor: 'NVIDIA', score: 40,  tipo: 'dgpu', ehApu: false };
    if (n.includes('quadro') || n.includes('tesla') || n.includes('rtx a')) {
      return { vendor: 'NVIDIA', score: 75, tipo: 'dgpu', ehApu: false };
    }
    return { vendor: 'NVIDIA', score: 50, tipo: 'dgpu', ehApu: false };
  }

  // ============================================================
  // AMD — DISCRETA (RX)
  // ============================================================
  // RDNA 4 (RX 9000)
  if (n.includes('rx 90') || n.includes('rx 9070') || n.includes('rx 9060')) {
    return { vendor: 'AMD', score: 96, tipo: 'dgpu', ehApu: false };
  }
  // RDNA 3 (RX 7000)
  if (n.includes('rx 79') || n.includes('rx 78') || n.includes('rx 77') ||
      n.includes('rx 76') || n.includes('rx 75') || n.includes('rx 74') ||
      n.includes('rx 73') || n.includes('rx 70')) {
    return { vendor: 'AMD', score: 92, tipo: 'dgpu', ehApu: false };
  }
  // RDNA 2 (RX 6000)
  if (n.includes('rx 69') || n.includes('rx 68') || n.includes('rx 67') ||
      n.includes('rx 66') || n.includes('rx 65') || n.includes('rx 64') ||
      n.includes('rx 60')) {
    return { vendor: 'AMD', score: 85, tipo: 'dgpu', ehApu: false };
  }
  // RDNA 1 / Vega discreta (RX 5000, Radeon VII)
  if (n.includes('rx 57') || n.includes('rx 56') || n.includes('rx 55') ||
      n.includes('rx 53') || n.includes('rx 50') || n.includes('radeon vii')) {
    return { vendor: 'AMD', score: 75, tipo: 'dgpu', ehApu: false };
  }
  // Radeon Pro / W-series (workstation discreta)
  if (n.includes('radeon pro') || n.includes('firepro') || n.includes('radeon w')) {
    return { vendor: 'AMD', score: 72, tipo: 'dgpu', ehApu: false };
  }

  // ============================================================
  // AMD — iGPU (APU Ryzen ou embutida)
  // ============================================================
  // Vega (Ryzen 2000-5000G): "AMD Radeon Vega 7", "AMD Radeon Vega 8", "AMD Radeon Graphics"
  if (n.includes('vega') || n.includes('radeon graphics') || n.includes('radeon(tm) graphics')) {
    return { vendor: 'AMD', score: 25, tipo: 'igpu', ehApu: true };
  }
  // RDNA 2/3 integrada (Ryzen 6000/7000/8000): "AMD Radeon 660M", "680M", "760M", "780M", "880M"
  if (n.includes('radeon 6') || n.includes('radeon 7') || n.includes('radeon 8')) {
    return { vendor: 'AMD', score: 35, tipo: 'igpu', ehApu: true };
  }
  // Qualquer outra AMD não classificada (genérica)
  if (n.includes('amd') || n.includes('radeon') || n.includes('ati ')) {
    return { vendor: 'AMD', score: 45, tipo: 'dgpu', ehApu: false };
  }

  // ============================================================
  // INTEL
  // ============================================================
  // Arc discreta (A-series, B-series)
  if (n.includes('arc a') || n.includes('arc b') || n.includes('arc pro')) {
    return { vendor: 'Intel', score: 82, tipo: 'dgpu', ehApu: false };
  }
  // Iris Xe MAX (discreta)
  if (n.includes('iris xe max')) {
    return { vendor: 'Intel', score: 55, tipo: 'dgpu', ehApu: false };
  }
  // iGPU Intel (UHD, Iris, HD Graphics)
  if (
    n.includes('uhd graphics') || n.includes('iris') ||
    n.includes('hd graphics') || n.includes('intel(r) graphics')
  ) {
    return { vendor: 'Intel', score: 20, tipo: 'igpu', ehApu: true };
  }
  // Qualquer outra Intel
  if (n.includes('intel')) {
    return { vendor: 'Intel', score: 30, tipo: 'igpu', ehApu: true };
  }

  // Desconhecida — trata como dGPU fraca
  return { vendor: 'Desconhecido', score: 15, tipo: 'dgpu', ehApu: false };
}

// ============================================================
// COLEÇÃO DE GPUs VIA POWERSHELL
// ============================================================
function coletarGPUsPowerShell() {
  const gpus = [];

  try {
    const psCmd = 'powershell.exe -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM | ConvertTo-Json -Compress"';
    const psOut = execSync(psCmd, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }).trim();

    if (!psOut) return gpus;

    let parsed = [];
    try {
      const json = JSON.parse(psOut);
      parsed = Array.isArray(json) ? json : [json];
    } catch (e) {
      console.warn('[LLAMA-MGR] Falha ao parsear JSON do PowerShell:', e.message);
      return gpus;
    }

    for (const gpu of parsed) {
      const nome = (gpu.Name || '').trim();
      const driver = (gpu.DriverVersion || '').trim();
      const vramBytes = parseInt(gpu.AdapterRAM, 10) || 0;
      if (!nome) continue;
      gpus.push({ nome, driver, vramBytes });
    }
  } catch (e) {
    console.warn('[LLAMA-MGR] PowerShell CIM falhou:', e.message);
  }

  return gpus;
}

// ============================================================
// nvidia-smi (compute cap + driver)
// ============================================================
function enriquecerComNvidiaSmi(gpus) {
  try {
    const smiOut = execSync(
      'nvidia-smi --query-gpu=name,compute_cap,driver_version --format=csv,noheader',
      { encoding: 'utf8', stdio: 'pipe', timeout: 15000 }
    ).trim();

    const linhas = smiOut.split('\n').filter(l => l.trim());

    for (const linha of linhas) {
      const partes = linha.split(',').map(s => s.trim());
      if (partes.length < 3) continue;

      const [nome, cap, driver] = partes;

      const match = gpus.find(g => {
        const n1 = g.nome.toLowerCase();
        const n2 = nome.toLowerCase();
        return n1.includes(n2) || n2.includes(n1) ||
               n1.split(' ').slice(0, 3).join(' ') === n2.split(' ').slice(0, 3).join(' ');
      });

      if (match) {
        match.computeCap = cap;
        match.sm = cap.replace('.', '');
        match.driver = driver;
        match.fonteNvidia = true;
      }
    }
  } catch (e) {
  }

  return gpus;
}

// ============================================================
// DETECÇÃO PRINCIPAL — escolhe a MELHOR GPU por score
// Prioriza dGPU > iGPU. Se tiver APU+ GPU, pega a GPU.
// ============================================================
function detectarGPUWindows() {
  const info = {
    vendor: null,
    nome: null,
    driver: null,
    computeCap: null,
    sm: null,
    tipo: null,
    ehApu: false,
    todasGpus: [],
    threads: os.cpus().length,
    cpu: os.cpus()[0]?.model?.trim() || 'Desconhecido',
  };

  // ---------- Coleta todas as GPUs ----------
  let gpusRaw = coletarGPUsPowerShell();
  gpusRaw = enriquecerComNvidiaSmi(gpusRaw);

  console.log(`[LLAMA-MGR] Raw GPUs do sistema: ${gpusRaw.length}`);
  gpusRaw.forEach(g => console.log(`[LLAMA-MGR]   → "${g.nome}" (driver ${g.driver || '?'})`));

  // ---------- Classifica cada uma ----------
  const gpusClassificadas = [];

  for (const g of gpusRaw) {
    const classif = classificarGPU(g.nome);
    if (!classif) {
      console.log(`[LLAMA-MGR] Ignorada (virtual/básica): "${g.nome}"`);
      continue;
    }

    gpusClassificadas.push({
      nome: g.nome,
      driver: g.driver,
      vramBytes: g.vramBytes || 0,
      vendor: classif.vendor,
      score: classif.score,
      tipo: classif.tipo,
      ehApu: classif.ehApu,
      sm: g.sm || null,
      computeCap: g.computeCap || null,
    });
  }

  info.todasGpus = gpusClassificadas;

  // ---------- Sem GPU utilizável → CPU ----------
  if (gpusClassificadas.length === 0) {
    info.vendor = 'CPU';
    info.nome = 'Sem GPU detectada';
    info.tipo = 'cpu';
    console.log('[LLAMA-MGR] Nenhuma GPU utilizável — caindo pra CPU');
    return info;
  }

  // ---------- Escolhe a melhor por score ----------
  gpusClassificadas.sort((a, b) => b.score - a.score);
  const melhor = gpusClassificadas[0];

  info.vendor = melhor.vendor;
  info.nome = melhor.nome;
  info.driver = melhor.driver;
  info.sm = melhor.sm;
  info.computeCap = melhor.computeCap;
  info.tipo = melhor.tipo;
  info.ehApu = melhor.ehApu;

  // ---------- Log final ----------
  console.log(`[LLAMA-MGR] ========================================`);
  console.log(`[LLAMA-MGR] GPUs utilizáveis (${gpusClassificadas.length}):`);
  gpusClassificadas.forEach((g, i) => {
    const marker = i === 0 ? '★' : ' ';
    const apuTag = g.ehApu ? ' [APU/iGPU]' : '';
    console.log(`[LLAMA-MGR]   ${marker} ${g.vendor} — ${g.nome}${apuTag} (score ${g.score})`);
  });
  console.log(`[LLAMA-MGR] >>> ESCOLHIDA: ${info.vendor} ${info.nome}`);
  console.log(`[LLAMA-MGR] ========================================`);

  return info;
}

// ============================================================
// ESCOLHA DE BUILD
// ============================================================
function escolherBuild(gpuInfo) {
  // ---------- NVIDIA ----------
  if (gpuInfo.vendor === 'NVIDIA') {
    const driverMajor = parseFloat(String(gpuInfo.driver || '0').split('.')[0]);

    if (!isNaN(driverMajor) && driverMajor >= 525) {
      return {
        tipo: 'cuda-12.4',
        label: BUILD_PATTERNS['cuda-12.4'].label,
        motivo: `NVIDIA ${gpuInfo.nome} (driver ${gpuInfo.driver})`,
        precisaCudart: true,
      };
    }

    return {
      tipo: 'vulkan',
      label: BUILD_PATTERNS['vulkan'].label,
      motivo: `NVIDIA com driver antigo (${gpuInfo.driver || '?'}) → Vulkan`,
      precisaCudart: false,
    };
  }

  // ---------- AMD ----------
  if (gpuInfo.vendor === 'AMD') {
    return {
      tipo: 'vulkan',
      label: BUILD_PATTERNS['vulkan'].label,
      motivo: gpuInfo.ehApu
        ? `AMD ${gpuInfo.nome} (iGPU/APU) — Vulkan`
        : `AMD ${gpuInfo.nome} — Vulkan`,
      precisaCudart: false,
    };
  }

  // ---------- Intel ----------
  if (gpuInfo.vendor === 'Intel') {
    return {
      tipo: 'vulkan',
      label: BUILD_PATTERNS['vulkan'].label,
      motivo: `Intel ${gpuInfo.nome} — Vulkan`,
      precisaCudart: false,
    };
  }

  // ---------- CPU ----------
  return {
    tipo: 'cpu-avx2',
    label: BUILD_PATTERNS['cpu-avx2'].label,
    motivo: 'Sem GPU dedicada',
    precisaCudart: false,
  };
}

// ============================================================
// PATHS
// ============================================================
function getLlamaDir() {
  return path.join(app.getPath('userData'), LLAMA_DIR_NAME);
}

function getVersionFile() {
  return path.join(getLlamaDir(), '.version');
}

function getLlamaServerPath() {
  return path.join(getLlamaDir(), 'llama-server.exe');
}

// ============================================================
// VERIFICAR INSTALAÇÃO
// ============================================================
function buildJaInstalado() {
  try {
    const dir = getLlamaDir();
    const versionFile = getVersionFile();
    const serverPath = path.join(dir, 'llama-server.exe');

    if (!fs.existsSync(serverPath) || !fs.existsSync(versionFile)) return null;

    const info = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    return info;
  } catch (e) {
    return null;
  }
}

// ============================================================
// DOWNLOAD COM PROGRESSO
// ============================================================
async function baixarComProgresso(url, destPath, onProgress) {
  const writer = fs.createWriteStream(destPath);

  const resp = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 0,
    maxRedirects: 10,
    headers: { 'User-Agent': 'LocalBotStudio' },
  });

  const total = parseInt(resp.headers['content-length'], 10) || 0;
  let baixado = 0;
  let ultimoReporte = -1;

  resp.data.on('data', (chunk) => {
    baixado += chunk.length;
    if (total > 0 && onProgress) {
      const pct = Math.floor((baixado / total) * 100);
      if (pct !== ultimoReporte) {
        ultimoReporte = pct;
        onProgress({ pct, baixado, total });
      }
    }
  });

  resp.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    resp.data.on('error', reject);
  });

  return { baixado, total };
}

// ============================================================
// DOWNLOAD + EXTRAÇÃO DO LLAMA-SERVER
// ============================================================
async function baixarLlamaServer(buildTipo, onStatus) {
  const buildConfig = BUILD_PATTERNS[buildTipo];
  if (!buildConfig) {
    throw new Error(`Build desconhecido: ${buildTipo}`);
  }

  const destDir = getLlamaDir();
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  // ---------- Limpa instalação anterior ----------
  try {
    const arquivos = fs.readdirSync(destDir);
    for (const f of arquivos) {
      const fullPath = path.join(destDir, f);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {
        console.error(`[LLAMA-MGR] Falha ao limpar ${f}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[LLAMA-MGR] Falha na limpeza:', e.message);
  }

  // ---------- Busca release que tem o asset ----------
  onStatus?.({ etapa: 'buscando_release', msg: 'Buscando release mais recente...' });

  const releasesResp = await axios.get(RELEASES_API, {
    headers: { 'User-Agent': 'LocalBotStudio' },
    timeout: 15000,
  });

  let releaseEscolhida = null;
  let mainAsset = null;
  let cudartAsset = null;

  for (const release of releasesResp.data) {
    if (release.draft) continue;

    const assets = release.assets || [];
    const main = assets.find(a => buildConfig.main.test(a.name));
    if (!main) continue;

    releaseEscolhida = release;
    mainAsset = main;
    if (buildConfig.cudart) {
      cudartAsset = assets.find(a => buildConfig.cudart.test(a.name));
    }
    break;
  }

  if (!releaseEscolhida || !mainAsset) {
    throw new Error(`Nenhuma release com o build ${buildConfig.label} foi encontrada nas últimas 30 releases`);
  }

  const tag = releaseEscolhida.tag_name;
  console.log(`[LLAMA-MGR] Release escolhida: ${tag} (asset: ${mainAsset.name})`);

  // ---------- Baixa binário principal ----------
  onStatus?.({
    etapa: 'baixando_main',
    msg: `Baixando ${buildConfig.label} (${(mainAsset.size / 1e6).toFixed(0)} MB)...`,
    arquivo: mainAsset.name,
    tamanho: mainAsset.size,
    pct: 0,
  });

  const mainZipPath = path.join(destDir, mainAsset.name);
  await baixarComProgresso(mainAsset.browser_download_url, mainZipPath, (p) => {
    onStatus?.({
      etapa: 'baixando_main',
      msg: `Baixando ${buildConfig.label}...`,
      arquivo: mainAsset.name,
      pct: p.pct,
      baixado: p.baixado,
      total: p.total,
    });
  });

  // ---------- Baixa cudart (só CUDA) ----------
  let cudartZipPath = null;

  if (buildConfig.cudart && cudartAsset) {
    onStatus?.({
      etapa: 'baixando_cudart',
      msg: `Baixando runtime CUDA (${(cudartAsset.size / 1e6).toFixed(0)} MB)...`,
      arquivo: cudartAsset.name,
      tamanho: cudartAsset.size,
      pct: 0,
    });

    cudartZipPath = path.join(destDir, cudartAsset.name);
    await baixarComProgresso(cudartAsset.browser_download_url, cudartZipPath, (p) => {
      onStatus?.({
        etapa: 'baixando_cudart',
        msg: 'Baixando runtime CUDA...',
        arquivo: cudartAsset.name,
        pct: p.pct,
        baixado: p.baixado,
        total: p.total,
      });
    });
  } else if (buildConfig.cudart && !cudartAsset) {
    console.warn(`[LLAMA-MGR] Cudart para ${buildTipo} não encontrado na release ${tag} — continuando sem`);
  }

  // ---------- Extrai ----------
  onStatus?.({ etapa: 'extraindo', msg: 'Extraindo binário principal...' });
  await extract(mainZipPath, { dir: destDir });
  fs.unlinkSync(mainZipPath);

  if (cudartZipPath) {
    onStatus?.({ etapa: 'extraindo', msg: 'Extraindo runtime CUDA...' });
    await extract(cudartZipPath, { dir: destDir });
    fs.unlinkSync(cudartZipPath);
  }

  // ---------- Verifica ----------
  const serverPath = path.join(destDir, 'llama-server.exe');
  if (!fs.existsSync(serverPath)) {
    throw new Error('llama-server.exe não foi encontrado após extração');
  }

  // ---------- Salva metadados ----------
  const versionInfo = {
    tag,
    build: buildTipo,
    label: buildConfig.label,
    instaladoEm: new Date().toISOString(),
    path: serverPath,
  };

  fs.writeFileSync(getVersionFile(), JSON.stringify(versionInfo, null, 2));

  onStatus?.({
    etapa: 'completo',
    msg: `✅ Instalação concluída: ${tag} (${buildConfig.label})`,
  });

  return {
    ok: true,
    tag,
    build: buildTipo,
    label: buildConfig.label,
    path: destDir,
    serverPath,
  };
}

// ============================================================
// DESINSTALAR
// ============================================================
function desinstalar() {
  const dir = getLlamaDir();
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('[LLAMA-MGR] Desinstalado com sucesso');
      return true;
    } catch (e) {
      console.error('[LLAMA-MGR] Falha ao desinstalar:', e.message);
      return false;
    }
  }
  return false;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  detectarGPUWindows,
  escolherBuild,
  buildJaInstalado,
  baixarLlamaServer,
  getLlamaServerPath,
  getLlamaDir,
  getVersionFile,
  desinstalar,
  BUILD_PATTERNS,
  classificarGPU,
};