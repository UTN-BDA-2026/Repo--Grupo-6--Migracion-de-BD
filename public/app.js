const form = document.getElementById("registerForm");
const responseBox = document.getElementById("responseBox");
const loginForm = document.getElementById("loginForm");
const loginResponseBox = document.getElementById("loginResponseBox");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const registerCard = document.getElementById("registerCard");
const loginCard = document.getElementById("loginCard");
const authSection = document.getElementById("authSection");
const authActions = document.querySelectorAll("[data-auth-target]");

function showAuthView(target) {
  const showRegister = target === "register";
  registerCard.hidden = !showRegister;
  loginCard.hidden = showRegister;
  authSection.classList.add("visible");
  authSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

authActions.forEach((action) => {
  action.addEventListener("click", (event) => {
    event.preventDefault();
    const target = action.getAttribute("data-auth-target");
    if (target === "register" || target === "login") {
      showAuthView(target);
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password")
  };

  responseBox.textContent = "Enviando...";

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      responseBox.textContent = `Error (${response.status}): ${data.error || "desconocido"}`;
      return;
    }

    responseBox.textContent = `Registro creado:\n${JSON.stringify(data, null, 2)}`;
    form.reset();
  } catch (error) {
    responseBox.textContent = `Error de red: ${error.message}`;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = {
    email: formData.get("email"),
    password: formData.get("password")
  };

  loginResponseBox.textContent = "Validando credenciales...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      loginResponseBox.textContent = `Error (${response.status}): ${data.error || "desconocido"}`;
      return;
    }

    loginResponseBox.textContent = `Inicio de sesión exitoso:\n${JSON.stringify(data, null, 2)}`;
  } catch (error) {
    loginResponseBox.textContent = `Error de red: ${error.message}`;
  }
});

forgotPasswordBtn.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;

  if (!email) {
    loginResponseBox.textContent = "Ingrese su correo para recuperar la contraseña.";
    return;
  }

  loginResponseBox.textContent = "Procesando solicitud...";

  try {
    const response = await fetch("/api/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    loginResponseBox.textContent = `${data.message || "Solicitud enviada."}`;
  } catch (error) {
    loginResponseBox.textContent = `Error de red: ${error.message}`;
  }
});
