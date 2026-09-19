import os
import sys

# ============================================================
# 1) REGISTRA DLLs DO CUDA (mesmo mecanismo do ia_server)
# ============================================================
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import sitecustomize  # noqa: F401
except ImportError:
    pass

import numpy as np
from scipy import signal
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

# ============================================================
# 2) CONFIGURAÇÃO — WHISPER NA CPU
# ============================================================
# Roda o Whisper na CPU int8 pra liberar ~500MB de VRAM pro LLM.
# Trade-off: transcrição ~1s mais lenta, mas LLM fica em 28 t/s.
# Se quiser GPU de volta, troca DISPOSITIVO pra "cuda" e PRECISAO pra "float16".
MODELO = "small"
DISPOSITIVO = "cpu"
PRECISAO = "int8"

app = Flask(__name__)

print(f"[SISTEMA] Carregando Faster-Whisper '{MODELO}' em {DISPOSITIVO}/{PRECISAO}...")

modelo_stt = None
try:
    modelo_stt = WhisperModel(MODELO, device=DISPOSITIVO, compute_type=PRECISAO)
    print(f"[SISTEMA] Motor de Ouvido ONLINE na porta 4000 ({DISPOSITIVO.upper()})!")
except Exception as e:
    print(f"[SISTEMA] Falha no setup '{DISPOSITIVO}/{PRECISAO}': {e}")
    print("[SISTEMA] Tentando fallback CPU int8...")
    try:
        modelo_stt = WhisperModel(MODELO, device="cpu", compute_type="int8")
        print("[SISTEMA] Motor de Ouvido ONLINE na porta 4000 (CPU int8)!")
    except Exception as e2:
        print(f"[SISTEMA ERRO FATAL] Não consegui carregar o Whisper: {e2}")
        sys.exit(1)


@app.route('/transcrever', methods=['POST'])
def transcrever_audio():
    if 'audio' not in request.files:
        return jsonify({"erro": "Nenhum áudio enviado"}), 400
    try:
        raw_data = request.files['audio'].read()
        if not raw_data:
            return jsonify({"erro": "Áudio vazio"}), 400

        # Decodifica PCM int16 estéreo 48kHz → mono 16kHz float32
        audio_int16 = np.frombuffer(raw_data, dtype=np.int16)
        audio_stereo = audio_int16.reshape(-1, 2)
        audio_mono = audio_stereo.mean(axis=1)
        audio_16k = signal.decimate(audio_mono, 3)
        audio_float32 = audio_16k.astype(np.float32) / 32768.0

        segments, info = modelo_stt.transcribe(
            audio_float32,
            language="pt",
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        texto = "".join([segment.text for segment in segments]).strip()

        if texto:
            print(f"[OUVIDO]: {texto}")
        return jsonify({"texto": texto})

    except Exception as e:
        return jsonify({"erro": str(e)}), 500


if __name__ == '__main__':
    app.run(port=4000, threaded=True)