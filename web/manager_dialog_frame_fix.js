import { app } from "../../scripts/app.js";

// Frontend-side workaround for the legacy ComfyUI-Manager windows rendering
// with no panel on ComfyUI frontend 1.57.1+.
//
// Bug: comfyui-manager's comfyui-gui-builder.js hand-builds PrimeVue Dialog
// markup for every legacy window (the main menu, Custom Nodes Manager,
// Model Manager, Snapshot Manager):
//     <div class="p-dialog-mask p-overlay-mask">
//       <div class="p-dialog p-component global-dialog">
//         <div class="p-dialog-header">…</div><div class="p-dialog-content">…</div>
// and relies on the frontend's CSS for the panel. Frontend 1.55.18 shipped
// PrimeVue's Dialog rules plus `.global-dialog` padding rules; 1.57.1 dropped
// the PrimeVue Dialog component and every `.p-dialog` / `.global-dialog` rule
// with it. The windows then show no background, border or padding, and the
// close X drops under the title (the header is no longer a flex row).
//
// Fix: inject PrimeVue's own Dialog rules (copied from 1.55.18), scoped to
// `.global-dialog` (only the manager uses that class in 1.57.1), with the
// dialog.* design tokens resolved to the overlay.modal.* / mask.* tokens they
// pointed at — the frontend still defines those, so the panel follows the
// theme. Fallbacks are the dark-theme values captured from a live probe.
//
// Guard: skip injection if a `.p-dialog` or `.global-dialog` rule that sets a
// background is already in the document (recursing into @layer blocks), so a
// future upstream fix deactivates this patch.

const TAG = "[manager-dialog-frame-fix]";
const STYLE_ID = "cm-manager-dialog-frame-fix";

app.registerExtension({
    name: "Comfy.Manager.DialogFrame.Fix",
    async setup() {
        if (document.getElementById(STYLE_ID)) return;

        if (upstreamProvidesDialogStyles()) {
            console.info(`${TAG} upstream dialog styles detected; skipping injection.`);
            return;
        }

        injectStyles();
        console.info(`${TAG} injected legacy manager window frame styles.`);
    },
});

function upstreamProvidesDialogStyles() {
    let found = false;
    function walk(rules) {
        for (const r of rules) {
            if (found) return;
            if (r.cssRules) walk(r.cssRules);
            const sel = r.selectorText;
            if (!sel) continue;
            if (!/(^|,\s*)\.(p-dialog|global-dialog)(\s*,|\s*$)/.test(sel)) continue;
            if (/background\s*:/i.test(r.cssText || "")) {
                found = true;
                return;
            }
        }
    }
    for (const sheet of document.styleSheets) {
        try {
            walk(sheet.cssRules || []);
        } catch {
            /* CORS-restricted sheet; skip */
        }
        if (found) break;
    }
    return found;
}

function injectStyles() {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .p-dialog.global-dialog {
            max-height: 90%;
            max-width: calc(100vw - 1rem);
            border-radius: var(--p-overlay-modal-border-radius, 12px);
            box-shadow: var(--p-overlay-modal-shadow, 0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1));
            background: var(--p-overlay-modal-background, #18181b);
            border: 1px solid var(--p-overlay-modal-border-color, #3f3f46);
            color: var(--p-overlay-modal-color, #fff);
        }
        .global-dialog .p-dialog-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
            padding: var(--p-overlay-modal-padding, 1.25rem);
            padding-bottom: 0;
        }
        .global-dialog .p-dialog-header-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .global-dialog .p-dialog-content {
            overflow-y: auto;
            padding: var(--p-overlay-modal-padding, 1.25rem);
            padding-top: 0;
        }
        .p-dialog-mask.p-overlay-mask:has(> .global-dialog) {
            background: var(--p-mask-background, rgba(0,0,0,.6));
            color: var(--p-mask-color, #e4e4e7);
        }
    `;
    document.head.appendChild(style);
}
