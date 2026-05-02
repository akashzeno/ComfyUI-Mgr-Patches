import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Frontend-side workaround for the legacy "Update All" silent-completion bug
// in comfyui-manager 4.2.1.
//
// Bug: updateAll() in comfyui-manager/js/comfyui-manager.js generates a
// `batch_id` UUID and stores it in a module-scoped variable, but never adds
// it to the request body. The backend therefore creates a TaskBatch with
// batch_id=None and emits the "batch-done" cm-queue-status event with
// batch_id=null. The original onQueueStatus filters with
// `if (batch_id != event.detail.batch_id) return;` and silently bails — so
// the post-update success-list dialog never renders, even though every node
// did update.
//
// Fix: listen for the same event ourselves and render our own summary
// dialog. We only step in when `event.detail.batch_id == null` (the broken
// case) so we coexist with a future upstream fix or with manual in-place
// patches without double-rendering.

const TAG = "[manager-updateall-fix]";
const STYLE_ID = "cm-updateall-fix-styles";

app.registerExtension({
    name: "Comfy.Manager.UpdateAll.Fix",
    async setup() {
        injectStyles();
        api.addEventListener("cm-queue-status", onQueueStatus);
        console.info(`${TAG} extension loaded`);
    },
});

function onQueueStatus(event) {
    const detail = event?.detail;
    if (!detail || detail.status !== "batch-done") return;

    // Only render when the original handler will silently bail
    // (event.detail.batch_id is null because updateAll forgot to send it).
    if (detail.batch_id != null) return;

    const result = detail.nodepack_result || {};
    const successes = [];
    const failures = [];
    let comfyuiState = null;

    for (const [key, value] of Object.entries(result)) {
        if (key === "comfyui") {
            comfyuiState = value;
            continue;
        }
        const meta = value && typeof value === "object" ? value : { msg: value };
        const msg = meta.msg;
        if (msg === "success") successes.push({ key, ...meta });
        else if (msg && msg !== "skip") failures.push({ key, ...meta });
    }

    const nothingHappened =
        successes.length === 0 &&
        failures.length === 0 &&
        (comfyuiState == null || comfyuiState === "skip");
    if (nothingHappened) {
        renderDialog({ title: "Update All", body: "<p>You are already up to date.</p>" });
        return;
    }

    renderDialog({
        title: "Update All — results",
        body: buildSummaryBody({ successes, failures, comfyuiState }),
        showRestart: true,
    });
}

function buildSummaryBody({ successes, failures, comfyuiState }) {
    const parts = [];

    if (comfyuiState != null) {
        parts.push(`<p>${escapeHtml(formatComfyState(comfyuiState))}</p>`);
    }

    if (successes.length > 0) {
        parts.push(`<p><b>Updated (${successes.length}):</b></p>`);
        parts.push("<ul>" + successes.map(renderItem).join("") + "</ul>");
    }

    if (failures.length > 0) {
        parts.push(`<p class="cm-updateall-fix-failed-heading"><b>Failed (${failures.length}):</b></p>`);
        parts.push(`<ul class="cm-updateall-fix-failed">${failures.map(renderItem).join("")}</ul>`);
    }

    return parts.join("");
}

function renderItem(item) {
    const display = escapeHtml(item.title || item.key);
    if (item.url) {
        return `<li><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${display}</a></li>`;
    }
    return `<li>${display}</li>`;
}

function formatComfyState(state) {
    if (state === "success-nightly") return "ComfyUI updated to the latest nightly.";
    if (typeof state === "string" && state.startsWith("success-stable")) {
        const ver = state.split("-").pop();
        return `ComfyUI updated to ${ver}.`;
    }
    if (state === "skip") return "ComfyUI is already up to date.";
    return `ComfyUI update status: ${state}`;
}

function renderDialog({ title, body, showRestart = false }) {
    // Avoid stacking dialogs if the user spams Update All.
    document.querySelectorAll(".cm-updateall-fix-overlay").forEach((el) => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "cm-updateall-fix-overlay";
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });

    const dialog = document.createElement("div");
    dialog.className = "cm-updateall-fix-dialog";

    const heading = document.createElement("h3");
    heading.textContent = title;
    dialog.appendChild(heading);

    if (showRestart) {
        const banner = document.createElement("p");
        banner.className = "cm-updateall-fix-restart-banner";
        banner.textContent = "Restart ComfyUI to apply the updates.";
        dialog.appendChild(banner);
    }

    const content = document.createElement("div");
    content.className = "cm-updateall-fix-content";
    content.innerHTML = body;
    dialog.appendChild(content);

    const buttonRow = document.createElement("div");
    buttonRow.className = "cm-updateall-fix-buttons";

    if (showRestart) {
        const restartBtn = document.createElement("button");
        restartBtn.textContent = "Restart now";
        restartBtn.className = "cm-updateall-fix-primary";
        restartBtn.addEventListener("click", async () => {
            restartBtn.disabled = true;
            restartBtn.textContent = "Restarting...";
            try {
                await api.fetchApi("/v2/manager/reboot", { method: "POST" });
            } catch (e) {
                console.warn(`${TAG} reboot call failed:`, e);
            }
        });
        buttonRow.appendChild(restartBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => overlay.remove());
    buttonRow.appendChild(closeBtn);

    dialog.appendChild(buttonRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

function escapeAttr(s) {
    return escapeHtml(s);
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .cm-updateall-fix-overlay {
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0, 0, 0, 0.55);
            display: flex; align-items: center; justify-content: center;
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        .cm-updateall-fix-dialog {
            background: #1f1f1f; color: #e8e8e8;
            border: 1px solid #3a3a3a; border-radius: 8px;
            padding: 18px 22px; min-width: 360px; max-width: 600px;
            max-height: 80vh; overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        }
        .cm-updateall-fix-dialog h3 { margin: 0 0 10px 0; font-size: 16px; }
        .cm-updateall-fix-dialog p { margin: 8px 0; }
        .cm-updateall-fix-dialog ul { margin: 6px 0 12px 18px; padding: 0; }
        .cm-updateall-fix-dialog li { margin: 2px 0; }
        .cm-updateall-fix-dialog a { color: #6cb9ff; }
        .cm-updateall-fix-restart-banner {
            background: #3a2a00; border-left: 3px solid #d4a017;
            padding: 8px 10px; border-radius: 4px;
        }
        .cm-updateall-fix-failed-heading { color: #ff8b8b; }
        .cm-updateall-fix-failed { color: #ff8b8b; }
        .cm-updateall-fix-buttons {
            display: flex; gap: 8px; justify-content: flex-end;
            margin-top: 14px; padding-top: 12px; border-top: 1px solid #2a2a2a;
        }
        .cm-updateall-fix-buttons button {
            background: #2a2a2a; color: #e8e8e8; border: 1px solid #3a3a3a;
            padding: 6px 14px; border-radius: 4px; cursor: pointer;
            font-size: 13px;
        }
        .cm-updateall-fix-buttons button:hover { background: #353535; }
        .cm-updateall-fix-buttons button:disabled { opacity: 0.6; cursor: default; }
        .cm-updateall-fix-buttons .cm-updateall-fix-primary {
            background: #4a7ec5; border-color: #5a8ed5;
        }
        .cm-updateall-fix-buttons .cm-updateall-fix-primary:hover { background: #5589d0; }
    `;
    document.head.appendChild(style);
}
