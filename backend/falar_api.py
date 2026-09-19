import asyncio
import edge_tts
import os
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)

print("[SISTEMA] Motor de Boca (TTS) ONLINE na porta 5000!")
@app.route('/falar', methods=['POST'])
def gerar_voz():
    texto = ""
    # Tenta pegar de todas as formas possíveis para nunca falhar
    if request.is_json:
        dados = request.json
        if dados:
            texto = dados.get('texto', '')
    elif request.form:
        texto = request.form.get('texto', '')
    
    # Se ainda estiver vazio, tenta ler o corpo bruto da requisição
    if not texto and request.data:
        texto = request.data.decode('utf-8', errors='ignore')

    if not texto.strip():
        print("[AVISO] Requisição recebida, mas o texto veio totalmente vazio.")
        return jsonify({"erro": "Sem texto"}), 400
        
    print(f"[BOCA]: {texto}")
    
    voz = "pt-BR-AntonioNeural" 
    caminho_saida = "resposta_tts.mp3"

    async def run_tts():
        communicate = edge_tts.Communicate(texto.strip(), voz, rate="+15%")
        await communicate.save(caminho_saida)

    try:
        asyncio.run(run_tts())
        return send_file(caminho_saida, mimetype="audio/mpeg")
    except Exception as e:
        print(f"[ERRO] Falha ao gerar voz: {e}")
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)