# ComfyUI-Manager Patches

Local-only ComfyUI custom node that applies workarounds for bugs in the
upstream `comfyui-manager` pip package (the one enabled by
`--enable-manager`).

This node ships **no graph nodes**. It is a patch pack: each patch has a
Python prestartup half (in `prestartup_script.py`) and/or a frontend
half (a file under `web/`). Each patch is independently version-gated,
so when upstream fixes one of them the matching patch deactivates itself
without affecting the others.

Drop the folder into `custom_nodes/` and forget about it.

## Patches

### Update All fix (`comfyui-manager==4.2.1`)

Two independent upstream bugs make the legacy ComfyUI-Manager
**"Update All"** button look completely broken:

1. **Backend crash.** `queue_batch` calls the route handler internally
   as `await update_comfyui(None)`, but `update_comfyui` runs the CSRF
   gate unconditionally and the gate dereferences `request.content_type`
   — crashing with `AttributeError: 'NoneType' object has no attribute
   'content_type'` and aborting the whole batch.
   - File: `comfyui_manager/legacy/manager_server.py` (the
     `update_comfyui` route handler around line 1599 and the
     `queue_batch` dispatcher around line 786).
   - Gate: `comfyui_manager/common/manager_security.py:65`.

2. **Silent UI.** `updateAll()` in
   `comfyui_manager/js/comfyui-manager.js` generates a `batch_id` UUID
   for filtering responses but never adds it to the request body. The
   backend tags the resulting `TaskBatch` with `batch_id=None`, the
   `cm-queue-status` `batch-done` event ships back with `batch_id: null`,
   and `onQueueStatus`'s `if (batch_id != event.detail.batch_id) return;`
   silently discards it — so the post-update success-list dialog never
   renders, even though every node did update.

Bug 1 alone makes Update All crash. Bug 2 alone is moot (the batch
never finishes anyway). Together they are why Update All looks broken.

**What this patch does:**

- **Python half** (`_apply_update_all_fix` in `prestartup_script.py`)
  monkey-patches
  `comfyui_manager.common.manager_security.reject_simple_form_post` to
  short-circuit when called with `request=None`. Idempotent;
  version-gated by `_UPDATE_ALL_FIX_VERSIONS`.

- **Frontend half** (`web/update_all_fix.js`) registers an extension
  that listens for `cm-queue-status` `batch-done` events with
  `event.detail.batch_id == null` (the broken case) and renders a
  summary dialog listing the updated and failed packs, plus a "Restart
  now" button. Stays out of the way when `batch_id` is set, so it
  coexists with a future upstream fix or any in-place patch without
  double-rendering.

## Verifying it works

1. Restart ComfyUI. In the startup log, look for a line like:
   ```
   [manager-updateall-fix] applied to comfyui_manager==4.2.1: reject_simple_form_post now tolerates None.
   ```
   If you see a version warning instead, upstream has shipped a new
   version — see "When to remove a patch" below.
2. Hard-refresh the browser (Ctrl+F5). The browser console should show
   `[manager-updateall-fix] extension loaded`.
3. Open the legacy manager dialog (your launcher already passes
   `--enable-manager-legacy-ui`) and click **Update All**. After the
   batch finishes you should see a modal listing every pack that was
   updated.

## When to remove a patch

Each patch is a workaround for a specific `comfyui-manager` version
range. After every `pip install -U comfyui-manager`:

- The Python prestartup of any patch whose version range no longer
  matches will log a warning and skip itself. Confirm the underlying
  bug is actually fixed in the new version (manually test the
  affected feature).
- If the bug is fixed, **delete the patch's section** from
  `prestartup_script.py`, delete the matching `web/<name>.js` if any,
  and update this README. If every patch is gone, delete the folder.
- If the bug is still present, add the new version string to the
  patch's version set and verify the monkey-patch targets (function
  names, signatures, event shapes) haven't moved. Frontend halves are
  event-driven and tend to keep working unless upstream renames the
  events or changes the payload shape.

## Adding a new patch

In `prestartup_script.py`:

1. Add a section under the "Patch:" comment header with its own log
   tag and version set.
2. Write `_apply_<name>(version)` that returns early if `version` is
   not in the supported set, then applies the patch idempotently.
3. Call it from `_apply()`.

If the patch needs a frontend half, add a new file under `web/` and
listen for whatever events you need. Keep each frontend extension
independent (give it its own `app.registerExtension` `name`).

Document the patch in this README under a new `### <Name>` heading.

## Layout

```
ComfyUI-Manager-Patches/
├── __init__.py              # Declares WEB_DIRECTORY, registers no nodes.
├── prestartup_script.py     # All Python-side patches, each version-gated.
├── pyproject.toml           # Standard ComfyUI custom-node metadata.
├── README.md                # This file.
└── web/
    └── update_all_fix.js    # Frontend half of the Update All patch.
```

## License

MIT.
