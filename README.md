# Proyecto PoC — Migración y Gestión de Usuarios

Readme de ejemplo para proyecto.
Materia: Base de Datos Avanzada.
Año: 2026.
Integrantes: Destéfano Juan Ignacio - Occhipinti Camilo Julián.
Institución: Universidad Tecnológica Nacional.

Objetivo: Migrar y gestionar información de usuarios (correo, nombre, fecha, etc) que se registran o inician sesión en un prototipo. Los datos se alojan inicialmente en SQLite y un usuario con rol de Administrador puede migrar esos datos a otra base de datos, por ejemplo PostgreSQL, manteniendo integridad de los datos y seguridad de la información.

---

# PoC Registro + Migracion SQLite a PostgreSQL

## 1) Estructura sugerida

- `public/`: interfaz web simple (formulario)
- `src/db/`: conexiones y creación de tablas
- `src/routes/`: endpoints HTTP
- `scripts/`: script ETL de migración

## 2) Configuración

1. Copia `.env.example` a `.env` y ajusta credenciales de PostgreSQL.
2. Crea la base PostgreSQL indicada en `POSTGRES_DB` (por ejemplo `users_prod`).

## 3) Instalación

```bash
npm install
```

## 4) Levantar servidor

```bash
npm run dev
```

Abre http://localhost:3000 y registra usuarios (se guardan en SQLite).

## 5) Ejecutar migración ETL (SQLite -> PostgreSQL)

```bash
npm run migrate
```

El script inserta usuarios en PostgreSQL y omite duplicados por email usando `ON CONFLICT`.

## 6) Backup lógico (solo administrador)

El endpoint no aparece en la interfaz de usuario y requiere rol admin.

1. Define `ADMIN_API_KEY` en tu archivo `.env`.
2. Ejecuta el servidor:

```bash
npm start
```

3. Lanza el backup lógico por API (PowerShell):

```powershell
$headers = @{
	"x-role" = "admin"
	"x-admin-key" = "TU_ADMIN_API_KEY"
	"Content-Type" = "application/json"
}

Invoke-WebRequest -Method POST -Uri http://localhost:3000/api/admin/backup-logico -Headers $headers
```

Se genera un archivo JSON en `./backups/` con:
- snapshot de usuarios en SQLite
- snapshot de usuarios en PostgreSQL
- validación: conteos, hash SHA-256 por fuente y diferencias por correo

## 7) Índices y demostración de uso

Para reforzar el tema de índices, el proyecto crea:

- `idx_users_registered_at` en SQLite y PostgreSQL
- `idx_users_name` en SQLite y PostgreSQL

Se añadió una consulta administrativa de usuarios recientes que ordena por `registered_at` y aprovecha el índice:

```bash
GET /api/admin/usuarios-recientes?limit=10
```

Ejemplo en PowerShell:

```powershell
$headers = @{
	"x-role" = "admin"
	"x-admin-key" = "TU_ADMIN_API_KEY"
}

Invoke-WebRequest -Method GET -Uri "http://localhost:3000/api/admin/usuarios-recientes?limit=10" -Headers $headers
```
