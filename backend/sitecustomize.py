# sitecustomize.py — roda automaticamente antes de qualquer import
import os
import sysconfig
import glob


def _register_dlls():
    try:
        site_packages = sysconfig.get_paths()["purelib"]
    except Exception as e:
        print(f"[IA ENGINE AVISO] sysconfig falhou: {e}")
        return

    folders_to_register = set()

    # 1) Todas as pastas nvidia/**/ com DLLs (cu13, cublas, cuda_runtime, etc)
    nvidia_root = os.path.join(site_packages, "nvidia")
    if os.path.isdir(nvidia_root):
        for dll in glob.glob(os.path.join(nvidia_root, "**", "*.dll"), recursive=True):
            folders_to_register.add(os.path.dirname(dll))

    # 2) A pasta lib/ do llama_cpp (contém llama.dll, ggml*.dll)
    llama_lib = os.path.join(site_packages, "llama_cpp", "lib")
    if os.path.isdir(llama_lib):
        folders_to_register.add(llama_lib)

    # 3) Registra cada pasta E adiciona ao PATH (redundância proposital)
    registered = []
    for folder in sorted(folders_to_register):
        try:
            os.add_dll_directory(folder)
            # Reforço: adiciona ao PATH do processo também
            os.environ["PATH"] = folder + os.pathsep + os.environ.get("PATH", "")
            registered.append(folder)
        except (FileNotFoundError, OSError) as e:
            print(f"[IA ENGINE AVISO] Falha ao registrar {folder}: {e}")

    if registered:
        print(f"[IA ENGINE] {len(registered)} pasta(s) de DLL registradas:")
        for r in registered:
            short = r.replace(site_packages, "...")
            count = len(glob.glob(os.path.join(r, "*.dll")))
            print(f"[IA ENGINE]   {short}  ({count} DLLs)")
    else:
        print("[IA ENGINE AVISO] Nenhuma pasta encontrada pra registrar.")


_register_dlls()