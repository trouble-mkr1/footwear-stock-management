const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginButton = document.getElementById("login-button");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    loginError.textContent = "";
    loginButton.disabled = true;
    loginButton.textContent = "LOGGING IN...";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Login failed.");
        }

        // Login successful, open the admin dashboard
        window.location.replace("/");

    } catch (error) {
        loginError.textContent = error.message;
        loginButton.disabled = false;
        loginButton.textContent = "LOGIN";
    }
});
