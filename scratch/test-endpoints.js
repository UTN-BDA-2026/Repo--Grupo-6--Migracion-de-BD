const http = require("http");

function post(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response from ${path}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: path,
        method: "GET"
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response from ${path}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  try {
    console.log("=== Probando /concurrency/setup ===");
    let res = await post("/api/concurrency/setup");
    console.log("Setup User:", res.user);

    console.log("\n=== Probando /concurrency/lost-update ===");
    res = await post("/api/concurrency/lost-update");
    console.log("Saldo Final (Lost Update):", res.finalBalance);
    console.log("Timeline Log count:", res.timeline.length);

    console.log("\n=== Reseteando para prueba de Bloqueo Pesimista ===");
    await post("/api/concurrency/setup");
    console.log("\n=== Probando /concurrency/pessimistic ===");
    res = await post("/api/concurrency/pessimistic");
    console.log("Saldo Final (Pessimistic Locking):", res.finalBalance);

    console.log("\n=== Reseteando para prueba de Bloqueo Optimista ===");
    await post("/api/concurrency/setup");
    console.log("\n=== Probando /concurrency/optimistic ===");
    res = await post("/api/concurrency/optimistic");
    console.log("Saldo Final (Optimistic Locking):", res.finalBalance);

    console.log("\n=== Reseteando para prueba Serializable ===");
    await post("/api/concurrency/setup");
    console.log("\n=== Probando /concurrency/serializable ===");
    res = await post("/api/concurrency/serializable");
    console.log("Saldo Final (Serializable):", res.finalBalance);

    console.log("\n=== Probando /concurrency/savepoint ===");
    res = await post("/api/concurrency/savepoint");
    console.log("Saldo Inicial (Savepoint):", res.initialBalance);
    console.log("Saldo Final (Savepoint):", res.finalBalance);
    console.log("Logs de Savepoint:");
    res.timeline.forEach(log => console.log(`  - ${log.message}`));

    console.log("\n=== Probando /admin/partition-stats ===");
    res = await get("/api/admin/partition-stats");
    console.log("Stats de Particiones:");
    res.stats.forEach(s => console.log(`  - ${s.partition_name}: ${s.row_count} registros`));

  } catch (error) {
    console.error("Fallo al ejecutar las pruebas:", error.message);
  }
}

main();
