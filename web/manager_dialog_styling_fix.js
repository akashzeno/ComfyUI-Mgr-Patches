import { app } from "../../scripts/app.js";

// Frontend-side workaround for the legacy ComfyUI-Manager dialog rendering
// with bare user-agent button styling on ComfyUI frontend 1.42.15+.
//
// Bug: comfyui-manager builds dialog buttons as
//     <button class="p-button p-component cm-button">
// and expects PrimeVue's `.p-button` rules to provide layout
// (border-radius, padding, height). In ComfyUI frontend 1.42.15,
// PrimeVue v4 ships in unstyled-by-default mode — `.p-button` rules
// only apply to Vue-rendered components carrying `data-pc-section`
// attributes; manually-constructed <button class="p-button"> elements
// match nothing. The manager's own `.cm-button` rule sets colors only
// (background, border-color, color), so the buttons fall back to
// user-agent defaults: 21px height, 1px×6px padding, 2px outset
// border, no rounded corners.
//
// Empirically confirmed via DOM probe (see `getMatchedCSSRules`-style
// scan in dev): out of 9000+ CSS rules in the document, only one
// matches the legacy manager's button — `.cm-button` from the
// manager's inline <style>. The "fix" users sometimes see after
// running Update All-with-actual-updates and restarting is upstream
// state coincidentally pulling in different assets; it's not stable.
//
// Fix: inject a small CSS shim restoring `.cm-button` /
// `.cm-small-button` to the look they had on older frontend versions.
// Guard: skip injection if any non-Vue-scoped `.p-button` rule
// defining `border-radius` or `padding` already exists, so a future
// upstream fix automatically deactivates this patch.

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
    for (const sheet of document.styleSheets) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        if (!rules) continue;
        for (const rule of rules) {
            const sel = rule.selectorText;
            if (!sel || !sel.includes(".p-button")) continue;
            // Ignore Vue-scoped rules (data-v-*) and selectbutton-only rules —
            // those are present in 1.42.15 but don't help our manually-built
            // <button class="p-button"> elements.
            if (sel.includes("[data-v-")) continue;
            if (sel.includes(".p-selectbutton")) continue;
            const text = rule.cssText || "";
            if (/border-radius|padding/i.test(text)) return true;
        }
    }
    return false;
}

function injectStyles() {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        button.cm-button {
            padding: 8px 16px;
            border-width: 1px;
            border-style: solid;
            border-radius: 6px;
            min-height: 32px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.2;
            appearance: none;
            -webkit-appearance: none;
            transition: filter 0.12s ease, background-color 0.12s ease;
        }
        button.cm-small-button {
            padding: 4px 12px;
            border-width: 1px;
            border-style: solid;
            border-radius: 5px;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.2;
            appearance: none;
            -webkit-appearance: none;
            transition: filter 0.12s ease, background-color 0.12s ease;
        }
        button.cm-experimental-button {
            padding: 6px 12px;
        }
    `;
    document.head.appendChild(style);
}
