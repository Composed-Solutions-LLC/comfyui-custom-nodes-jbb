comfyui-custom-nodes-jbb
This repository contains a collection of custom ComfyUI nodes and helpers developed as the "COMFYJBB" node suite. The nodes focus on flexible image loading and batch processing, with support for HEIC/HEIF and a set of RAW camera formats where optional dependencies are installed.

This README documents what is included in the repo, how the custom nodes work, installation steps for adding the suite to your ComfyUI installation, dependency notes, usage hints, and troubleshooting steps.

Included nodes (summary)
COMFYJBB: Load & Process Image Batch

Location: nodes/comfyjbb-load-process-batch/nodes.py (also exposed in top-level nodes/nodes.py mapping)
What it does: scans a configured batch directory and processes files one at a time (queue semantics). It routes files by extension to the appropriate loader:
Common images (.png, .jpg, .jpeg, .webp, .bmp) — loaded by Pillow or ComfyUI InputImpl if available
HEIC (.heic) — attempted via ComfyUI InputImpl, otherwise falls back to pillow-heif if present
RAW camera files (.arw, .cr2, .cr3, .dng, .nef, .raf, .raw) — loaded with rawpy when available
Other extensions — moved to a Bypass folder and skipped
Key features: incremental/random/single-file selection modes; atomic "claiming" of files via rename to avoid concurrent processing; moves processed files to a processed folder and bypassed files to bypass folder; returns image tensor and filename.
Defaults: batch path and processed/bypass defaults are set to /workspace/ComfyUI/InputBatch/... but are configurable in the node.
Optional dependencies: rawpy, pillow-heif.
ComfyUI Load Image (HEIC)

Location: nodes/comfyui-loadheicimagefrompath/
What it does: a replacement/enhanced "Load Image" node that additionally supports .heic/.heif files and integrates with ComfyUI's input directory handling. Provides similar outputs to the standard "Load Image" node (IMAGE, MASK).
Usage notes: drag-and-drop is the most reliable way to upload HEIC files into ComfyUI's input folder; file-picker upload may be filtered by UI.
Optional dependency: pillow-heif (or other HEIC handler) in the same env as ComfyUI.
ComfyUI Load Image from Path

Location: nodes/comfyui-loadimagefrompath/
What it does: helper node to load image files by name/path from ComfyUI's configured input or project folders.
ComfyUI RAW Image from Path

Location: nodes/comfyui-raw-image-frompath/
What it does: loads RAW camera files using rawpy and returns an image array/tensor suitable for downstream nodes.
Dependency: requires rawpy to be installed in the same Python environment as ComfyUI.
Top-level helper (legacy mapping)

Location: nodes/nodes.py
What it does: provides NODE_CLASS_MAPPINGS / NODE_DISPLAY_NAME_MAPPINGS so nodes are discoverable in some ComfyUI setups.