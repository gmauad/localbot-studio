import os
import torch
import base64
import io
from PIL import Image
from flask import Flask, request, send_file, jsonify
from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
caminho_cuda = r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin"
os.environ["PATH"] = caminho_cuda + os.pathsep + os.environ.get("PATH", "")
if hasattr(os, 'add_dll_directory'):
    os.add_dll_directory(caminho_cuda)
app = Flask(__name__)

print("[SISTEMA] Carregando Modelos Visuais na VRAM...")
# Carrega o modelo base forçando o download e uso dos tensores em float16 nativo
pipe_txt2img = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5", 
    torch_dtype=torch.float16,
    variant="fp16"
).to("cuda")
pipe_txt2img.safety_checker = None

# Transfere os componentes para o motor de edição reaproveitando a VRAM
pipe_img2img = StableDiffusionImg2ImgPipeline(**pipe_txt2img.components)
print("[SISTEMA] Motor Visual ONLINE na porta 6000!")

@app.route('/gerar', methods=['POST'])
def gerar_imagem():
    dados = request.json
    if not dados or 'prompt' not in dados:
        return jsonify({"erro": "Parâmetro 'prompt' ausente"}), 400

    prompt = dados['prompt']
    print(f"[VISÃO] Criando do zero: {prompt}")

    try:
        image = pipe_txt2img(prompt, num_inference_steps=25).images[0]
        caminho = "imagem_gerada.png"
        image.save(caminho)
        return send_file(caminho, mimetype='image/png')
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

@app.route('/editar', methods=['POST'])
def editar_imagem():
    dados = request.json
    if not dados or 'prompt' not in dados or 'imagem' not in dados:
        return jsonify({"erro": "Parâmetros 'prompt' ou 'imagem' ausentes"}), 400

    prompt = dados['prompt']
    imagem_b64 = dados['imagem'].split(',')[1] if ',' in dados['imagem'] else dados['imagem']
    
    print(f"[VISÃO] Editando imagem com prompt: {prompt}")

    try:
        # Decodifica a imagem recebida do Node.js
        image_data = base64.b64decode(imagem_b64)
        init_image = Image.open(io.BytesIO(image_data)).convert("RGB")
        
        # O Stable Diffusion trabalha melhor com múltiplos de 8. Redimensionamos para o padrão.
        init_image = init_image.resize((512, 512))

        # strength=0.7 dita o quanto a imagem vai mudar (1.0 muda tudo, 0.1 quase nada)
        image = pipe_img2img(prompt=prompt, image=init_image, strength=0.7, guidance_scale=7.5, num_inference_steps=25).images[0]
        caminho = "imagem_editada.png"
        image.save(caminho)
        
        return send_file(caminho, mimetype='image/png')
    except Exception as e:
        print(f"[ERRO] Falha na edição visual: {e}")
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(port=6000)