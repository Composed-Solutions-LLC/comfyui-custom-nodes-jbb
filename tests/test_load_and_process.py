import sys
import types
from pathlib import Path
import pytest

# Try to import runtime dependencies; skip if not available (torch/Pillow are needed)
try:
    from PIL import Image
    import torch
except Exception as e:
    pytest.skip(f"Skipping tests because required runtime packages are missing: {e}", allow_module_level=True)

# --- Mock minimal comfy/comfy_api modules so tests run without ComfyUI installed ---
# Create a fake comfy package and comfy.comfy_types
comfy_types = types.ModuleType("comfy.comfy_types")
comfy_types.IO = types.SimpleNamespace(STRING="STRING", BOOL="BOOL")
comfy_types.ComfyNodeABC = object
comfy_types.InputTypeDict = dict
sys.modules["comfy.comfy_types"] = comfy_types

# Create a fake comfy.model_management with the needed helper functions
model_management = types.ModuleType("comfy.model_management")
model_management.intermediate_dtype = lambda: torch.float32
model_management.intermediate_device = lambda: "cpu"
sys.modules["comfy.model_management"] = model_management

# Ensure top-level comfy module exists
sys.modules["comfy"] = types.ModuleType("comfy")

# Create a fake comfy_api.latest.InputImpl that falls back to Pillow (raise in get_components)
comfy_api_latest = types.ModuleType("comfy_api.latest")
class _DummyVideoFromFile:
    def __init__(self, path):
        self.path = path
    def get_components(self):
        # Signal to the loader to fall back to pillow by raising
        raise RuntimeError("No video components available")

class _DummyInputImpl:
    VideoFromFile = _DummyVideoFromFile

comfy_api_latest.InputImpl = _DummyInputImpl
sys.modules["comfy_api.latest"] = comfy_api_latest

# --- End mocks ---

from nodes.comfyjbb_load_process_batch.nodes import LoadAndProcessImageBatch


def _make_png(path: str):
    Image.new("RGB", (16, 16), (10, 20, 30)).save(path)


def test_process_png_dry_run(tmp_path: Path):
    batch = tmp_path / "batch"
    processed = tmp_path / "processed"
    bypass = tmp_path / "bypass"
    batch.mkdir()
    processed.mkdir()
    bypass.mkdir()

    img_path = batch / "test.png"
    _make_png(str(img_path))

    node = LoadAndProcessImageBatch()

    images, fname, status = node.process_next(str(batch), str(processed), str(bypass),
                                               mode="single_file", index=0, seed=0, label="", dry_run=True)

    assert (batch / "test.png").exists()
    assert fname == "test.png"
    assert status == "processed"
    assert images is not None


def test_process_non_image_bypassed(tmp_path: Path):
    batch = tmp_path / "batch"
    processed = tmp_path / "processed"
    bypass = tmp_path / "bypass"
    batch.mkdir()
    processed.mkdir()
    bypass.mkdir()

    txt_path = batch / "hello.txt"
    txt_path.write_text("not-an-image")

    node = LoadAndProcessImageBatch()

    images, fname, status = node.process_next(str(batch), str(processed), str(bypass),
                                               mode="single_file", index=0, seed=0, label="", dry_run=False)

    # The non-image should be moved to bypass and status should indicate bypass
    assert not (batch / "hello.txt").exists()
    assert (bypass / "hello.txt").exists()
    assert fname == "hello.txt"
    assert status.startswith("bypassed")
    assert images is None
