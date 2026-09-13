const { Pool } = require("pg");
require("dotenv").config();

// En produccion (Render, Railway...) la conexion llega como una sola cadena
// en DATABASE_URL y exige SSL. En local se siguen usando las variables
// sueltas contra el Postgres del puerto 5433.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Render usa certificados propios para las conexiones internas; sin
      // esto la conexion se rechaza por no poder validar la cadena.
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

module.exports = pool;
