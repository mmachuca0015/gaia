// Cargo por servicio que paga el alumno encima del precio de la clase.
//
// El porcentaje vive en el backend (SERVICE_FEE_PERCENT en routes/payments.js).
// Aqui solo se lee, y se cachea a nivel de modulo para no pedirlo una vez por
// tarjeta de clase. Tenerlo escrito tambien aqui invitaria a que un dia el
// cobro y lo que dice la pantalla dejaran de coincidir.
import { apiJson } from "./api";

let promesa: Promise<number> | null = null;

export function fetchServiceFeePercent(): Promise<number> {
  if (!promesa) {
    promesa = apiJson<{ service_fee_percent: number }>("/payments/fees")
      .then((d) => d.service_fee_percent)
      .catch(() => {
        // Si falla, se reintenta en la siguiente llamada en vez de dejar
        // cacheado un error para toda la sesion.
        promesa = null;
        throw new Error("no se pudo leer el cargo por servicio");
      });
  }
  return promesa;
}

/** Misma formula que serviceFeeCents del backend: redondeo al centavo. */
export function serviceFeeCents(classCents: number, percent: number) {
  return Math.round((classCents * percent) / 100);
}
