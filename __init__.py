"""ComfyUI-Manager Patches.

Local-only ComfyUI custom node that applies patches to the upstream
`comfyui-manager` pip package (the one enabled by `--enable-manager`).
Patches live in `prestartup_script.py` (Python side) and/or in files
under `web/` (frontend side).

Currently shipped patches:

- **Update All fix** (comfyui-manager 4.2.1) — works around a backend
  NoneType crash plus a frontend silent-completion bug in the legacy
  "Update All" path. Python half is `_apply_update_all_fix` in
  `prestartup_script.py`; frontend half is `web/update_all_fix.js`.

This node registers no graph nodes; it exists purely for its prestartup
script and its WEB_DIRECTORY frontend extensions. See README.md for the
full story per patch.
"""

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS: dict = {}
NODE_DISPLAY_NAME_MAPPINGS: dict = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
