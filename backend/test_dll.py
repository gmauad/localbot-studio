import ctypes
import os
import sysconfig

site = sysconfig.get_paths()["purelib"]
lib_dir = os.path.join(site, "llama_cpp", "lib")
cuda_dir = os.path.join(site, "nvidia", "cu13", "bin", "x86_64")

print("=== Registrando diretórios ===")
os.add_dll_directory(lib_dir)
os.add_dll_directory(cuda_dir)
print(f"lib: {lib_dir}")
print(f"cuda: {cuda_dir}")

dlls = [
    ("ggml-base.dll", lib_dir),
    ("ggml-cpu.dll", lib_dir),
    ("ggml-cuda.dll", lib_dir),
    ("llama.dll", lib_dir),
]

print("\n=== Testando cada DLL ===")
for name, folder in dlls:
    path = os.path.join(folder, name)
    if not os.path.exists(path):
        print(f"[FALTA] {name}")
        continue
    try:
        ctypes.CDLL(path)
        print(f"[OK]    {name}")
    except OSError as e:
        print(f"[ERRO]  {name}: {e}")