(() => {

    // Automatically redirect to login if an admin API request
    // returns 401 (session expired or authentication missing).

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
        const response = await originalFetch(...args);

        try {
            const requestInput = args[0];

            const requestUrl =
                requestInput && typeof requestInput === "object" && "url" in requestInput
                    ? requestInput.url
                    : requestInput;

            const pathname = new URL(
                String(requestUrl),
                window.location.origin
            ).pathname;

            if (
                response.status === 401 &&
                pathname.startsWith("/api/")
            ) {
                window.location.replace("/");
            }

        } catch (error) {
            console.error("Authentication response check failed:", error);
        }

        return response;
    };


    // Logout button

    const logoutButton = document.getElementById("logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {

            logoutButton.disabled = true;
            logoutButton.textContent = "LOGGING OUT...";

            try {
                const response = await fetch("/api/auth/logout", {
                    method: "POST"
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || "Logout failed.");
                }

                window.location.replace("/");

            } catch (error) {
                console.error("Logout error:", error);

                alert(error.message || "Unable to log out.");

                logoutButton.disabled = false;
                logoutButton.textContent = "LOG OUT";
            }
        });
    }

})();
