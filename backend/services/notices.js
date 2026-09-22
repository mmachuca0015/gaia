// Avisos de un estudio a sus alumnos (migracion 017).
//
// Quien los recibe son los FAVORITOS de esa sucursal: el alumno ya dijo que
// le interesa, asi que no hace falta pedirle permiso aparte ni darle de baja.
// Si deja de tenerla en favoritos, deja de verlos.

/** Cuanto vive un aviso a la vista, del dueño y del alumno. */
const NOTICE_DAYS = 30;
const WINDOW = `INTERVAL '${NOTICE_DAYS} days'`;

/** Maximo de caracteres. El mismo numero esta en el CHECK de la tabla. */
const NOTICE_MAX = 500;

/**
 * Cuantos puede mandar una sucursal en 24 horas.
 *
 * No es una regla de negocio, es un freno: el alumno no puede darse de baja de
 * los avisos sin quitar el estudio de favoritos, asi que el dia que a alguien
 * se le ocurra mandar veinte al hilo, la salida del alumno seria dejar de
 * seguir al estudio. Le conviene mas al estudio que a nosotros.
 */
const DAILY_LIMIT = 5;

/**
 * Los avisos que le tocan a un alumno ($1 = su id), listos para pegarles un
 * SELECT enfrente. Lo usan la lista y el contador del punto rojo, para que no
 * puedan discrepar.
 *
 * `n.created_at >= f.created_at`: solo lo mandado DESPUES de que lo agrego a
 * favoritos. Quien marca un estudio hoy no tiene por que enterarse del aviso
 * de la semana pasada, que ya no le sirve. (El COALESCE es por los favoritos
 * viejos, de antes de que la tabla guardara la fecha.)
 */
const STUDENT_NOTICES = `
  FROM studio_notices n
  JOIN studios s   ON s.id = n.studio_id AND s.deleted_at IS NULL
  JOIN favorites f ON f.studio_id = n.studio_id AND f.user_id = $1
  WHERE n.created_at >= NOW() - ${WINDOW}
    AND n.created_at >= COALESCE(f.created_at, n.created_at)`;

/**
 * Lo que se guarda del texto. Se recorta a mano (y no solo con el CHECK)
 * porque el aviso viaja tal cual a la pantalla del alumno: los espacios de
 * los extremos y los renglones en blanco de mas solo hacen ruido.
 */
function cleanBody(raw) {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = {
  NOTICE_DAYS,
  NOTICE_MAX,
  DAILY_LIMIT,
  WINDOW,
  STUDENT_NOTICES,
  cleanBody,
};
