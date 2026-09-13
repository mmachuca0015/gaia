// Aplica los .sql de esta carpeta en orden alfabetico.
const fs = require("fs");
const path = require("path");
const pool = require("../db");

(async () => {
  const dir = __dirname;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await pool.query(sql);
    console.log(`OK  ${file}`);
  }
  await pool.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
