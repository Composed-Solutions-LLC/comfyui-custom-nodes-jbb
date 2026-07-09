## COMFYJBB Custom Nodes Suite — v0.1.0

Initial public release of the COMFYJBB custom node suite for ComfyUI.

This release focuses on flexible image loading and batch-processing workflows, with support for standard images, HEIC/HEIF, and RAW camera formats where optional dependencies are installed.

### Included nodes

- **COMFYJBB: Load & Process Image Batch**
  - Processes files from a batch folder one at a time
  - Supports queue-style incremental, random, and single-file selection modes
  - Routes files by extension:
    - standard images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`
    - HEIC: `.heic`
    - RAW camera formats: `.arw`, `.cr2`, `.cr3`, `.dng`, `.nef`, `.raf`, `.raw`
  - Moves processed files to a processed folder
  - Moves unsupported or failed files to a bypass folder
  - Returns image output plus filename/status metadata

- **Load Image (HEIC)**
  - Load-image style node with HEIC/HEIF support

- **Load Image from Path**
  - Loads images from ComfyUI input or a provided path

- **RAW Image from Path**
  - Loads RAW camera files using `rawpy` when installed

### Packaging and repository improvements

This release also includes repository and installability improvements:

- normalized node directory names using underscore-safe paths
- installer scripts for multiple environments:
  - `install.bat`
  - `install.ps1`
  - `install.sh`
- GitHub Actions CI with `pytest`
- `pyproject.toml`
- `LICENSE`
- `.gitattributes`
- updated README with installation and usage guidance

### Installation

Clone or copy this repository into your ComfyUI `custom_nodes` folder.

Example:

```bash
git clone https://github.com/Composed-Solutions-LLC/comfyui-custom-nodes-jbb.git