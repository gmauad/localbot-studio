import json
import os
import subprocess
import sys
import atexit
import re

# FIX DO WINDOWS
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

server_process = None
PORTA = 1234


def cleanup():
    global server_process
    if server_process and server_process.poll() is None:
        print("\n[IA ENGINE] Encerrando subprocesso graciosamente...")
        server_process.terminate()
        try:
            server_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            print("[IA ENGINE] Kill forçado...")
            server_process.kill()
            server_process.wait()


atexit.register(cleanup)


# ==========================================================
# MODO LOCAL — comportamento atual (spawna llama-server.exe)
# ==========================================================
def resolver_binario(config_data):
    config_path = config_data.get("llamaServerPath")
    if config_path:
        config_path = os.path.expandvars(config_path)
        if os.path.exists(config_path):
            print(f"[IA ENGINE] Binário via config: {config_path}")
            return config_path
        print(f"[IA ENGINE AVISO] llamaServerPath não existe: {config_path}")

    legado = os.path.join(os.path.dirname(__file__), 'bin', 'llama-server.exe')
    if os.path.exists(legado):
        print(f"[IA ENGINE] Binário via fallback: {legado}")
        return legado
    return None


def modo_local(config_data):
    global server_process
    print("[IA ENGINE] Modo: LOCAL (llama.cpp)")

    model_path = config_data.get("modelPath", "")
    if not model_path:
        print("[IA ENGINE ERRO] Nenhum modelo configurado em modelPath.")
        sys.exit(1)
    if not os.path.exists(model_path):
        print(f"[IA ENGINE ERRO] Modelo não encontrado: {model_path}")
        sys.exit(1)

    bin_path = resolver_binario(config_data)
    if not bin_path:
        print("[IA ENGINE ERRO] llama-server.exe não encontrado.")
        sys.exit(1)

    ctx_por_slot = int(config_data.get("contextSize", 4096))
    n_slots = int(config_data.get("nParallel", 4))
    ctx_total = ctx_por_slot * n_slots

    gpu_layers = str(config_data.get("gpuLayers", -1))
    n_threads = str(config_data.get("nThreads", 6))
    n_threads_batch = str(config_data.get("nThreadsBatch", 12))
    n_batch = str(config_data.get("nBatch", 2048))
    n_ubatch = str(config_data.get("nUbatch", 512))

    print(f"[IA ENGINE] Modelo: {os.path.basename(model_path)}")
    print(f"[IA ENGINE] Config: {gpu_layers} GPU Layers | Ctx: {ctx_por_slot}/slot × {n_slots}")

    cmd = [
        bin_path, "-m", model_path, "-c", str(ctx_total),
        "--parallel", str(n_slots), "--n-gpu-layers", gpu_layers,
        "-fa", "on", "-t", n_threads, "-tb", n_threads_batch,
        "-b", n_batch, "-ub", n_ubatch, "-cb", "-lv", "1",
        "--reasoning", "off", "--host", "127.0.0.1", "--port", str(PORTA),
    ]

    try:
        server_process = subprocess.Popen(
            cmd, cwd=os.path.dirname(bin_path),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=0, encoding='utf-8', errors='replace',
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
    except Exception as e:
        print(f"[IA ENGINE ERRO] Falha ao iniciar binário: {e}")
        sys.exit(1)

    re_eval_time   = re.compile(r"eval time\s*=.*?([\d.]+)\s*tokens per second", re.IGNORECASE)
    re_prompt_eval = re.compile(r"prompt eval time\s*=.*?([\d.]+)\s*tokens per second", re.IGNORECASE)
    re_total_time  = re.compile(r"total time\s*=\s*([\d.]+)\s*ms", re.IGNORECASE)
    re_tg_live     = re.compile(r"n_gen\s*=\s*\d+.*?tg\s*=\s*([\d.]+)\s*t/s", re.IGNORECASE)

    lixo = [
        'common_memory_breakdown_print', 'common_params_fit_impl', 'common_fit_params',
        'llama_model_loader', 'print_info:', 'load_tensors:', 'llama_kv_cache',
        'llama_context:', 'sched_reserve:', 'resolve_fused_ops:',
        'llama_prepare_model_devices', 'llama_new_context_with_model',
        'common_chat_try_specialized_template', 'common_init_:', 'cmn  common_param',
        'slot launch_slot_', 'slot get_availabl', 'slot process_sing',
        'slot create_check', 'slot init_sampler', 'slot   operator', 'slot      release',
    ]

    while True:
        linha = server_process.stdout.readline()
        if not linha and server_process.poll() is not None:
            break
        if not linha:
            continue
        linha = linha.strip()
        if not linha:
            continue
        lower = linha.lower()

        if ("error" in lower or "fail" in lower) and "no error" not in lower:
            print(f"[IA ENGINE ERRO] {linha}"); continue
        if "listening on" in lower or "http server listening" in lower:
            print("[IA ENGINE] Servidor C++ Online na porta 1234!"); continue
        if "load_model" in lower or "n_slots" in lower:
            print(f"[IA ENGINE] [BOOT] {linha}"); continue
        if "prompt eval time" in lower:
            m = re_prompt_eval.search(linha)
            if m: print(f"[IA ENGINE] [METRICA] Prompt: {m.group(1)} tokens/s")
            continue
        if "eval time" in lower:
            m = re_eval_time.search(linha)
            if m: print(f"[IA ENGINE] [METRICA] Geração: {m.group(1)} tokens/s")
            continue
        m = re_tg_live.search(linha)
        if m:
            print(f"[IA ENGINE] [METRICA] Live tg: {m.group(1)} t/s"); continue
        if "total time" in lower:
            m = re_total_time.search(linha)
            if m: print(f"[IA ENGINE] [METRICA] Tempo total: {m.group(1)} ms")
            continue
        if any(p in linha for p in lixo):
            continue
        print(f"[LLAMA.CPP] {linha}")


# ==========================================================
# MODO PROXY — repassa pra API paga OpenAI-compatible
# ==========================================================
def modo_proxy(config_data):
    try:
        from fastapi import FastAPI, Request
        from fastapi.responses import StreamingResponse
        import httpx
        import uvicorn
    except ImportError as e:
        print(f"[IA ENGINE ERRO] Deps faltando: {e}")
        print("[IA ENGINE ERRO] Rode: pip install fastapi uvicorn httpx")
        sys.exit(1)

    base_url = (config_data.get("apiBaseUrl") or "https://api.openai.com/v1").rstrip("/")
    api_key  = os.environ.get("AI_API_KEY", "") or config_data.get("apiKey", "")
    model    = config_data.get("aiModel", "")

    if not api_key:
        print("[IA ENGINE ERRO] AI_API_KEY vazio. Configure no Setup.")
        sys.exit(1)

    print(f"[IA ENGINE] Modo: PROXY → {base_url}")
    print(f"[IA ENGINE] Modelo: {model or '(passthrough)'}")

    app = FastAPI()

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    async def proxy(path: str, request: Request):
        # Downstream chama /v1/chat/completions → base_url já tem /v1
        # então removemos o /v1/ do path pra não duplicar
        clean_path = path[3:] if path.startswith("v1/") else path
        url = f"{base_url}/{clean_path}"

        body_bytes = await request.body()

        # Override do campo "model" se o usuário configurou um
        if body_bytes and model:
            try:
                body_json = json.loads(body_bytes)
                if isinstance(body_json, dict) and body_json.get("model"):
                    body_json["model"] = model
                    body_bytes = json.dumps(body_json).encode()
            except Exception:
                pass

        headers = dict(request.headers)
        for h in ("host", "content-length", "connection"):
            headers.pop(h, None)
        headers["authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=None) as client:
            req = client.build_request(
                request.method, url, headers=headers,
                content=body_bytes, params=dict(request.query_params),
            )
            resp = await client.send(req, stream=True)

            resp_headers = {
                k: v for k, v in resp.headers.items()
                if k.lower() not in ("content-encoding", "content-length", "transfer-encoding", "connection")
            }

            return StreamingResponse(
                resp.aiter_raw(), status_code=resp.status_code, headers=resp_headers,
            )

    print(f"[IA ENGINE] Proxy online em http://127.0.0.1:{PORTA}")
    uvicorn.run(app, host="127.0.0.1", port=PORTA, log_level="warning")


# ==========================================================
# ENTRYPOINT
# ==========================================================
def main():
    print("\n[IA ENGINE] Inicializando...")

    config_path = os.environ.get('LBS_CONFIG_PATH') or os.path.join(os.path.dirname(__file__), 'config.json')
    print(f"[IA ENGINE] Config: {config_path}")

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
    except Exception as e:
        print(f"[IA ENGINE ERRO] Falha ao ler config: {e}")
        sys.exit(1)

    provider = config_data.get("aiProvider", "local")
    print(f"[IA ENGINE] Provider: {provider}")

    if provider == "local":
        modo_local(config_data)
    else:
        modo_proxy(config_data)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        cleanup()