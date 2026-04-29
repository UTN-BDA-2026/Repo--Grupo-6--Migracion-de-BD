require("dotenv").config();

const path = require("path");
const express = require("express");
const { initSqlite } = require("./src/db/sqlite");
const { initPostgres } = require("./src/db/postgres");
const authRoutes = require("./src/routes/authRoutes");
const adminRoutes = require("./src/routes/adminRoutes");

const app = express();
const port = Number(process.env.PORT || 3000);

initSqlite();
initPostgres().catch((error) => {
  console.warn("No se pudo inicializar PostgreSQL al arrancar:", error.message);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", authRoutes);
app.use("/api", adminRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
