const express = require("express");
const bcrypt = require("bcryptjs");
const { pgPool } = require("../db/postgres");
const { sqliteDb } = require("../db/sqlite");
const { createPostgresUserRepository } = require("../repositories/postgresUserRepository");
const { createSqliteUserRepository } = require("../repositories/sqliteUserRepository");

const router = express.Router();
const pgRepository = createPostgresUserRepository(pgPool);
const sqliteRepository = createSqliteUserRepository(sqliteDb);

const TEST_EMAIL = "concurrente@ejemplo.com";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to ensure test user exists and balance is reset
router.post("/concurrency/setup", async (req, res) => {
  const logs = [];
  try {
    logs.push("Inicializando usuario de prueba en SQLite y PostgreSQL...");

    let sqliteUser = sqliteRepository.findByEmail(TEST_EMAIL);
    if (!sqliteUser) {
      logs.push("Creando usuario de prueba en SQLite...");
      const passwordHash = await bcrypt.hash("password123", 10);
      sqliteRepository.createUser({
        name: "Usuario Concurrente",
        email: TEST_EMAIL,
        passwordHash,
        registeredAt: new Date().toISOString(),
        balance: 100,
        version: 1
      });
      sqliteUser = sqliteRepository.findByEmail(TEST_EMAIL);
    } else {
      // Reset SQLite balance
      sqliteDb.prepare("UPDATE users SET balance = 100, version = 1 WHERE email = ?").run(TEST_EMAIL);
      logs.push("Usuario de prueba reseteado en SQLite.");
    }

    // Now check Postgres
    const client = await pgPool.connect();
    try {
      let pgUser = await pgRepository.findByEmail(TEST_EMAIL);
      if (!pgUser) {
        logs.push("Creando usuario de prueba en PostgreSQL...");
        const passwordHash = await bcrypt.hash("password123", 10);
        await client.query(
          `INSERT INTO users (name, email, password_hash, registered_at, balance, version)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ["Usuario Concurrente", TEST_EMAIL, passwordHash, new Date(), 100.00, 1]
        );
      } else {
        await client.query("UPDATE users SET balance = 100.00, version = 1 WHERE email = $1", [TEST_EMAIL]);
        logs.push("Usuario de prueba reseteado en PostgreSQL.");
      }
    } finally {
      client.release();
    }

    // Fetch fresh stats
    const pgUser = await pgRepository.findByEmail(TEST_EMAIL);
    const partitionName = await pgRepository.getPartitionInfo(TEST_EMAIL);

    return res.status(200).json({
      success: true,
      message: "Entorno de concurrencia listo",
      logs,
      user: {
        email: pgUser.email,
        balance: pgUser.balance,
        version: pgUser.version,
        partition: partitionName
      }
    });
  } catch (error) {
    console.error("Error en setup de concurrencia:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1. LOST UPDATE (Sin bloqueos)
router.post("/concurrency/lost-update", async (req, res) => {
  const timeline = [];
  const addLog = (tx, msg) => {
    timeline.push({ time: new Date().toLocaleTimeString(), tx, message: msg });
  };

  try {
    addLog("Sistema", "Iniciando Simulación de Pérdida de Actualización (Lost Update)");

    // Define two concurrent transactions that will read, sleep, and write
    const runTxA = async () => {
      const client = await pgPool.connect();
      try {
        addLog("Tx A", "Conexión adquirida. Iniciando transacción...");
        await client.query("BEGIN");
        
        addLog("Tx A", "Leyendo saldo del usuario...");
        const result = await client.query("SELECT balance FROM users WHERE email = $1", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        addLog("Tx A", `Saldo leído: $${balance}`);

        addLog("Tx A", "Simulando cálculo de negocio lento (Sleep de 2s)...");
        await sleep(2000);

        const newBalance = balance - 30; // Deduct $30
        addLog("Tx A", `Cálculo terminado. Nuevo saldo calculado: $${newBalance}. Escribiendo en DB...`);
        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [newBalance, TEST_EMAIL]);

        await client.query("COMMIT");
        addLog("Tx A", "Transacción COMPROMETIDA (COMMIT).");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx A", `Error detectado. Rollback: ${err.message}`);
      } finally {
        client.release();
      }
    };

    const runTxB = async () => {
      await sleep(200); // Tx B starts slightly after Tx A
      const client = await pgPool.connect();
      try {
        addLog("Tx B", "Conexión adquirida. Iniciando transacción...");
        await client.query("BEGIN");

        addLog("Tx B", "Leyendo saldo del usuario...");
        const result = await client.query("SELECT balance FROM users WHERE email = $1", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        addLog("Tx B", `Saldo leído: $${balance}`);

        addLog("Tx B", "Simulando cálculo de negocio (Sleep de 1s)...");
        await sleep(1000);

        const newBalance = balance - 40; // Deduct $40
        addLog("Tx B", `Cálculo terminado. Nuevo saldo calculado: $${newBalance}. Escribiendo en DB...`);
        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [newBalance, TEST_EMAIL]);

        await client.query("COMMIT");
        addLog("Tx B", "Transacción COMPROMETIDA (COMMIT).");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx B", `Error detectado. Rollback: ${err.message}`);
      } finally {
        client.release();
      }
    };

    // Run both concurrently
    await Promise.all([runTxA(), runTxB()]);

    const finalUser = await pgRepository.findByEmail(TEST_EMAIL);
    addLog("Sistema", `Simulación terminada. Saldo final en PostgreSQL: $${finalUser.balance}`);
    addLog("Explicación", "Ambas transacciones leyeron saldo $100. Tx B restó $40 y guardó $60 en T=1.2s. Tx A restó $30 sobre su lectura inicial de $100 y guardó $70 en T=2s. La actualización de Tx B se perdió por completo.");

    return res.status(200).json({ success: true, timeline, finalBalance: finalUser.balance });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. PESSIMISTIC LOCKING (FOR UPDATE)
router.post("/concurrency/pessimistic", async (req, res) => {
  const timeline = [];
  const addLog = (tx, msg) => {
    timeline.push({ time: new Date().toLocaleTimeString(), tx, message: msg });
  };

  try {
    addLog("Sistema", "Iniciando Simulación con Bloqueo Pesimista (FOR UPDATE)");

    const runTxA = async () => {
      const client = await pgPool.connect();
      try {
        addLog("Tx A", "Conexión adquirida. Iniciando transacción...");
        await client.query("BEGIN");
        
        addLog("Tx A", "Bloqueando fila con SELECT ... FOR UPDATE...");
        const result = await client.query("SELECT balance FROM users WHERE email = $1 FOR UPDATE", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        addLog("Tx A", `Fila bloqueada. Saldo leído: $${balance}`);

        addLog("Tx A", "Simulando cálculo de negocio lento (Sleep de 2s)...");
        await sleep(2000);

        const newBalance = balance - 30; // Deduct $30
        addLog("Tx A", `Escribiendo saldo actualizado: $${newBalance}...`);
        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [newBalance, TEST_EMAIL]);

        await client.query("COMMIT");
        addLog("Tx A", "Transacción COMPROMETIDA (COMMIT) y bloqueo liberado.");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx A", `Error: ${err.message}`);
      } finally {
        client.release();
      }
    };

    const runTxB = async () => {
      await sleep(200);
      const client = await pgPool.connect();
      try {
        addLog("Tx B", "Conexión adquirida. Iniciando transacción...");
        await client.query("BEGIN");

        addLog("Tx B", "Intentando adquirir bloqueo SELECT ... FOR UPDATE...");
        const result = await client.query("SELECT balance FROM users WHERE email = $1 FOR UPDATE", [TEST_EMAIL]);
        // B will block here until A commits
        const balance = Number(result.rows[0].balance);
        addLog("Tx B", `Bloqueo adquirido. Saldo leído (actualizado por A): $${balance}`);

        addLog("Tx B", "Simulando cálculo de negocio (Sleep de 1s)...");
        await sleep(1000);

        const newBalance = balance - 40; // Deduct $40
        addLog("Tx B", `Escribiendo saldo actualizado: $${newBalance}...`);
        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [newBalance, TEST_EMAIL]);

        await client.query("COMMIT");
        addLog("Tx B", "Transacción COMPROMETIDA (COMMIT) y bloqueo liberado.");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx B", `Error: ${err.message}`);
      } finally {
        client.release();
      }
    };

    await Promise.all([runTxA(), runTxB()]);

    const finalUser = await pgRepository.findByEmail(TEST_EMAIL);
    addLog("Sistema", `Simulación terminada. Saldo final en PostgreSQL: $${finalUser.balance}`);
    addLog("Explicación", "Tx B intentó leer el saldo 200ms después, pero se bloqueó en el 'FOR UPDATE' esperando que Tx A liberara el registro. Cuando Tx A terminó y confirmó (COMMIT) con saldo $70, Tx B reanudó, leyó los $70 actualizados, restó $40 y guardó $30. El saldo final es correcto.");

    return res.status(200).json({ success: true, timeline, finalBalance: finalUser.balance });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. OPTIMISTIC LOCKING (Version checking)
router.post("/concurrency/optimistic", async (req, res) => {
  const timeline = [];
  const addLog = (tx, msg) => {
    timeline.push({ time: new Date().toLocaleTimeString(), tx, message: msg });
  };

  try {
    addLog("Sistema", "Iniciando Simulación con Bloqueo Optimista (Control de Versión)");

    const runTxA = async () => {
      const client = await pgPool.connect();
      try {
        addLog("Tx A", "Conexión adquirida. Iniciando transacción...");
        await client.query("BEGIN");

        addLog("Tx A", "Leyendo saldo y versión...");
        const result = await client.query("SELECT balance, version FROM users WHERE email = $1", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        const version = Number(result.rows[0].version);
        addLog("Tx A", `Leído saldo: $${balance}, versión: ${version}`);

        addLog("Tx A", "Simulando cálculo de negocio lento (Sleep de 2s)...");
        await sleep(2000);

        const newBalance = balance - 30; // Deduct $30
        addLog("Tx A", `Intentando actualizar con WHERE version = ${version}...`);
        const updateRes = await client.query(
          "UPDATE users SET balance = $1, version = version + 1 WHERE email = $2 AND version = $3",
          [newBalance, TEST_EMAIL, version]
        );

        if (updateRes.rowCount === 0) {
          throw new Error("Conflicto de concurrencia: El registro ya fue modificado por otra transacción.");
        }

        await client.query("COMMIT");
        addLog("Tx A", "Transacción COMPROMETIDA con éxito.");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx A", `Transacción abortada (ROLLBACK): ${err.message}`);
      } finally {
        client.release();
      }
    };

    const runTxB = async () => {
      await sleep(200);
      const client = await pgPool.connect();
      try {
        addLog("Tx B", "Conexión adquirida. Iniciando transacción...");
        await client.query("BEGIN");

        addLog("Tx B", "Leyendo saldo y versión...");
        const result = await client.query("SELECT balance, version FROM users WHERE email = $1", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        const version = Number(result.rows[0].version);
        addLog("Tx B", `Leído saldo: $${balance}, versión: ${version}`);

        addLog("Tx B", "Simulando cálculo de negocio (Sleep de 1s)...");
        await sleep(1000);

        const newBalance = balance - 40; // Deduct $40
        addLog("Tx B", `Intentando actualizar con WHERE version = ${version}...`);
        const updateRes = await client.query(
          "UPDATE users SET balance = $1, version = version + 1 WHERE email = $2 AND version = $3",
          [newBalance, TEST_EMAIL, version]
        );

        if (updateRes.rowCount === 0) {
          throw new Error("Conflicto de concurrencia: El registro ya fue modificado por otra transacción.");
        }

        await client.query("COMMIT");
        addLog("Tx B", "Transacción COMPROMETIDA con éxito.");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx B", `Transacción abortada (ROLLBACK): ${err.message}`);
      } finally {
        client.release();
      }
    };

    await Promise.all([runTxA(), runTxB()]);

    const finalUser = await pgRepository.findByEmail(TEST_EMAIL);
    addLog("Sistema", `Simulación terminada. Saldo final en PostgreSQL: $${finalUser.balance}, Versión actual: ${finalUser.version}`);
    addLog("Explicación", "Ambas transacciones leyeron la versión 1. Tx B terminó primero en T=1.2s, actualizando el saldo a $60 y la versión a 2. Cuando Tx A terminó en T=2.0s e intentó guardar con WHERE version = 1, la consulta no afectó ninguna fila porque la versión ya era 2. Tx A detectó el conflicto, revirtió (ROLLBACK) y evitó corromper los datos.");

    return res.status(200).json({ success: true, timeline, finalBalance: finalUser.balance });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 4. TRANSACTION ISOLATION (SERIALIZABLE)
router.post("/concurrency/serializable", async (req, res) => {
  const timeline = [];
  const addLog = (tx, msg) => {
    timeline.push({ time: new Date().toLocaleTimeString(), tx, message: msg });
  };

  try {
    addLog("Sistema", "Iniciando Simulación con Nivel de Aislamiento SERIALIZABLE");

    const runTxA = async () => {
      const client = await pgPool.connect();
      try {
        addLog("Tx A", "Conexión adquirida. Estableciendo aislamiento SERIALIZABLE...");
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");

        addLog("Tx A", "Leyendo saldo...");
        const result = await client.query("SELECT balance FROM users WHERE email = $1", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        addLog("Tx A", `Saldo leído: $${balance}`);

        addLog("Tx A", "Simulando cálculo de negocio lento (Sleep de 2s)...");
        await sleep(2000);

        const newBalance = balance - 30; // Deduct $30
        addLog("Tx A", `Intentando actualizar saldo a $${newBalance}...`);
        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [newBalance, TEST_EMAIL]);

        await client.query("COMMIT");
        addLog("Tx A", "Transacción COMPROMETIDA (COMMIT) con éxito.");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx A", `Fallo de Serialización detectado. Abortando (ROLLBACK). Detalle: ${err.message}`);
      } finally {
        client.release();
      }
    };

    const runTxB = async () => {
      await sleep(200);
      const client = await pgPool.connect();
      try {
        addLog("Tx B", "Conexión adquirida. Estableciendo aislamiento SERIALIZABLE...");
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");

        addLog("Tx B", "Leyendo saldo...");
        const result = await client.query("SELECT balance FROM users WHERE email = $1", [TEST_EMAIL]);
        const balance = Number(result.rows[0].balance);
        addLog("Tx B", `Saldo leído: $${balance}`);

        addLog("Tx B", "Simulando cálculo de negocio (Sleep de 1s)...");
        await sleep(1000);

        const newBalance = balance - 40; // Deduct $40
        addLog("Tx B", `Intentando actualizar saldo a $${newBalance}...`);
        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [newBalance, TEST_EMAIL]);

        await client.query("COMMIT");
        addLog("Tx B", "Transacción COMPROMETIDA (COMMIT) con éxito.");
      } catch (err) {
        await client.query("ROLLBACK");
        addLog("Tx B", `Fallo de Serialización detectado. Abortando (ROLLBACK). Detalle: ${err.message}`);
      } finally {
        client.release();
      }
    };

    await Promise.all([runTxA(), runTxB()]);

    const finalUser = await pgRepository.findByEmail(TEST_EMAIL);
    addLog("Sistema", `Simulación terminada. Saldo final en PostgreSQL: $${finalUser.balance}`);
    addLog("Explicación", "Bajo el aislamiento SERIALIZABLE, el motor de base de datos vigila lecturas y escrituras concurrentes. Tx B confirma con éxito ya que termina antes. Al terminar Tx A, PostgreSQL detecta una anomalía de serialización (código 40001) y cancela activamente la transacción de Tx A arrojando un error. La aplicación debe atrapar este error y reintentar.");

    return res.status(200).json({ success: true, timeline, finalBalance: finalUser.balance });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 5. SAVEPOINTS & ROLLBACK PARCIAL
router.post("/concurrency/savepoint", async (req, res) => {
  const timeline = [];
  const addLog = (msg) => {
    timeline.push({ time: new Date().toLocaleTimeString(), message: msg });
  };

  const client = await pgPool.connect();
  try {
    addLog("Iniciando transacción principal...");
    await client.query("BEGIN");

    // Get current balance
    const startRes = await client.query("SELECT balance FROM users WHERE email = $1", [TEST_EMAIL]);
    const initBalance = Number(startRes.rows[0].balance);
    addLog(`Saldo inicial: $${initBalance}`);

    // Paso 1: Operación Válida
    const step1Balance = initBalance - 10;
    addLog(`Paso 1: Restando $10. Nuevo saldo tentativo: $${step1Balance}`);
    await client.query("UPDATE users SET balance = $1 WHERE email = $2", [step1Balance, TEST_EMAIL]);

    // Paso 2: Crear SAVEPOINT
    addLog("Estableciendo SAVEPOINT 'punto_seguro'...");
    await client.query("SAVEPOINT punto_seguro");

    // Paso 3: Operación Inválida (Intento de violar clave duplicada o sintaxis errónea)
    addLog("Paso 2 (Fallido): Intentando ejecutar consulta errónea para simular fallo de negocio...");
    try {
      // Intentamos insertar un usuario con campos nulos o violar unicidad
      await client.query("INSERT INTO users (name, email, password_hash, registered_at) VALUES (NULL, $1, 'hash', NOW())", [TEST_EMAIL]);
    } catch (e) {
      addLog(`¡Fallo detectado en Paso 2! Error: ${e.message}`);
      addLog("Restaurando transacción al SAVEPOINT 'punto_seguro'...");
      await client.query("ROLLBACK TO SAVEPOINT punto_seguro");
      addLog("Transacción restaurada con éxito al estado posterior al Paso 1.");
    }

    // Paso 4: Otra Operación Válida
    const step4Balance = step1Balance - 20;
    addLog(`Paso 3: Restando $20 adicionales. Nuevo saldo tentativo: $${step4Balance}`);
    await client.query("UPDATE users SET balance = $1 WHERE email = $2", [step4Balance, TEST_EMAIL]);

    // Paso 5: Commit final
    await client.query("COMMIT");
    addLog("Transacción principal COMPROMETIDA (COMMIT).");

    const finalUser = await pgRepository.findByEmail(TEST_EMAIL);
    addLog(`Simulación de Savepoint completada. Saldo final real: $${finalUser.balance}`);

    return res.status(200).json({
      success: true,
      timeline,
      initialBalance: initBalance,
      finalBalance: finalUser.balance
    });
  } catch (error) {
    await client.query("ROLLBACK");
    addLog(`Fallo crítico en la transacción principal (ROLLBACK completo): ${error.message}`);
    return res.status(500).json({ success: false, timeline, error: error.message });
  } finally {
    client.release();
  }
});

// 6. PARTITION STATS
router.get("/admin/partition-stats", async (req, res) => {
  try {
    const stats = await pgRepository.getPartitionStats();
    
    // Fetch some users and their partition info
    const { rows: users } = await pgPool.query(
      `SELECT name, email, registered_at, balance, c.relname as partition_name
       FROM users u
       JOIN pg_class c ON u.tableoid = c.oid
       ORDER BY registered_at DESC`
    );

    return res.status(200).json({
      success: true,
      stats,
      users
    });
  } catch (error) {
    console.error("Error al obtener estadísticas de particiones:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
