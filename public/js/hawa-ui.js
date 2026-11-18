// Shared HAWA TRADERS feedback: small toast messages and accessible dialogs.
// Include this file BEFORE auth.js, script.js, and orders.js.
(() => {
    "use strict";

    let toastTimer;
    let toastElement;

    function toast(message, type = "success") {
        if (!toastElement) {
            toastElement = document.createElement("div");
            toastElement.className = "hawa-toast";
            toastElement.hidden = true;
            document.body.appendChild(toastElement);
        }

        clearTimeout(toastTimer);
        toastElement.textContent = String(message ?? "");
        toastElement.className = `hawa-toast hawa-toast--${["success", "warning", "error"].includes(type) ? type : "success"}`;
        toastElement.setAttribute("role", type === "error" ? "alert" : "status");
        toastElement.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
        toastElement.hidden = false;

        toastTimer = setTimeout(() => {
            toastElement.hidden = true;
        }, type === "success" ? 3200 : 5000);
    }

    function openDialog({ title, message, confirmText, cancelText = "Cancel", showCancel = true, destructive = false }) {
        return new Promise(resolve => {
            const previouslyFocused = document.activeElement;
            const dialog = document.createElement("dialog");
            dialog.className = "hawa-dialog";

            const panel = document.createElement("div");
            panel.className = "hawa-dialog__panel";

            const heading = document.createElement("h2");
            heading.className = "hawa-dialog__title";
            heading.textContent = title;
            const headingId = `hawa-title-${Math.random().toString(36).slice(2)}`;
            heading.id = headingId;
            dialog.setAttribute("aria-labelledby", headingId);

            const body = document.createElement("p");
            body.className = "hawa-dialog__message";
            body.textContent = String(message ?? "");

            const actions = document.createElement("div");
            actions.className = "hawa-dialog__actions";

            let cancelButton;
            if (showCancel) {
                cancelButton = document.createElement("button");
                cancelButton.type = "button";
                cancelButton.className = "hawa-dialog__button hawa-dialog__button--cancel";
                cancelButton.textContent = cancelText;
                cancelButton.addEventListener("click", () => dialog.close());
                actions.appendChild(cancelButton);
            }

            const okButton = document.createElement("button");
            okButton.type = "button";
            okButton.className = `hawa-dialog__button ${destructive ? "hawa-dialog__button--danger" : "hawa-dialog__button--primary"}`;
            okButton.textContent = confirmText;
            let accepted = false;
            okButton.addEventListener("click", () => {
                accepted = true;
                dialog.close();
            });
            actions.appendChild(okButton);

            panel.append(heading, body, actions);
            dialog.appendChild(panel);
            document.body.appendChild(dialog);

            dialog.addEventListener("close", () => {
                dialog.remove();
                if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
                    previouslyFocused.focus();
                }
                resolve(accepted);
            }, { once: true });

            dialog.showModal();
            // For irreversible actions, put keyboard focus on the safe choice.
            if (cancelButton) cancelButton.focus();
            else okButton.focus();
        });
    }

    window.HawaUI = Object.freeze({
        toast,
        alert(message, { title = "Please check" } = {}) {
            return openDialog({ title, message, confirmText: "OK", showCancel: false });
        },
        confirm(message, { title = "Confirm action", confirmText = "Confirm", destructive = false } = {}) {
            return openDialog({ title, message, confirmText, destructive, showCancel: true });
        }
    });
})();
