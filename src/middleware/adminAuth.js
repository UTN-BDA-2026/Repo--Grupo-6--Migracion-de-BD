function requireAdmin(req, res, next) {
  const role = String(req.headers["x-role"] || "").toLowerCase();
  const key = String(req.headers["x-admin-key"] || "");
  const expectedKey = String(process.env.ADMIN_API_KEY || "");

  if (!expectedKey) {
    return res.status(500).json({
      error: "ADMIN_API_KEY no está configurado en el entorno"
    });
  }

  if (role !== "admin" || key !== expectedKey) {
    return res.status(403).json({ error: "Acceso denegado" });
  }

  return next();
}

module.exports = {
  requireAdmin
};
