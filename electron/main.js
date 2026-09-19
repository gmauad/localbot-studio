const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const os = require('os');
const llamaMgr = require('./llama-manager');

let mainWindow;
let processosAtivos = {};

const isDev = process.env.NODE_ENV === 'development';

const RESOURCES_PATH = isDev
  ? path.join(__dirname, '..')
  : process.resourcesPath;

const BACKEND_PATH = path.join(RESOURCES_PATH, 'backend');

// ==========================================
// CONFIG PATH 
// ==========================================
const configPath = isDev
  ? path.join(BACKEND_PATH, 'config.json')
  : path.join(app.getPath('userData'), 'config.json');

const ENV_PATH = isDev
  ? path.join(RESOURCES_PATH, '.env')
  : path.join(app.getPath('userData'), '.env');

console.log(`[BOOT] Modo: ${isDev ? 'DEV' : 'PRODUÇÃO'}`);
console.log(`[BOOT] Backend: ${BACKEND_PATH}`);
console.log(`[BOOT] Config: ${configPath}`);
console.log(`[BOOT] Env: ${ENV_PATH}`);

// ==========================================
// HELPERS .env
// ==========================================
function lerEnvVar(nome) {
  try {
    if (!fs.existsSync(ENV_PATH)) return '';
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = content.match(new RegExp(`^${nome}=(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  } catch { return ''; }
}

function salvarEnvVar(nome, valor) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  content = content.replace(new RegExp(`^${nome}=.*$`, 'gm'), '').replace(/\n\n+/g, '\n').trim();
  if (content && !content.endsWith('\n')) content += '\n';
  if (valor && valor.trim()) content += `${nome}=${valor.trim()}\n`;
  fs.writeFileSync(ENV_PATH, content);
}

// ==========================================
// KILL TREE
// ==========================================
function matarArvoreDeProcessos(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {}
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
  }
}

function limparLlamaServersOrfaos() {
  if (process.platform !== 'win32') return;
  try {
    execSync('taskkill /F /IM llama-server.exe', { stdio: 'ignore' });
  } catch {}
}

// ==========================================
// AUTO UPDATER
// ==========================================
function configurarUpdater() {
  if (!app.isPackaged) {
    console.log('[UPDATER] Modo dev detectado, updater desabilitado.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[UPDATER] Checando update...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { tipo: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[UPDATER] Update disponível:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { tipo: 'available', info });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[UPDATER] Já tá na última versão.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { tipo: 'up-to-date', info });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        tipo: 'progress',
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[UPDATER] Update baixado:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { tipo: 'downloaded', info });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[UPDATER] Erro:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { tipo: 'error', error: err.message });
    }
  });
}

// ==========================================
// WINDOW
// ==========================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0E0E11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  const loadingHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #0E0E11;
          color: #71717a;
          font-family: -apple-system, 'Segoe UI', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          overflow: hidden;
          user-select: none;
        }
        .logo {
          width: 48px;
          height: 48px;
          background: #2563eb;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
        }
        .logo svg {
          width: 26px;
          height: 26px;
          stroke: white;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .titulo {
          color: #e4e4e7;
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .subtitulo {
          color: #52525b;
          font-size: 12px;
          margin-bottom: 32px;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #27272a;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .mensagem {
          margin-top: 16px;
          font-size: 11px;
          color: #3f3f46;
        }
      </style>
    </head>
    <body>
      <div class="logo">
        <svg viewBox="0 0 24 24">
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
        </svg>
      </div>
      <div class="titulo">LocalBot Studio</div>
      <div class="subtitulo">Iniciando...</div>
      <div class="spinner"></div>
      <div class="mensagem">carregando interface</div>
    </body>
    </html>
  `;

  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  const carregarAppReal = () => {
    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  };

  setTimeout(carregarAppReal, 200);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  if (!isDev) {
    // ============================================================
    // ---- .env ----
    // ============================================================
    const bundledEnv = path.join(RESOURCES_PATH, '.env');
    const bundledExiste = fs.existsSync(bundledEnv);
    const userDataExiste = fs.existsSync(ENV_PATH);

    let bundledTemToken = false;
    if (bundledExiste) {
      try {
        const content = fs.readFileSync(bundledEnv, 'utf-8');
        const match = content.match(/^TOKEN=(.+)$/m);
        bundledTemToken = !!(match && match[1].trim().length > 20);
      } catch (e) {}
    }

    let userDataTemToken = false;
    if (userDataExiste) {
      try {
        const content = fs.readFileSync(ENV_PATH, 'utf-8');
        const match = content.match(/^TOKEN=(.+)$/m);
        userDataTemToken = !!(match && match[1].trim().length > 20);
      } catch (e) {}
    }

    if (bundledExiste && bundledTemToken && (!userDataExiste || !userDataTemToken)) {
      try {
        fs.copyFileSync(bundledEnv, ENV_PATH);
        console.log(`[BOOT] .env bundled copiado pra userData (sobrescreveu vazio)`);
      } catch (e) {
        console.error('[BOOT] Falha ao copiar .env:', e.message);
      }
    } else if (!userDataExiste) {
      try {
        fs.writeFileSync(ENV_PATH, 'LM_STUDIO_URL=http://localhost:1234/v1\nTOKEN=\n');
        console.log(`[BOOT] .env template criado (sem bundled válido)`);
      } catch (e) {
        console.error('[BOOT] Falha ao criar .env:', e.message);
      }
    }

    // ============================================================
    // ---- config.json ----
    // ============================================================
    if (!fs.existsSync(configPath)) {
      const bundledConfig = path.join(RESOURCES_PATH, 'backend', 'config.json');
      if (fs.existsSync(bundledConfig)) {
        try {
          fs.copyFileSync(bundledConfig, configPath);
          console.log(`[BOOT] config.json bundled copiado pra userData`);
        } catch (e) {
          console.error('[BOOT] Falha ao copiar config:', e.message);
        }
      }
    }

    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        let alterado = false;

        if (cfg.modelPath && !fs.existsSync(cfg.modelPath)) {
          console.log(`[BOOT] modelPath inválido removido: ${cfg.modelPath}`);
          cfg.modelPath = '';
          alterado = true;
        }

        if (cfg.llamaServerPath && !fs.existsSync(cfg.llamaServerPath)) {
          console.log(`[BOOT] llamaServerPath inválido removido: ${cfg.llamaServerPath}`);
          cfg.llamaServerPath = '';
          alterado = true;
        }

        if (alterado) {
          fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
          console.log(`[BOOT] config.json sanitizado`);
        }
      } catch (e) {
        console.error('[BOOT] Falha ao sanitizar config:', e.message);
      }
    }
  }

  limparLlamaServersOrfaos();
  createWindow();

  // ==========================================
  // AUTO UPDATER - boot
  // ==========================================
  configurarUpdater();
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((e) => {
        console.warn('[UPDATER] Falha ao checar:', e.message);
      });
    }, 4000);
  }
});

// ==========================================
// Inicialização do servidor
// ==========================================
function iniciarMotor(nome, comando, args, event) {
  event.sender.send('engine-status', nome, 'loading');

  let comandoFinal = comando;
  if (comando === 'python') {
    comandoFinal = isDev
      ? 'python'
      : path.join(RESOURCES_PATH, 'backend', 'python', 'python.exe');
  }

  const processo = spawn(comandoFinal, args, {
    cwd: BACKEND_PATH,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      LBS_ENV_PATH: ENV_PATH,
      LBS_CONFIG_PATH: configPath,
      PYTHONUNBUFFERED: '1',
      AI_API_KEY: lerEnvVar('AI_API_KEY'),
    }
  });

  event.sender.send('engine-status', nome, 'online');

  let stdoutBuffer = '';
  let stderrBuffer = '';

  processo.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    const linhas = stdoutBuffer.split('\n');
    stdoutBuffer = linhas.pop() || '';
    linhas.filter(l => l.trim() !== '').forEach(linha => {
      event.sender.send('log', `[${nome}] ${linha}`);
    });
  });

  processo.stderr.on('data', (data) => {
    stderrBuffer += data.toString();
    const linhas = stderrBuffer.split('\n');
    stderrBuffer = linhas.pop() || '';
    linhas.filter(l => l.trim() !== '').forEach(linha => {
      if (nome === 'IA-LOCAL') {
        event.sender.send('log', `[LLAMA.CPP] ${linha}`);
      } else {
        event.sender.send('log-error', `[${nome} ERRO] ${linha}`);
      }
    });
  });

  processo.on('close', (code) => {
    if (stdoutBuffer.trim()) event.sender.send('log', `[${nome}] ${stdoutBuffer}`);
    if (stderrBuffer.trim()) event.sender.send('log-error', `[${nome} ERRO] ${stderrBuffer}`);

    event.sender.send('log', `[SISTEMA] Motor ${nome} encerrado (Código ${code})`);
    event.sender.send('engine-status', nome, 'offline');
    delete processosAtivos[nome];

    if (Object.keys(processosAtivos).length === 0) {
      event.sender.send('status-update', 'offline');
    }
  });

  processo.on('error', (err) => {
    event.sender.send('log-error', `[${nome} ERRO] Falha ao iniciar processo: ${err.message}`);
    event.sender.send('engine-status', nome, 'offline');
    delete processosAtivos[nome];
  });

  processosAtivos[nome] = processo;
}

// ==========================================
// HELPER
// ==========================================
function lerExtensoesDesabilitadas() {
  try {
    if (!fs.existsSync(configPath)) return new Set();
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const list = Array.isArray(cfg.disabledExtensions) ? cfg.disabledExtensions : [];
    return new Set(list);
  } catch {
    return new Set();
  }
}

// ==========================================
// LIGA/DESLIGA TUDO
// ==========================================
ipcMain.on('start-bot', (event) => {
  event.sender.send('log', '> [ORQUESTRADOR] Iniciando ignição total dos motores...');
  event.sender.send('status-update', 'loading');

  const disabled = lerExtensoesDesabilitadas();
  if (disabled.size > 0) {
    event.sender.send('log', `[SISTEMA] ${disabled.size} extensão(ões) desabilitada(s): ${[...disabled].join(', ')}`);
  }

  const iniciarSeFaltando = (nome, comando, args, extensaoDona = null) => {
    if (extensaoDona && disabled.has(extensaoDona)) {
      event.sender.send('log', `[SISTEMA] ${nome} ignorado (extensão ${extensaoDona} desabilitada).`);
      event.sender.send('engine-status', nome, 'offline');
      return;
    }

    if (processosAtivos[nome] && processosAtivos[nome].exitCode === null) {
      event.sender.send('log', `[SISTEMA] ${nome} já está rodando, ignorando.`);
      return;
    }
    iniciarMotor(nome, comando, args, event);
  };

  iniciarSeFaltando('SCRAPER', 'node', ['scrapper_api.js'], 'scraper.js');
  iniciarSeFaltando('BOCA-TTS', 'python', ['falar_api.py'], 'voz_tts.js');
  iniciarSeFaltando('OUVIDO-STT', 'python', ['voz_api.py'], 'voz_stt.js');
  iniciarSeFaltando('IA-LOCAL', 'python', ['ia_server.py']);

  setTimeout(() => {
    iniciarSeFaltando('DISCORD-BOT', 'node', ['bot.js']);
    event.sender.send('status-update', 'online');
  }, 4000);
});

ipcMain.on('stop-bot', (event) => {
  event.sender.send('log', '> [ORQUESTRADOR] Iniciando desligamento dos motores...');

  const temProcessos = Object.keys(processosAtivos).length > 0;

  if (temProcessos) {
    for (const [nome, processo] of Object.entries(processosAtivos)) {
      matarArvoreDeProcessos(processo.pid);
      event.sender.send('log', `[SISTEMA] ${nome} desligado.`);
    }
    processosAtivos = {};
  } else {
    event.sender.send('log', '[SISTEMA] Nenhum motor ativo pra desligar.');
  }

  event.sender.send('status-update', 'offline');
  event.sender.send('engine-status', 'SCRAPER', 'offline');
  event.sender.send('engine-status', 'BOCA-TTS', 'offline');
  event.sender.send('engine-status', 'OUVIDO-STT', 'offline');
  event.sender.send('engine-status', 'IA-LOCAL', 'offline');
  event.sender.send('engine-status', 'DISCORD-BOT', 'offline');
  event.sender.send('log', '> [ORQUESTRADOR] Todos os serviços offline. VRAM liberada.');

  limparLlamaServersOrfaos();
});

// ==========================================
// HARDWARE
// ==========================================
ipcMain.handle('get-hardware-info', async () => {
  const hwInfo = {
    cpu: os.cpus()[0]?.model.trim() || 'Processador Desconhecido',
    threads: os.cpus().length,
    ramTotalGB: (os.totalmem() / 1024 ** 3).toFixed(1),
    ramFreeGB: (os.freemem() / 1024 ** 3).toFixed(1),
    gpus: [],
    cudaVersion: 'N/A'
  };

  if (process.platform === 'win32') {
    try {
      const smiOutput = execSync('nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader', { encoding: 'utf8', stdio: 'pipe' });
      const cudaVerOutput = execSync('nvcc --version', { encoding: 'utf8', stdio: 'pipe' });

      const cudaMatch = cudaVerOutput.match(/release (\d+\.\d+)/);
      if (cudaMatch) hwInfo.cudaVersion = cudaMatch[1];

      const lines = smiOutput.trim().split('\n');
      lines.forEach(line => {
        const parts = line.split(', ');
        if (parts.length === 3) {
          hwInfo.gpus.push({
            name: parts[0],
            vramTotal: parts[1],
            vramFree: parts[2],
            provider: 'NVIDIA'
          });
        }
      });
    } catch (e) {
      try {
        const psCmd = 'powershell.exe -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"';
        const psOut = execSync(psCmd, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }).trim();

        let gpus = [];
        try {
          const parsed = JSON.parse(psOut);
          gpus = Array.isArray(parsed) ? parsed : [parsed];
        } catch (err) {}

        for (const gpu of gpus) {
          const nome = gpu.Name || '';
          if (!nome) continue;
          const vramBytes = parseInt(gpu.AdapterRAM, 10) || 0;
          const lower = nome.toLowerCase();
          hwInfo.gpus.push({
            name: nome,
            vramTotal: vramBytes > 0 ? Math.round(vramBytes / 1024 ** 2) + ' MiB' : 'N/A',
            vramFree: 'N/A',
            provider: lower.includes('amd') || lower.includes('radeon') ? 'AMD (ROCm/HIP)' : 'Desconhecido'
          });
        }
      } catch (err) {}
    }
  }
  return hwInfo;
});

ipcMain.handle('evaluate-model-impact', async (event, fileSizeGB) => {
  const ramTotal = os.totalmem() / 1024 ** 3;
  let vramTotalGB = 0;

  try {
    const smiOutput = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', { encoding: 'utf8', stdio: 'pipe' });
    vramTotalGB = parseInt(smiOutput.trim(), 10) / 1024;
  } catch (e) {}

  const requiredMemory = parseFloat(fileSizeGB) + 1.5;

  let classification = 'Não recomendado';
  let speed = 'Lenta (CPU)';
  let impact = 'Alto';

  if (vramTotalGB >= requiredMemory) {
    classification = 'Excelente';
    speed = 'Muito Rápida (100% GPU)';
    impact = 'Baixo';
  } else if ((vramTotalGB + ramTotal) >= requiredMemory + 4) {
    classification = 'Aceitável';
    speed = 'Moderada (GPU + RAM Swap)';
    impact = 'Médio';
  }

  return { classification, speed, impact, estimatedMemory: `${requiredMemory.toFixed(1)} GB` };
});

ipcMain.on('renderer-ready', () => {
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }
});

// ==========================================
// AUTO UPDATER 
// ==========================================
ipcMain.handle('update-check', async () => {
  try {
    if (!app.isPackaged) {
      return { ok: false, error: 'Updater só funciona na versão empacotada.' };
    }
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, info: r?.updateInfo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('update-install', () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('update-get-version', () => {
  return { version: app.getVersion() };
});

// ==========================================
// CONFIG
// ==========================================
ipcMain.handle('get-config', () => {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return null;
});

ipcMain.handle('save-config', (event, newConfig) => {
  try {
    let existing = {};
    if (fs.existsSync(configPath)) {
      try { existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    }

    const merged = { ...existing, ...newConfig };

    if (!('disabledExtensions' in newConfig) && Array.isArray(existing.disabledExtensions)) {
      merged.disabledExtensions = existing.disabledExtensions;
    }

    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
    event.sender.send('log', '[SISTEMA] Configurações atualizadas com sucesso.');
    return true;
  } catch (error) {
    event.sender.send('log-error', `[SISTEMA ERRO] Falha ao salvar: ${error.message}`);
    return false;
  }
});

ipcMain.handle('select-model-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione o Modelo de IA Local',
    filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
    properties: ['openFile']
  });
  if (canceled) return null;
  return filePaths[0];
});

const modelsDir = path.join(app.getPath('userData'), 'models');

ipcMain.handle('list-downloaded-models', async () => {
  if (!fs.existsSync(modelsDir)) return [];
  const results = [];
  const walk = (dir, baseDir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, baseDir);
      } else if (entry.name.toLowerCase().endsWith('.gguf')) {
        try {
          const stats = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            relative: path.relative(baseDir, fullPath),
            size: stats.size,
            modified: stats.mtimeMs,
          });
        } catch {}
      }
    }
  };
  try { walk(modelsDir, modelsDir); } catch {}
  return results.sort((a, b) => b.modified - a.modified);
});

ipcMain.handle('load-ai-model', async (event, modelPath) => {
  if (!fs.existsSync(modelPath)) return false;
  if (processosAtivos['IA-LOCAL']) {
    matarArvoreDeProcessos(processosAtivos['IA-LOCAL'].pid);
    delete processosAtivos['IA-LOCAL'];
    await new Promise(r => setTimeout(r, 800));
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.modelPath = modelPath;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) { return false; }
  iniciarMotor('IA-LOCAL', 'python', ['ia_server.py'], event);
  return true;
});

ipcMain.handle('unload-ai-model', async (event) => {
  if (processosAtivos['IA-LOCAL']) {
    matarArvoreDeProcessos(processosAtivos['IA-LOCAL'].pid);
    delete processosAtivos['IA-LOCAL'];
    return true;
  }
  return false;
});

// ==========================================
// AI PROVIDER (OpenAI-compatible)
// ==========================================
ipcMain.handle('get-ai-config', async () => {
  try {
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
    return {
      ok: true,
      provider: cfg.aiProvider || 'local',
      model: cfg.aiModel || '',
      baseUrl: cfg.apiBaseUrl || 'https://api.openai.com/v1',
      hasKey: !!lerEnvVar('AI_API_KEY'),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('save-ai-config', async (event, { provider, model, baseUrl, apiKey }) => {
  try {
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
    cfg.aiProvider = provider || 'local';
    cfg.aiModel    = model || '';
    cfg.apiBaseUrl = baseUrl || 'https://api.openai.com/v1';
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

    if (apiKey !== undefined && apiKey !== null && apiKey !== '') {
      salvarEnvVar('AI_API_KEY', apiKey);
    }

    event.sender.send('log', `[SISTEMA] Provider IA salvo: ${cfg.aiProvider}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('validate-api-key', async (event, { baseUrl, apiKey }) => {
  try {
    if (!baseUrl || !apiKey) return { ok: false, error: 'baseUrl e apiKey obrigatórios' };

    const url = `${baseUrl.replace(/\/+$/, '')}/models`;
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      timeout: 12000,
    });

    const models = (resp.data?.data || []).map(m => m.id).slice(0, 100);
    return { ok: true, models };
  } catch (e) {
    let msg = e.message;
    if (e.response?.status === 401) msg = 'API key inválida';
    else if (e.response?.status === 403) msg = 'API key sem permissão';
    else if (e.response?.status === 404) msg = 'Endpoint /models não encontrado (baseUrl errado?)';
    else if (e.code === 'ENOTFOUND') msg = 'Não consegui resolver o domínio (offline?)';
    return { ok: false, error: msg };
  }
});

ipcMain.handle('switch-provider', async (event) => {
  event.sender.send('log', '[SISTEMA] Reiniciando engine de IA...');
  if (processosAtivos['IA-LOCAL']) {
    matarArvoreDeProcessos(processosAtivos['IA-LOCAL'].pid);
    delete processosAtivos['IA-LOCAL'];
    await new Promise(r => setTimeout(r, 800));
  }
  iniciarMotor('IA-LOCAL', 'python', ['ia_server.py'], event);
  return { ok: true };
});

// ==========================================
// LEITOR DE EXTENSÕES
// ==========================================
ipcMain.handle('list-extensions', () => {
  const extDir = path.join(BACKEND_PATH, 'extensions');
  if (!fs.existsSync(extDir)) return [];

  let disabled = [];
  try {
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      disabled = Array.isArray(cfg.disabledExtensions) ? cfg.disabledExtensions : [];
    }
  } catch (e) {}
  const disabledSet = new Set(disabled);

  const results = [];
  const files = fs.readdirSync(extDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(extDir, file), 'utf8');
      const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
      const verMatch  = content.match(/version:\s*['"]([^'"]+)['"]/);
      const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
      const idMatch   = content.match(/id:\s*['"]([^'"]+)['"]/);
      const iconMatch = content.match(/icon:\s*['"]([^'"]+)['"]/);

      results.push({
        file,
        id: idMatch ? idMatch[1] : file.replace(/\.js$/, ''),
        name: nameMatch ? nameMatch[1] : file.replace(/\.js$/, ''),
        version: verMatch ? verMatch[1] : '1.0.0',
        description: descMatch ? descMatch[1] : 'Plugin local do sistema.',
        icon: iconMatch ? iconMatch[1] : null,
        enabled: !disabledSet.has(file)
      });
    } catch (e) {
      results.push({
        file,
        id: file.replace(/\.js$/, ''),
        name: file.replace(/\.js$/, ''),
        version: '?',
        description: 'Falha ao ler metadados.',
        icon: null,
        enabled: !disabledSet.has(file)
      });
    }
  }
  return results;
});

ipcMain.handle('toggle-extension', (event, filename, enabled) => {
  try {
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

    let list = Array.isArray(cfg.disabledExtensions) ? cfg.disabledExtensions : [];

    if (enabled) {
      list = list.filter(f => f !== filename);
    } else {
      if (!list.includes(filename)) list.push(filename);
    }

    cfg.disabledExtensions = list;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

    event.sender.send('log', `[SISTEMA] Extensão ${enabled ? 'ativada' : 'desativada'}: ${filename}`);
    return { ok: true, disabledExtensions: list };
  } catch (e) {
    event.sender.send('log-error', `[SISTEMA ERRO] Falha ao alternar extensão ${filename}: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ==========================================
// LLAMA MANAGER
// ==========================================
ipcMain.handle('llama-detect', async () => {
  try {
    const gpu = llamaMgr.detectarGPUWindows();
    const build = llamaMgr.escolherBuild(gpu);
    const instalado = llamaMgr.buildJaInstalado();

    return {
      ok: true,
      gpu,
      buildRecomendado: build,
      instalado,
      llamaDir: llamaMgr.getLlamaDir(),
      serverPath: llamaMgr.getLlamaServerPath(),
    };
  } catch (e) {
    console.error('[IPC llama-detect]', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('llama-download', async (event, buildTipo) => {
  try {
    const result = await llamaMgr.baixarLlamaServer(buildTipo, (status) => {
      event.sender.send('llama-download-status', status);
    });

    if (result.ok) {
      try {
        const cfg = fs.existsSync(configPath)
          ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
          : {};
        cfg.llamaServerPath = result.serverPath;
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        event.sender.send('log', `[LLAMA-MGR] Path salvo no config: ${result.serverPath}`);
      } catch (e) {
        console.error('[LLAMA-MGR] Falha ao salvar config:', e.message);
      }
    }

    return result;
  } catch (e) {
    console.error('[IPC llama-download]', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('llama-uninstall', async () => {
  try {
    const ok = llamaMgr.desinstalar();
    return { ok };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ==========================================
// DOWNLOAD MANAGER
// ==========================================
const activeDownloads = new Map();

ipcMain.on('download-model', async (event, { url, filename }) => {
  const destPath = path.join(modelsDir, filename);
  const destDir = path.dirname(destPath);

  if (activeDownloads.has(filename)) return;

  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const controller = new AbortController();
    activeDownloads.set(filename, controller);

    event.sender.send('log', `[DOWNLOADER] Iniciando download: ${filename}`);
    event.sender.send('download-progress', { filename, progress: 0, speed: 0, downloaded: 0, total: 0 });

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      maxRedirects: 10,
      timeout: 0,
      signal: controller.signal,
      headers: { 'User-Agent': 'LocalBotStudio/0.7' }
    });

    const totalLength = parseInt(response.headers['content-length'], 10) || 0;
    let downloaded = 0;
    let lastReport = -1;
    let lastSpeedBytes = 0;
    let lastSpeedTime = Date.now();

    const writer = fs.createWriteStream(destPath);

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalLength > 0) {
        const progress = Math.floor((downloaded / totalLength) * 100);
        if (progress !== lastReport) {
          lastReport = progress;
          const now = Date.now();
          const elapsed = (now - lastSpeedTime) / 1000;
          let speed = 0;
          if (elapsed >= 0.5) {
            speed = (downloaded - lastSpeedBytes) / elapsed;
            lastSpeedBytes = downloaded;
            lastSpeedTime = now;
          }
          event.sender.send('download-progress', { filename, progress, speed: Math.round(speed), downloaded, total: totalLength });
        }
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      activeDownloads.delete(filename);
      event.sender.send('log', `[DOWNLOADER] Download concluído: ${destPath}`);
      event.sender.send('download-complete', { filename, path: destPath });
    });

    writer.on('error', (err) => {
      activeDownloads.delete(filename);
      fs.unlink(destPath, () => {});
      event.sender.send('log-error', `[DOWNLOADER ERRO] Gravação no disco falhou: ${err.message}`);
      event.sender.send('download-error', { filename, error: err.message });
    });

  } catch (error) {
    activeDownloads.delete(filename);

    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      event.sender.send('log', `[DOWNLOADER] Download cancelado pelo usuário: ${filename}`);
      event.sender.send('download-error', { filename, error: 'Cancelado' });
    } else {
      const detail = error.response?.status ? `HTTP ${error.response.status}` : error.message;
      event.sender.send('log-error', `[DOWNLOADER ERRO] Falha ao baixar ${filename}: ${detail}`);
      event.sender.send('download-error', { filename, error: detail });
    }

    if (fs.existsSync(destPath)) fs.unlink(destPath, () => {});
  }
});

// ==========================================
// REMOVER MODELO BAIXADO
// ==========================================
ipcMain.handle('delete-model', async (event, modelPath) => {
  try {
    if (!fs.existsSync(modelPath)) {
      return { ok: false, error: 'Arquivo não encontrado' };
    }

    const resolved = path.resolve(modelPath);
    const modelsResolved = path.resolve(modelsDir);
    if (!resolved.startsWith(modelsResolved)) {
      return { ok: false, error: 'Path fora da pasta de modelos' };
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.modelPath && path.resolve(config.modelPath) === resolved) {
        if (processosAtivos['IA-LOCAL']) {
          matarArvoreDeProcessos(processosAtivos['IA-LOCAL'].pid);
          delete processosAtivos['IA-LOCAL'];
        }
        config.modelPath = '';
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        event.sender.send('log', '[SISTEMA] Modelo em uso foi descarregado antes da remoção.');
      }
    } catch (e) { }

    fs.unlinkSync(modelPath);
    event.sender.send('log', `[SISTEMA] Modelo removido: ${path.basename(modelPath)}`);
    return { ok: true };
  } catch (e) {
    event.sender.send('log-error', `[SISTEMA ERRO] Falha ao remover modelo: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

ipcMain.on('cancel-download', (event, filename) => {
  if (activeDownloads.has(filename)) {
    const controller = activeDownloads.get(filename);
    controller.abort();
    activeDownloads.delete(filename);
  }
});

// ==========================================
// Portal do Discord 
// ==========================================
let devPortalWindow = null;

ipcMain.handle('discord-portal-open', async (event) => {
  if (devPortalWindow && !devPortalWindow.isDestroyed()) {
    devPortalWindow.focus();
    return { ok: true, jaAberto: true };
  }

  try {
    devPortalWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      title: 'LocalBot Studio — Conectar Discord',
      backgroundColor: '#0E0E11',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:discord-dev',
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    devPortalWindow.setMenu(null);
    devPortalWindow.setMenuBarVisibility(false);
    devPortalWindow.on('page-title-updated', (e) => e.preventDefault());
    devPortalWindow.loadURL('https://discord.com/developers/applications');

    devPortalWindow.on('closed', () => {
      devPortalWindow = null;
      console.log('[DEV-PORTAL] Fechado pelo usuário');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('discord-portal-closed');
      }
    });

    devPortalWindow.once('ready-to-show', () => {
      devPortalWindow.show();
    });

    console.log('[DEV-PORTAL] Aberto');
    return { ok: true };
  } catch (e) {
    console.error('[DEV-PORTAL] Erro:', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('discord-portal-close', async () => {
  fecharDevPortal();
  return { ok: true };
});

function fecharDevPortal() {
  if (devPortalWindow && !devPortalWindow.isDestroyed()) {
    devPortalWindow.close();
    devPortalWindow = null;
  }
}

// ==========================================
// BOT SETUP
// ==========================================
ipcMain.handle('get-token-status', async () => {
  try {
    if (!fs.existsSync(ENV_PATH)) return { configurado: false };

    const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = envContent.match(/^TOKEN=(.+)$/m);
    if (!match || !match[1].trim()) return { configurado: false };

    return { configurado: true };
  } catch (e) {
    return { configurado: false, error: e.message };
  }
});

ipcMain.handle('save-discord-token', async (event, token) => {
  try {
    let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';

    envContent = envContent.replace(/^TOKEN=.*$/gm, '').replace(/\n\n+/g, '\n').trim();
    if (envContent && !envContent.endsWith('\n')) envContent += '\n';
    envContent += `TOKEN=${token.trim()}\n`;

    fs.writeFileSync(ENV_PATH, envContent);
    event.sender.send('log', '[SISTEMA] Token do Discord salvo no .env');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('validar-token-discord', async (event, token) => {
  try {
    if (!token || token.trim().length < 20) {
      return { ok: false, error: 'Token muito curto' };
    }

    const resp = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token.trim()}` },
      timeout: 10000
    });

    return {
      ok: true,
      botId: resp.data.id,
      botNome: resp.data.username,
      botTag: `${resp.data.username}#${resp.data.discriminator || '0'}`
    };
  } catch (e) {
    let msg = e.message;
    if (e.response?.status === 401) msg = 'Token inválido ou expirado';
    else if (e.response?.status === 403) msg = 'Token sem permissões válidas';
    return { ok: false, error: msg };
  }
});

// ==========================================
// CLEANUP
// ==========================================
app.on('will-quit', () => {
  fecharDevPortal();
  for (const processo of Object.values(processosAtivos)) {
    matarArvoreDeProcessos(processo.pid);
  }
  limparLlamaServersOrfaos();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});