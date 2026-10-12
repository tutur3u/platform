"""Finite local embedding adapter. Input stays on stdin; no remote providers."""
import argparse
import importlib.metadata
import importlib.resources
import inspect
import hashlib
import json
import math
import platform
import resource
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--model")
    parser.add_argument("--cache")
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    from litert_lm import Backend, EmbeddingEngine, EmbeddingOptions, InputOverflowStrategy
    from litert_lm.embedding_engine import _get_lib
    version = importlib.metadata.version("litert-lm-api")
    if version != "0.18.0":
        raise ValueError("runtime version is not the approved version")
    library_path = Path(str(importlib.resources.files("litert_lm") / "liblitert-lm.dylib")).resolve(strict=True)
    library_hash = hashlib.sha256()
    with library_path.open("rb") as native:
        while block := native.read(65536):
            library_hash.update(block)
    if library_hash.hexdigest() != "cbec999a8156f10d277484ad3c6b6d9ac012375c4a03019aa1b0eab68ccaa4e9":
        raise ValueError("native library differs from the verified publisher wheel")
    library = _get_lib()
    getattr(library, "litert_lm_embedding_engine_create")
    if args.probe:
        print(json.dumps({"runtimeVersion": version, "python": platform.python_version(),
                          "platform": platform.machine(), "engine": str(inspect.signature(EmbeddingEngine)),
                          "compute": str(inspect.signature(EmbeddingEngine.compute_embedding)),
                          "nativeEmbeddingSymbol": True, "nativeLibraryHash": library_hash.hexdigest(),
                          "modelLoaded": False,
                          "packages": {name: importlib.metadata.version(name) for name in ["litert-lm", "litert-lm-api", "litert-lm-builder", "absl-py", "click", "flatbuffers", "prompt_toolkit", "wcwidth", "protobuf", "questionary", "tomli", "typing_extensions"]}}))
        return
    if not args.model or not args.cache:
        raise ValueError("explicit model and private cache paths required")
    payload = sys.stdin.buffer.read(16385)
    if len(payload) > 16384:
        raise ValueError("embedding request exceeds byte bound")
    request = json.loads(payload)
    text = request["text"]
    if not isinstance(text, str) or len(text.encode()) > 8192:
        raise ValueError("embedding text exceeds byte bound")
    model = Path(args.model).resolve(strict=True)
    cache = Path(args.cache).resolve(strict=True)
    if model.stat().st_mode & 0o077 or cache.stat().st_mode & 0o077:
        raise ValueError("model and runtime cache must be private")
    with EmbeddingEngine(str(model), backend=Backend.CPU(thread_count=1),
                         max_input_length=512) as engine:
        response = engine.compute_embedding(text, options=EmbeddingOptions(normalize=True, output_size=768, input_overflow_strategy=InputOverflowStrategy.ERROR))
        vector = list(response.embedding)
    if len(vector) != 768 or not all(math.isfinite(value) for value in vector) or not any(vector):
        raise ValueError("invalid model embedding")
    print(json.dumps({"embedding": vector, "runtimeVersion": version, "recipe": "litert-docs-0.18-text-v1"}))


if __name__ == "__main__":
    main()
