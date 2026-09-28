// Lo que cobra Wellco: el cargo por servicio que paga el alumno encima del
// precio de la clase y la comision que se le descuenta al estudio.
//
// Los porcentajes viven en la base (tabla fee_settings) y los edita el admin
// en /admin/suscripciones. Aqui solo se leen de GET /payments/fees, y se
// cachean a nivel de modulo para no pedirlos una vez por tarjeta de clase.
// Tenerlos escritos tambien aqui invitaria a que un dia el cobro y lo que dice
// la pantalla dejaran de coincidir.
import { apiJson } from "./api";

export type Fees = {
  service_fee_percent: number;
  commission_percent: number;
};

let promesa: Promise<Fees> | null = null;

export function fetchFees(): Promise<Fees> {
  if (!promesa) {
    promesa = apiJson<Fees>("/payments/fees").catch(() => {
      // Si falla, se reintenta en la siguiente llamada en vez de dejar
      // cacheado un error para toda la sesion.
      promesa = null;
      throw new Error("no se pudieron leer las comisiones");
    });
  }
  return promesa;
}

/** Tras un cambio del admin, para que esta pestaña no siga con los viejos. */
export function forgetFees() {
  promesa = null;
}

export function fetchServiceFeePercent(): Promise<number> {
  return fetchFees().then((f) => f.service_fee_percent);
}

/** "1.5", "3", "1.25": sin ceros de sobra. */
export function formatPercent(percent: number) {
  return percent.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

/** Misma formula que serviceFeeCents del backend: redondeo al centavo. */
export function serviceFeeCents(classCents: number, percent: number) {
  return Math.round((classCents * percent) / 100);
}
