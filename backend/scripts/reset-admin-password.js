// Recuperacion de la cuenta de un admin que perdio su contraseña.
//
// Los admins NO tienen "olvide mi contraseña" por correo (POST /users/test los
// ignora a proposito): quien se hiciera del correo se haria del panel. Esta es
// la unica salida, y exige acceso a la base, que es justo lo que no tiene un
// atacante.
//
//   node scripts/reset-admin-password.js tu@correo.com   (dentro de /backend)
//
// Contra produccion: poner antes en la misma ventana la External Database URL
// de Render ($env:DATABASE_URL = "..." en PowerShell).
//
// Inventa una contraseña fuerte (como hash.js), guarda su hash bcrypt y cierra
// las sesiones abiertas de ese admin. La contraseña se muestra UNA vez: se
// entra con ella y se cambia en /admin/cuenta.
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../db");

const BCRYPT_ROUNDS = 12;
const email = (process.argv[2] || "").trim().toLowerCase();

(async () => {
  if (!email) {
    console.log("Falta el correo: node scripts/reset-admin-password.js tu@correo.com");
    process.exit(1);
  }

  const password = crypto.randomBytes(16).toString("base64url");
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "UPDATE admins SET password = $1 WHERE lower(trim(email)) = $2 RETURNING id",
      [hash, email],
    );
    if (rows.length !== 1) {
      await client.query("ROLLBACK");
      console.log(`No se cambio nada: ${rows.length} admins con ese correo`);
      process.exitCode = 1;
      return;
    }
    await client.query(
      "DELETE FROM sessions WHERE user_id = $1 AND role = 'admin'",
      [rows[0].id],
    );
    await client.query("COMMIT");

    const base = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).hostname
      : `${process.env.DB_HOST}:${process.env.DB_PORT} (local)`;
    console.log(`Base: ${base}`);
    console.log(`Admin ${rows[0].id} actualizado.`);
    console.log(`\nContraseña temporal (entra y cámbiala en /admin/cuenta):\n\n  ${password}\n`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
