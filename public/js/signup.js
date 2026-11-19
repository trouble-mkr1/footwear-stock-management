"use strict";
const signupForm = document.getElementById("signup-form");
const signupError = document.getElementById("signup-error");
const signupSuccess = document.getElementById("signup-success");
const signupButton = document.getElementById("signup-button");
signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    signupError.textContent = "";
    signupSuccess.textContent = "";
    const password = document.getElementById("signup-password").value;
    if (password !== document.getElementById("signup-confirm").value) {
        signupError.textContent = "Passwords do not match.";
        return;
    }
    signupButton.disabled = true;
    signupButton.textContent = "Creating account...";
    try {
        const response = await fetch("/api/auth/signup", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: document.getElementById("signup-name").value.trim(),
                phone: document.getElementById("signup-phone").value.trim(),
                shop_name: document.getElementById("signup-shop").value.trim(),
                address: document.getElementById("signup-address").value.trim(),
                password
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to sign up.");
        signupSuccess.textContent = "Account created! You can now log in.";
        signupForm.reset();
    } catch (error) {
        signupError.textContent = error.message;
    } finally {
        signupButton.disabled = false;
        signupButton.textContent = "Create Account";
    }
});
