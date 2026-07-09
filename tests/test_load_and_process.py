import sys
import types
from pathlib import Path
import numpy as np
import pytest

# Try to import runtime dependencies; skip if not available (Pillow/torch are needed)
try:
    from PIL import Image
    import torch
except Exception as e:
    pytest.skip(f"Skipping tests because required runtime packages are missing: {e}", allow_module_level=True)

# --- Mock minimal comfy/comfy_api modules so tests run without ComfyUI installed ---
# Create a fake comfy.comfy_types
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
import node_helpers

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

# --- Tests that use example HEIC and NEF files from the examples folder ---
EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "nodes" / "comfyjbb-load-process-batch" / "examples"

def test_process_heic_example(tmp_path: Path, monkeypatch):
    heic_path = EXAMPLES_DIR / "TEST.heic"
    if not heic_path.exists():
        pytest.skip("No TEST.heic example available")

    # Monkeypatch node_helpers.pillow to return a valid PIL Image when called for the HEIC file
    def fake_pillow(func, path, *args, **kwargs):
        # Return a small RGB image regardless of input path
        return Image.new("RGB", (32, 32), (100, 150, 200))

    monkeypatch.setattr(node_helpers, "pillow", fake_pillow)

    batch = tmp_path / "batch"
    processed = tmp_path / "processed"
    bypass = tmp_path / "bypass"
    batch.mkdir()
    processed.mkdir()
    bypass.mkdir()

    # copy example HEIC into batch so node will claim it
    target = batch / "TEST.heic"
    import shutil
    shutil.copy2(str(heic_path), str(target))

    node = LoadAndProcessImageBatch()

    images, fname, status = node.process_next(str(batch), str(processed), str(bypass),
                                               mode="single_file", index=0, seed=0, label="", dry_run=True)

    assert (batch / "TEST.heic").exists()
    assert fname == "TEST.heic"
    assert status == "processed"
    assert images is not None

def test_process_nef_example(tmp_path: Path):
    nef_path = EXAMPLES_DIR / "TEST.NEF"
    if not nef_path.exists():
        pytest.skip("No TEST.NEF example available")

    # Monkeypatch rawpy to provide a dummy raw object with a postprocess method
    class DummyRaw:
        def postprocess(self, use_camera_wb=True, output_bps=8):
            # Return a small RGB uint8 numpy array
            arr = np.zeros((16, 16, 3), dtype=np.uint8)
            arr[:, :] = [50, 100, 150]
            return arr

    dummy_rawpy = types.ModuleType("rawpy")
    def imread(path):
        return DummyRaw()
    dummy_rawpy.imread = imread
    sys.modules["rawpy"] = dummy_rawpy

    batch = tmp_path / "batch"
    processed = tmp_path / "processed"
    bypass = tmp_path / "bypass"
    batch.mkdir()
    processed.mkdir()
    bypass.mkdir()

    # copy example NEF into batch so node will claim it
    target = batch / "TEST.NEF"
    import shutil
    shutil.copy2(str(nef_path), str(target))

    node = LoadAndProcessImageBatch()

    images, fname, status = node.process_next(str(batch), str(processed), str(bypass),
                                               mode="single_file", index=0, seed=0, label="", dry_run=True)

    assert (batch / "TEST.NEF").exists()
    assert fname == "TEST.NEF"
    assert status == "processed"
    assert images is not None