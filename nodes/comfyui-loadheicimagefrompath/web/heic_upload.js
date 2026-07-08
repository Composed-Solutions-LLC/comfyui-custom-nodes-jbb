(function () {
  const EXT_NAME = "ComfyUI_LoadHEICImage.heic_upload";
  const HEIC_EXTS = [".heic", ".heif"];

  function isHeicFile(file) {
    const name = (file && file.name ? file.name : "").toLowerCase();
    return HEIC_EXTS.some((ext) => name.endsWith(ext));
  }

  async function uploadToInput(file) {
    const formData = new FormData();
    // ComfyUI upload endpoint expects the file in field "image".
    formData.append("image", file, file.name);

    const api = window.api;
    const resp = api?.fetchApi
      ? await api.fetchApi("/upload/image", { method: "POST", body: formData })
      : await fetch("/upload/image", { method: "POST", body: formData });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Upload failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();

    // Typical response: { name, subfolder, type }
    const name = data?.name ?? file.name;
    const subfolder = data?.subfolder ?? "";
    const annotated = subfolder ? `${subfolder}/${name}` : name;

    return annotated;
  }

  async function refreshHeicFilesList(node) {
    // Refresh the dropdown list by calling the node's INPUT_TYPES
    try {
      const widget = node.widgets?.find(w => w.name === "image");
      if (!widget) return;

      // Get fresh list from server
      const api = window.api;
      const resp = api?.fetchApi
        ? await api.fetchApi("/object_info")
        : await fetch("/object_info");

      if (!resp.ok) return;

      const objectInfo = await resp.json();
      const nodeInfo = objectInfo?.LoadImagePlusHEIC;
      const imageInput = nodeInfo?.input?.required?.image;

      if (imageInput && Array.isArray(imageInput[0])) {
        widget.options.values = imageInput[0];
      }
    } catch (err) {
      console.error("Failed to refresh HEIC files list:", err);
    }
  }

  function setNodeImageWidget(node, value) {
    if (!node || !node.widgets) return false;
    const w = node.widgets.find((x) => x && x.name === "image");
    if (!w) return false;

    // Ensure the combo widget contains the value, otherwise some frontends
    // will snap back to the previous selection.
    if (w.options && Array.isArray(w.options.values)) {
      if (!w.options.values.includes(value)) {
        w.options.values.unshift(value);
      }
    }

    w.value = value;
    if (typeof w.callback === "function") {
      try {
        w.callback(value);
      } catch (_) {
        // ignore
      }
    }

    applyHeicPreview(node, w, value);

    return true;
  }

  function applyHeicPreview(node, widget, value) {
    console.log("[HEIC] applyHeicPreview called:", value);
    const lower = String(value ?? "").toLowerCase();
    if (!HEIC_EXTS.some((ext) => lower.endsWith(ext))) {
      console.log("[HEIC] Not a HEIC file, skipping preview");
      return;
    }

    const url = `/heic_preview?filename=${encodeURIComponent(value)}&t=${Date.now()}`;
    console.log("[HEIC] Loading preview from:", url);

    // Create new image object
    const imgObj = new Image();
    imgObj.onload = () => {
      console.log("[HEIC] Image loaded successfully, updating node");
      // After image loads, force canvas redraw
      if (node) {
        node.img = imgObj;
        node._img = imgObj;
        if (Array.isArray(node.imgs)) {
          node.imgs[0] = imgObj;
        } else {
          node.imgs = [imgObj];
        }
        markDirty(window.app);
      }
    };
    imgObj.onerror = (err) => {
      console.error("[HEIC] Failed to load HEIC preview:", url, err);
    };
    imgObj.src = url;

    // Also update widget candidates immediately
    const candidates = [widget?.img, widget?.image, widget?._img, widget?._image, widget?.el, node?.img, node?._img];
    for (const c of candidates) {
      if (c && typeof c === "object" && "src" in c) {
        try {
          c.src = url;
        } catch (_) {}
      }
    }
  }

  // Fetch hook: reroute HEIC preview requests to /heic_preview (PNG).
  function installFetchInterceptor() {
    if (installFetchInterceptor._installed) return;
    installFetchInterceptor._installed = true;

    const origFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : (input?.url ?? "");
        if (typeof url === "string" && url.includes("/api/view") && url.toLowerCase().includes(".heic")) {
          const u = new URL(url, window.location.origin);
          const filename = u.searchParams.get("filename");
          if (filename) {
            const newUrl = `/heic_preview?filename=${encodeURIComponent(filename)}&t=${Date.now()}`;
            return origFetch(newUrl, init);
          }
        }
      } catch (_) {
        // fall through
      }
      return origFetch(input, init);
    };
  }

  // Global Image.src interceptor to redirect HEIC URLs to PNG preview
  function installImageSrcInterceptor() {
    if (installImageSrcInterceptor._installed) return;
    installImageSrcInterceptor._installed = true;

    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const originalSrcSetter = originalDescriptor.set;
    const originalSrcGetter = originalDescriptor.get;

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      get() {
        return originalSrcGetter.call(this);
      },
      set(value) {
        console.log("[HEIC] Image.src setter called with:", value);

        // Check if this is a HEIC URL
        if (typeof value === 'string' && value.includes('/api/view') &&
            (value.toLowerCase().includes('.heic') || value.toLowerCase().includes('.heif'))) {
          try {
            const url = new URL(value, window.location.origin);
            const filename = url.searchParams.get('filename');
            if (filename && (filename.toLowerCase().endsWith('.heic') || filename.toLowerCase().endsWith('.heif'))) {
              const newUrl = `/heic_preview?filename=${encodeURIComponent(filename)}&t=${Date.now()}`;
              console.log("[HEIC] Redirecting Image.src from", value, "to", newUrl);
              originalSrcSetter.call(this, newUrl);
              return;
            }
          } catch (err) {
            console.error("[HEIC] Error parsing URL:", err);
          }
        }

        // Default behavior
        originalSrcSetter.call(this, value);
      },
      configurable: true,
      enumerable: true
    });

    console.log("[HEIC] Image.src interceptor installed");
  }

  function isTargetNode(n) {
    if (!n) return false;
    return (
      n.comfyClass === "LoadImagePlusHEIC" ||
      n.type === "LoadImagePlusHEIC" ||
      n.constructor?.name === "LoadImagePlusHEIC" ||
      n.title === "Load Image (HEIC)"
    );
  }

  function getSelectedNodes(app) {
    const sel1 = app?.canvas?.selected_nodes;
    if (sel1) return Object.values(sel1);

    // Some frontends don't expose selected_nodes; fall back to scanning graph.
    const nodes = app?.graph?._nodes;
    if (!Array.isArray(nodes)) return [];
    return nodes.filter((n) => n && (n.selected === true || n.flags?.selected === true));
  }

  function findTargetNode(app) {
    const selected = getSelectedNodes(app);
    for (const n of selected) {
      if (isTargetNode(n)) return n;
    }

    // Fallback: if only one such node exists, set it.
    const nodes = app?.graph?._nodes;
    if (Array.isArray(nodes)) {
      const candidates = nodes.filter(isTargetNode);
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) return candidates[candidates.length - 1];
    }

    return null;
  }

  function toastInfo(app, msg) {
    const toast = app?.extensionManager?.toast;
    if (toast?.add) {
      toast.add({ severity: "info", summary: "HEIC", detail: msg, life: 3000 });
      return;
    }
    if (toast?.addAlert) {
      toast.addAlert(msg);
      return;
    }
    console.log(msg);
  }

  function toastError(app, msg) {
    const toast = app?.extensionManager?.toast;
    if (toast?.add) {
      toast.add({ severity: "error", summary: "HEIC", detail: msg, life: 6000 });
      return;
    }
    if (toast?.addAlert) {
      toast.addAlert(msg);
      return;
    }
    console.error(msg);
  }

  function markDirty(app) {
    try {
      app?.graph?.setDirtyCanvas?.(true, true);
      app?.canvas?.setDirty?.(true, true);
      app?.canvas?.draw?.(true, true);
    } catch (_) {
      // ignore
    }
  }

  function registerExtension() {
    const app = window.app;
    if (!app?.registerExtension) return;

    app.registerExtension({
      name: EXT_NAME,

      // Handle drop on node (if frontend routes drop events to nodes)
      async beforeRegisterNodeDef(nodeType, nodeData) {
        const nodeName = nodeData?.name ?? nodeData?.comfyClass;
        if (nodeName !== "LoadImagePlusHEIC") return;

        const orig = nodeType.prototype.onDropFile;
        nodeType.prototype.onDropFile = async function (file) {
          if (file && isHeicFile(file)) {
            try {
              const annotated = await uploadToInput(file);
              setNodeImageWidget(this, annotated);
              markDirty(app);
              return true;
            } catch (e) {
              toastError(app, String(e?.message ?? e));
              return true;
            }
          }
          return orig ? orig.call(this, file) : false;
        };

        // Hook widget changes (e.g., using arrows in the combo) to refresh HEIC preview.
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
          if (origCreated) origCreated.apply(this, arguments);
          const w = this.widgets?.find((x) => x && x.name === "image");
          if (!w) return;

          console.log("[HEIC] Hooking widget for node:", this.id);

          // Hook callback
          const origCb = w.callback;
          w.callback = (v) => {
            console.log("[HEIC] Widget callback triggered with value:", v);
            if (origCb) {
              console.log("[HEIC] Calling original callback");
              origCb.call(w, v);
            }
            console.log("[HEIC] Applying HEIC preview from callback");
            applyHeicPreview(this, w, v);
          };

          // Also intercept value setter since ComfyUI may not call callback
          const node = this;
          let currentValue = w.value;

          Object.defineProperty(w, "_value", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: currentValue
          });

          Object.defineProperty(w, "value", {
            configurable: true,
            enumerable: true,
            get() {
              return this._value;
            },
            set(newValue) {
              const oldValue = this._value;
              this._value = newValue;

              if (oldValue !== newValue) {
                console.log("[HEIC] Widget value changed from", oldValue, "to", newValue);
                // Trigger preview update when value changes
                setTimeout(() => {
                  applyHeicPreview(node, w, newValue);
                }, 10);
              }
            }
          });

          // Override the file input to accept HEIC files
          // Try multiple ways to find and set the input element
          setTimeout(() => {
            // Method 1: Check widget properties
            if (w.inputEl) {
              console.log("[HEIC] Found w.inputEl, setting accept");
              w.inputEl.accept = ".heic,.heif,image/heic,image/heif";
            }

            // Method 2: Search in widget element
            if (w.element) {
              const input = w.element.querySelector('input[type="file"]');
              if (input) {
                console.log("[HEIC] Found input via w.element, setting accept");
                input.accept = ".heic,.heif,image/heic,image/heif";
              }
            }

            // Method 3: Search in node element
            if (node.element) {
              const input = node.element.querySelector('input[type="file"]');
              if (input) {
                console.log("[HEIC] Found input via node.element, setting accept");
                input.accept = ".heic,.heif,image/heic,image/heif";
              }
            }

            // Method 4: Hook document-level file input creation
            const inputs = document.querySelectorAll('input[type="file"]');
            inputs.forEach(input => {
              if (!input.dataset.heicPatched && input.accept && input.accept.includes('image')) {
                console.log("[HEIC] Found unpatched file input, adding HEIC to accept");
                // Add HEIC to existing accept, don't replace
                const current = input.accept || '';
                if (!current.includes('.heic')) {
                  input.accept = current + ',.heic,.heif,image/heic,image/heif';
                }
                input.dataset.heicPatched = "true";
              }
            });
          }, 100);

          // Hook into uploadFile if it exists on the widget
          const uploadFile = w.uploadFile;
          if (uploadFile) {
            const originalUpload = uploadFile.bind(w);
            w.uploadFile = async function(file) {
              console.log("[HEIC] uploadFile called with:", file?.name);
              if (file && isHeicFile(file)) {
                try {
                  const filename = await uploadToInput(file);
                  await refreshHeicFilesList(node);

                  if (!w.options.values.includes(filename)) {
                    w.options.values.unshift(filename);
                  }

                  w.value = filename;
                  applyHeicPreview(node, w, filename);
                  return;
                } catch (err) {
                  console.error("[HEIC] Upload failed:", err);
                  toastError(app, `Upload failed: ${err.message || err}`);
                  return;
                }
              }

              // Fall back to original for non-HEIC files
              console.log("[HEIC] Non-HEIC file, using original upload");
              return originalUpload(file);
            };
          }
        };
      },
    });

    installFetchInterceptor();
    installImageSrcInterceptor();
    installFileInputObserver();

  }

  // Global observer to patch file inputs for HEIC support
  function installFileInputObserver() {
    if (installFileInputObserver._installed) return;
    installFileInputObserver._installed = true;

    console.log("[HEIC] Installing file input observer");

    // Patch existing inputs
    const patchFileInput = (input) => {
      if (input.dataset.heicPatched) return;

      const currentAccept = input.accept || '';
      console.log("[HEIC] Patching file input, current accept:", currentAccept);

      // Add HEIC to accept list without removing other formats
      if (!currentAccept.includes('.heic') && !currentAccept.includes('image/heic')) {
        const newAccept = currentAccept ? currentAccept + ',.heic,.heif,image/heic,image/heif' : '.heic,.heif,image/heic,image/heif';

        // Try to set it directly first
        try {
          input.accept = newAccept;
          input.setAttribute('accept', newAccept);
          console.log("[HEIC] File input patched, new accept:", input.accept);
        } catch (err) {
          console.error("[HEIC] Failed to patch accept:", err);
        }
      }

      input.dataset.heicPatched = "true";
    };

    // Patch all existing inputs
    document.querySelectorAll('input[type="file"]').forEach(patchFileInput);

    // Watch for new inputs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // ELEMENT_NODE
            if (node.tagName === 'INPUT' && node.type === 'file') {
              patchFileInput(node);
            }
            // Also check descendants
            if (node.querySelectorAll) {
              node.querySelectorAll('input[type="file"]').forEach(patchFileInput);
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // In some builds, window.app appears after scripts load.
  if (window.app?.registerExtension) {
    registerExtension();
  } else {
    window.addEventListener("comfy-app-ready", registerExtension);
    // Fallback retry loop
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (window.app?.registerExtension) {
        clearInterval(t);
        registerExtension();
      }
      if (tries > 50) clearInterval(t);
    }, 200);
  }

  // Global drop handler for HEIC files (capture phase to run before workflow loader)
  document.addEventListener("dragover", (e) => {
    const items = e?.dataTransfer?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const name = item.type === "" ? "" : "";
        if (item.type === "" || item.type === "image/heic" || item.type === "image/heif") {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          return;
        }
      }
    }
  }, true);

  document.addEventListener("drop", async (e) => {
    const file = e?.dataTransfer?.files?.[0];
    if (!file) return;

    if (!isHeicFile(file)) return;

    // Prevent workflow loading for HEIC files
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    try {
      const filename = await uploadToInput(file);
      toastInfo(window.app, `HEIC uploaded: ${filename}`);

      // Find node to update - check selected nodes or all LoadImagePlusHEIC nodes
      const selectedNodes = window.app?.canvas?.selected_nodes;
      let targetNode = null;

      if (selectedNodes) {
        for (const nodeId in selectedNodes) {
          const node = window.app.graph.getNodeById(nodeId);
          if (node?.comfyClass === "LoadImagePlusHEIC") {
            targetNode = node;
            break;
          }
        }
      }

      // If no selected node, update all LoadImagePlusHEIC nodes
      if (!targetNode) {
        const allNodes = window.app?.graph?._nodes || [];
        const heicNodes = allNodes.filter(n => n?.comfyClass === "LoadImagePlusHEIC");
        if (heicNodes.length > 0) {
          targetNode = heicNodes[0];
        }
      }

      if (targetNode) {
        // Refresh the file list first
        await refreshHeicFilesList(targetNode);

        // Then set the widget value
        const widget = targetNode.widgets?.find(w => w.name === "image");
        if (widget) {
          // Make sure filename is in the list
          if (!widget.options.values.includes(filename)) {
            widget.options.values.unshift(filename);
          }

          widget.value = filename;
          if (widget.callback) widget.callback(filename);
          applyHeicPreview(targetNode, widget, filename);
        }
      }
    } catch (err) {
      console.error("HEIC drop upload failed:", err);
      toastError(window.app, `Failed to upload HEIC: ${err.message || err}`);
    }
  }, true);
})();
