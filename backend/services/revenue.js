// Movimientos de dinero de los estudios, para las metricas del admin y del
// dueño. Es una tabla derivada con una fila por cobro:
//
//   - reserva pagada con tarjeta: el precio de la clase;
//   - compra de paquete: el precio del paquete (sin el 3% del alumno).
//
// Una reserva hecha CON paquete no aparece: ese dinero ya se conto al comprar
// el paquete, y sumarla otra vez inflaria los ingresos.
//
// Columnas: created_at, amount (pesos), studio_id, is_demo.
const REVENUE_ROWS = `(
  SELECT bookings.created_at, classes.price::numeric AS amount,
         classes.studio_id, studios.is_demo
  FROM bookings
  JOIN schedules ON bookings.schedule_id = schedules.id
  JOIN classes   ON schedules.class_id = classes.id
  JOIN studios   ON studios.id = classes.studio_id
  WHERE bookings.status = 'activa' AND bookings.package_purchase_id IS NULL

  UNION ALL

  SELECT pp.created_at, pp.price_cents / 100.0 AS amount,
         pp.studio_id, studios.is_demo
  FROM package_purchases pp
  JOIN studios ON studios.id = pp.studio_id
  WHERE NOT pp.simulated
) AS money`;

module.exports = { REVENUE_ROWS };
