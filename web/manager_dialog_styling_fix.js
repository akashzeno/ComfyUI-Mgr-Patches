import { app } from "../../scripts/app.js";

// Frontend-side workaround for the legacy ComfyUI-Manager dialog rendering
// with bare user-agent button styling on ComfyUI frontend 1.42.15+.
//
// Bug: comfyui-manager builds dialog buttons as
//     <button class="p-button p-component cm-button">
// and expects PrimeVue's `.p-button` rules to provide layout
// (border-radius, padding, font-size, etc.). PrimeVue v4 ships in
// unstyled-by-default mode and registers component styles lazily —
// only when a real PrimeVue Vue component (e.g. <Button>) actually
// mounts somewhere in the app. If no such component has mounted by
// the time the manager dialog opens, the document contains no bare
// `.p-button` rule and the manager's hand-built buttons fall back
// to user-agent defaults (21px height, 1px×6px padding, 2px outset
// border, no rounded corners). Whether that happens at any given
// page load is a timing race — the issue is intermittent and not
// caused by any specific custom node, despite various bisection
// theories that have appeared and been ruled out.
//
// Empirically captured "working" state (probe ran against the live
// dialog after PrimeVue had registered its Button styles):
//   .p-button { display: inline-flex; padding: var(--p-button-padding-y)
//               var(--p-button-padding-x); border-radius:
//               var(--p-button-border-radius); ... }
// resolved to: padding 8px 12px, border-radius 6px, font-size 1rem,
// border 1px solid, transition over 5 properties.
//
// Fix: inject a CSS shim restoring those layout properties on
// `.cm-button` (the class shared by every legacy manager button —
// experimental and small variants both extend it). Colors are
// already correct because the manager's own `.cm-button` rule sets
// background-color/border-color/color via theme variables — we only
// need to add the layout that PrimeVue would have provided.
//
// Guard: skip injection if PrimeVue's bare `.p-button` rule is
// already present in the document (recursing into @layer blocks
// where PrimeVue v4 nests its styles), so a future PrimeVue mount
// or upstream fix automatically deactivates this patch.

const TAG = "[manager-dialog-styling-fix]";
const STYLE_ID = "cm-manager-dialog-styling-fix";

app.registerExtension({
    name: "Comfy.Manager.DialogStyling.Fix",
    async setup() {
        if (document.getElementById(STYLE_ID)) return;

        if (upstreamProvidesPButtonStyles()) {
            console.info(`${TAG} upstream .p-button styles detected; skipping injection.`);
            return;
        }

        injectStyles();
        console.info(`${TAG} injected legacy manager dialog button shim.`);
    },
});

function upstreamProvidesPButtonStyles() {
    let found = false;
    function walk(rules) {
        for (const r of rules) {
            if (found) return;
            if (r.cssRules) walk(r.cssRules);
            const sel = r.selectorText;
            if (!sel) continue;
            // Only the bare `.p-button` rule means PrimeVue has registered
            // its component styles. Vue-scoped (`[data-v-…]`),
            // `.p-selectbutton`-scoped, and Tailwind utility selectors
            // don't help our hand-built `<button class="p-button">`.
            if (!/^\.p-button(:|\.|\[|\s|$)/.test(sel)) continue;
            if (sel.includes("[data-v-")) continue;
            if (sel.includes(".p-selectbutton")) continue;
            const text = r.cssText || "";
            if (/(border-radius|padding)\s*:/i.test(text)) {
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
    // Values mirror the captured PrimeVue .p-button rule from the working
    // state, hard-coded so the patch works even when PrimeVue's CSS custom
    // properties (--p-button-padding-y, etc.) haven't been registered yet.
    // Selector `button.cm-button` is intentionally low-specificity so that
    // upstream `.p-button` rules win when they show up.
    style.textContent = `
        /* Regular dialog buttons (Update All, Custom Nodes Manager, etc.)
           plus colored variants (cm-button-red Restart, cm-button-orange).
           cm-experimental-button extends cm-button so it's covered by
           the first selector. */
        button.cm-button,
        button.cm-button-red,
        button.cm-button-orange {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            padding: 8px 12px;
            border-width: 1px;
            border-style: solid;
            border-radius: 6px;
            font-family: inherit;
            font-size: 1rem;
            gap: 0.5rem;
            outline-color: transparent;
            transition: background 0.2s, color 0.2s, border-color 0.2s, outline-color 0.2s, box-shadow 0.2s;
        }
        /* Small variants used by some manager sub-dialogs. */
        button.cm-small-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            padding: 4px 10px;
            border-width: 1px;
            border-style: solid;
            border-radius: 5px;
            font-family: inherit;
            font-size: 0.875rem;
            gap: 0.5rem;
            outline-color: transparent;
            transition: background 0.2s, color 0.2s, border-color 0.2s, outline-color 0.2s, box-shadow 0.2s;
        }
        /* Dialog close (X) button: hand-built by ComfyDialog with PrimeVue-
           looking classes but no real Vue component, so PrimeVue's Pass-Through
           never tags it with data-pc-section and it goes unstyled when
           PrimeVue's lazy registration hasn't fired. Style it as a small
           rounded icon-only button.
           Selector includes :where() to keep specificity at 0,1,0 so any
           future real Vue-mounted close button overrides cleanly. */
        button.p-dialog-close-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            width: 2rem;
            height: 2rem;
            padding: 0;
            border: 1px solid transparent;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            font-family: inherit;
            outline-color: transparent;
            transition: background 0.2s, color 0.2s, border-color 0.2s, outline-color 0.2s, box-shadow 0.2s;
        }
        button.p-dialog-close-button:hover {
            background: rgba(255, 255, 255, 0.08);
        }
        button.p-dialog-close-button > svg {
            width: 14px;
            height: 14px;
        }
        /* The close button has an empty <span class="p-button-label">
           sibling next to the SVG. With display:flex + justify-content:center
           the span (even empty) takes width and pushes the icon off-center.
           Hide it visually but keep aria-label on the button for a11y. */
        button.p-dialog-close-button > .p-button-label {
            display: none;
        }
    `;
    document.head.appendChild(style);
}
