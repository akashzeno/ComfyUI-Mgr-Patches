"""Apply local Python-side patches to comfyui-manager.

Runs at ComfyUI prestartup, after `comfyui_manager` has been imported (see
main.py:85 / main.py:181) and before any custom node loads. Each patch is
self-contained: it owns its own version gate and its own log tag, and is
idempotent, so a re-import or a duplicate prestartup run is harmless.

To add a new patch: write a `_apply_<name>(version)` function, put a
version gate at the top so it deactivates itself when upstream fixes the
bug, and call it from `_apply()`.
"""

from __future__ import annotations

import logging


def _installed_version() -> str | None:
    try:
        from importlib.metadata import version
        return version("comfyui_manager")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Patch: Update All fix (comfyui-manager 4.2.1)
# ---------------------------------------------------------------------------
# Bug: legacy/manager_server.py around line 787 calls
# `await update_comfyui(None)` from queue_batch, but the route handler runs
# manager_security.reject_simple_form_post(request) unconditionally and the
# gate dereferences request.content_type — crashing with AttributeError and
# aborting the whole "Update All" batch.
#
# Fix: make reject_simple_form_post short-circuit when request is None. That
# path never crossed the network, so there is nothing for CSRF to defend.

_UPDATE_ALL_FIX_TAG = "[manager-updateall-fix]"
_UPDATE_ALL_FIX_VERSIONS = {"4.2.1"}


def _apply_update_all_fix(version: str | None) -> None:
    if version not in _UPDATE_ALL_FIX_VERSIONS:
        logging.warning(
            f"{_UPDATE_ALL_FIX_TAG} comfyui_manager=={version!r} is not in "
            f"{sorted(_UPDATE_ALL_FIX_VERSIONS)}; skipping. Verify the bug is still "
            f"present and add the version, or remove this patch if upstream has fixed it."
        )
        return

    try:
        from comfyui_manager.common import manager_security
    except ImportError as e:
        logging.warning(f"{_UPDATE_ALL_FIX_TAG} cannot import manager_security: {e}")
        return

    original = manager_security.reject_simple_form_post
    if getattr(original, "_updateall_fix_applied", False):
        return

    def patched(request):
        if request is None:
            return None
        return original(request)

    patched._updateall_fix_applied = True  # type: ignore[attr-defined]
    manager_security.reject_simple_form_post = patched
    logging.info(
        f"{_UPDATE_ALL_FIX_TAG} applied to comfyui_manager=={version}: "
        f"reject_simple_form_post now tolerates None."
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

_PACK_TAG = "[manager-patches]"


def _apply() -> None:
    try:
        import comfyui_manager  # noqa: F401  (force-import to detect installation)
    except ImportError:
        logging.info(f"{_PACK_TAG} comfyui_manager not installed; nothing to patch.")
        return

    version = _installed_version()

    _apply_update_all_fix(version)


_apply()
