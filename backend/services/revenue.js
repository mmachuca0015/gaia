// Movimientos de dinero de los estudios, para las metricas del admin y del
// dueño. Es una tabla derivada con una fila por cobro:
//
//   - reserva pagada con tarjeta: el precio de la clase;
//   - compra de paquete: el precio del paquete (sin el 3% del alumno).
//
// Una reserva hecha CON paquete no aparece: ese dinero ya se conto al comprar
// el paquete, y sumarla otra vez inflaria los ingresos.
//
// Cuentan las reservas 'activa' y 'pasada'. Antes solo contaban las activas,
// y como el cron pasa cada reserva a 'pasada' al terminar la clase, el
// ingreso desaparecia de las graficas en cuanto se daba la clase.
//
// Columnas: created_at, amount (pesos), studio_id, is_demo.
const REVENUE_ROWS = `(
  SELECT bookings.created_at, classes.price::numeric AS amount,
         classes.studio_id, studios.is_demo
  FROM bookings
  JOIN schedules ON bookings.schedule_id = schedules.id
  JOIN classes   ON schedules.class_id = classes.id
  JOIN studios   ON studios.id = classes.studio_id
  WHERE bookings.status IN ('activa', 'pasada')
    AND bookings.package_purchase_id IS NULL

  UNION ALL

  SELECT pp.created_at, pp.price_cents / 100.0 AS amount,
         pp.studio_id, studios.is_demo
  FROM package_purchases pp
  JOIN studios ON studios.id = pp.studio_id
  WHERE NOT pp.simulated
) AS money`;

// Hora local de Mexico (timestamp sin zona). La base de Render corre en UTC:
// con CURRENT_DATE, "hoy" empezaba a las 6 de la tarde del dia anterior.
const NOW_MX = `(NOW() AT TIME ZONE 'America/Mexico_City')`;

// Periodos del panel del dueño. Cada uno define desde cuando cuenta (hora
// local), de que tamaño es cada punto de la grafica y hasta donde llega.
// El total del periodo y la grafica usan el MISMO inicio, para que la suma
// de los puntos sea el total que se muestra arriba.
const PERIODS = {
  hoy: {
    unit: "hour",
    step: "1 hour",
    start: `date_trunc('day', ${NOW_MX})`,
    end: `date_trunc('hour', ${NOW_MX})`,
  },
  semana: {
    unit: "day",
    step: "1 day",
    start: `date_trunc('day', ${NOW_MX}) - INTERVAL '6 days'`,
    end: `date_trunc('day', ${NOW_MX})`,
  },
  mes: {
    unit: "day",
    step: "1 day",
    start: `date_trunc('day', ${NOW_MX}) - INTERVAL '29 days'`,
    end: `date_trunc('day', ${NOW_MX})`,
  },
  semestral: {
    unit: "month",
    step: "1 month",
    start: `date_trunc('month', ${NOW_MX}) - INTERVAL '5 months'`,
    end: `date_trunc('month', ${NOW_MX})`,
  },
};

function periodOf(name) {
  return PERIODS[name] || PERIODS.hoy;
}

// `created_at` (timestamptz) en hora local de Mexico.
function localTime(column) {
  return `(${column} AT TIME ZONE 'America/Mexico_City')`;
}

module.exports = { REVENUE_ROWS, NOW_MX, PERIODS, periodOf, localTime };
