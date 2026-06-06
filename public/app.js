// Selectores existentes
const form = document.getElementById("registerForm");
const responseBox = document.getElementById("responseBox");
const loginForm = document.getElementById("loginForm");
const loginResponseBox = document.getElementById("loginResponseBox");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const registerCard = document.getElementById("registerCard");
const loginCard = document.getElementById("loginCard");
const authSection = document.getElementById("authSection");
const authActions = document.querySelectorAll("[data-auth-target]");

// Nuevos Selectores del Panel de Concurrencia
const concurrencySection = document.getElementById("concurrencySection");
const heroSection = document.getElementById("inicio");
const navActions = document.querySelectorAll("[data-nav-target]");

const testUserInfo = document.getElementById("testUserInfo");
const consoleBody = document.getElementById("consoleBody");
const btnClearConsole = document.getElementById("btnClearConsole");

const btnSetup = document.getElementById("btnSetup");
const btnLostUpdate = document.getElementById("btnLostUpdate");
const btnPessimistic = document.getElementById("btnPessimistic");
const btnOptimistic = document.getElementById("btnOptimistic");
const btnSerializable = document.getElementById("btnSerializable");
const btnSavepoint = document.getElementById("btnSavepoint");

const btnRefreshPartition = document.getElementById("btnRefreshPartition");
const countOld = document.getElementById("countOld");
const count2026 = document.getElementById("count2026");
const countFuture = document.getElementById("countFuture");
const partitionUsersBody = document.getElementById("partitionUsersBody");

// Manejo de Navegación y Vistas
function showView(view) {
  if (view === "home") {
    heroSection.hidden = false;
    authSection.hidden = false;
    concurrencySection.hidden = true;
    registerCard.hidden = true;
    loginCard.hidden = true;
  } else if (view === "concurrency") {
    heroSection.hidden = true;
    authSection.hidden = true;
    concurrencySection.hidden = false;
    loadTestUserStatus();
    loadPartitionStats();
  }
}

navActions.forEach((nav) => {
  nav.addEventListener("click", (event) => {
    event.preventDefault();
    const target = nav.getAttribute("data-nav-target");
    showView(target);
  });
});

function showAuthView(target) {
  showView("home");
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

// Lógica de Registro
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

// Lógica de Inicio de Sesión
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

// Lógica de Recuperar Contraseña
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

// ==========================================
// FUNCIONES DEL PANEL DE CONCURRENCIA
// ==========================================

// Limpiar Consola de logs
btnClearConsole.addEventListener("click", () => {
  consoleBody.innerHTML = `<p class="console-placeholder">Los logs del motor SQL aparecerán aquí cuando inicies alguna simulación...</p>`;
});

// Cargar estado del usuario de prueba
async function loadTestUserStatus() {
  testUserInfo.innerHTML = `<span class="status-badge loading">Cargando estado del usuario...</span>`;
  try {
    // We execute setup but without force resetting (setup route is idempotent and returns status if already set up,
    // though here we call setup which does reset to 100 for simplicity and sync).
    const res = await fetch("/api/concurrency/setup", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      renderUserStatus(data.user);
    } else {
      testUserInfo.innerHTML = `<span class="status-badge error">Error: ${data.error}</span>`;
    }
  } catch (e) {
    testUserInfo.innerHTML = `<span class="status-badge error">Error de red al conectar</span>`;
  }
}

function renderUserStatus(user) {
  testUserInfo.innerHTML = `
    <div class="user-status-card">
      <p><strong>Email:</strong> <code>${user.email}</code></p>
      <p><strong>Saldo (Postgres):</strong> <span class="balance-amount">$${user.balance}</span></p>
      <p><strong>Versión del Registro:</strong> <span class="version-badge">${user.version}</span></p>
      <p><strong>Partición Física Actual:</strong> <span class="partition-badge">${user.partition || "Desconocida"}</span></p>
    </div>
  `;
}

// Cargar estadísticas de particiones
async function loadPartitionStats() {
  try {
    const res = await fetch("/api/admin/partition-stats");
    const data = await res.json();
    if (data.success) {
      // Update count statistics
      const oldStat = data.stats.find(s => s.partition_name === "users_old");
      const stat2026 = data.stats.find(s => s.partition_name === "users_2026");
      const futureStat = data.stats.find(s => s.partition_name === "users_future");

      countOld.textContent = oldStat ? oldStat.row_count : "0";
      count2026.textContent = stat2026 ? stat2026.row_count : "0";
      countFuture.textContent = futureStat ? futureStat.row_count : "0";

      // Render physical users list
      if (data.users.length === 0) {
        partitionUsersBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay registros migrados en PostgreSQL.</td></tr>`;
      } else {
        partitionUsersBody.innerHTML = data.users.map(u => `
          <tr>
            <td>${u.name}</td>
            <td><code>${u.email}</code></td>
            <td>${new Date(u.registered_at).toLocaleDateString()}</td>
            <td class="text-right">$${u.balance}</td>
            <td><span class="partition-badge ${u.partition_name}">${u.partition_name}</span></td>
          </tr>
        `).join("");
      }
    }
  } catch (e) {
    console.error("Error al cargar estadísticas de partición:", e);
  }
}

btnRefreshPartition.addEventListener("click", loadPartitionStats);

// Escribir logs en la consola interactiva
function appendConsoleLogs(timeline) {
  consoleBody.innerHTML = "";
  timeline.forEach((log) => {
    const logDiv = document.createElement("div");
    logDiv.className = "console-line";
    
    let txClass = "sys";
    let badgeText = "SYS";
    if (log.tx === "Tx A") {
      txClass = "tx-a";
      badgeText = "Tx A";
    } else if (log.tx === "Tx B") {
      txClass = "tx-b";
      badgeText = "Tx B";
    } else if (log.tx === "Explicación") {
      txClass = "explain";
      badgeText = "INFO";
    }

    logDiv.innerHTML = `
      <span class="log-time">${log.time || ""}</span>
      <span class="log-badge ${txClass}">${badgeText}</span>
      <span class="log-text ${txClass}">${log.message}</span>
    `;
    consoleBody.appendChild(logDiv);
  });
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

// Handler general para ejecutar simulaciones
async function runSimulation(endpoint, btn) {
  const originalText = btn.textContent;
  btn.textContent = "Ejecutando...";
  btn.disabled = true;
  consoleBody.innerHTML = `<div class="console-loading">Estableciendo conexiones y disparando transacciones...</div>`;

  try {
    const res = await fetch(`/api${endpoint}`, { method: "POST" });
    const data = await res.json();
    
    if (data.success) {
      if (data.timeline) {
        appendConsoleLogs(data.timeline);
      } else if (data.logs) {
        // format for setup or savepoint logs if not structured the same
        const formattedTimeline = data.logs.map((l, i) => ({
          time: new Date().toLocaleTimeString(),
          tx: "Sistema",
          message: l
        }));
        appendConsoleLogs(formattedTimeline);
      }
    } else {
      consoleBody.innerHTML = `<div class="console-line error"><span class="log-badge error">ERROR</span> Ocurrió un error en la simulación: ${data.error}</div>`;
    }
  } catch (e) {
    consoleBody.innerHTML = `<div class="console-line error"><span class="log-badge error">ERROR DE RED</span> No se pudo contactar al servidor: ${e.message}</div>`;
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    loadTestUserStatus();
    loadPartitionStats();
  }
}

// Conectar botones del dashboard
btnSetup.addEventListener("click", () => runSimulation("/concurrency/setup", btnSetup));
btnLostUpdate.addEventListener("click", () => runSimulation("/concurrency/lost-update", btnLostUpdate));
btnPessimistic.addEventListener("click", () => runSimulation("/concurrency/pessimistic", btnPessimistic));
btnOptimistic.addEventListener("click", () => runSimulation("/concurrency/optimistic", btnOptimistic));
btnSerializable.addEventListener("click", () => runSimulation("/concurrency/serializable", btnSerializable));

btnSavepoint.addEventListener("click", async () => {
  const originalText = btnSavepoint.textContent;
  btnSavepoint.textContent = "Ejecutando...";
  btnSavepoint.disabled = true;
  consoleBody.innerHTML = `<div class="console-loading">Iniciando bloque de transacción y ejecutando sentencias...</div>`;

  try {
    const res = await fetch("/api/concurrency/savepoint", { method: "POST" });
    const data = await res.json();
    if (data.timeline) {
      const formattedTimeline = data.timeline.map((log) => ({
        time: log.time,
        tx: log.message.includes("¡Fallo") ? "Tx A" : (log.message.includes("Restaurando") ? "Sistema" : "Tx A"),
        message: log.message
      }));
      
      // Append explanation
      formattedTimeline.push({
        time: new Date().toLocaleTimeString(),
        tx: "Explicación",
        message: "La transacción ejecutó una deducción válida, creó un SAVEPOINT, luego disparó una inserción errónea que falló. La aplicación capturó el error y ejecutó 'ROLLBACK TO SAVEPOINT', deshaciendo el fallo y permitiendo que la transacción continuara restando saldo y confirmara con COMMIT."
      });

      appendConsoleLogs(formattedTimeline);
    }
  } catch (e) {
    consoleBody.innerHTML = `<div class="console-line error"><span class="log-badge error">ERROR DE RED</span> ${e.message}</div>`;
  } finally {
    btnSavepoint.textContent = originalText;
    btnSavepoint.disabled = false;
    loadTestUserStatus();
    loadPartitionStats();
  }
});
