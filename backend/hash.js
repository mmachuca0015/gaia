// Genera el hash bcrypt de una contraseña para darla de alta a mano en la
// tabla `admins` (los admins no tienen registro por la app).
//
// Uso:
//   node hash.js              -> inventa una contraseña fuerte y la muestra
//   echo "mi contraseña" | node hash.js --stdin
//
// La contraseña NUNCA se escribe en este archivo ni se pasa como argumento:
// un argumento queda guardado en el historial de la terminal.

const bcrypt = require("bcrypt");
const crypto = require("crypto");

const BCRYPT_ROUNDS = 12;

// Contraseña aleatoria de 128 bits. Es mas segura que cualquiera que se
// pueda inventar a mano, y como se guarda en un gestor no hay que recordarla.
function generarContrasena() {
  return crypto.randomBytes(16).toString("base64url");
}

function leerDeStdin() {
  return new Promise((resolve, reject) => {
    let datos = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (trozo) => (datos += trozo));
    process.stdin.on("end", () => resolve(datos.trim()));
    process.stdin.on("error", reject);
  });
}

(async () => {
  const usarStdin = process.argv.includes("--stdin");
  const contrasena = usarStdin ? await leerDeStdin() : generarContrasena();

  if (!contrasena) {
    console.error("No se recibio ninguna contraseña.");
    process.exit(1);
  }
  if (contrasena.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(contrasena, BCRYPT_ROUNDS);

  console.log("\n  Contraseña:  " + contrasena);
  console.log("  Hash:        " + hash);
  console.log("\n  Guarda la contraseña en tu gestor AHORA: no se puede");
  console.log("  recuperar del hash.\n");
  console.log("  SQL para dar de alta o actualizar al admin:\n");
  console.log(
    `    UPDATE admins SET password = '${hash}' WHERE email = 'tu@correo.com';`,
  );
  console.log(
    `    -- o, si aun no existe:\n    INSERT INTO admins (email, password) VALUES ('tu@correo.com', '${hash}');\n`,
  );
})();
