from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .nodes import _register_preview_route_if_possible

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

# Frontend extension (drag&drop HEIC/HEIF upload handling)
WEB_DIRECTORY = "web"

# Best-effort preview route registration; will also be attempted lazily from INPUT_TYPES.
_register_preview_route_if_possible()
