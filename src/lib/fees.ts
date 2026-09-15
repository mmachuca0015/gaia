// Cuota fija por transaccion.
//
// El numero vive en el backend (TRANSACTION_FEE_CENTS en routes/payments.js).
// Aqui solo se lee, y se cachea a nivel de modulo para no pedirlo una vez por
// tarjeta de clase. Tenerlo escrito tambien aqui invitaria a que un dia el
// cobro y lo que dice la pantalla dejaran de coincidir.
import { apiJson } from "./api";

let promesa: Promise<number> | null = null;

export function fetchTransactionFee(): Promise<number> {
  if (!promesa) {
    promesa = apiJson<{ transaction_fee_cents: number }>("/payments/fees")
      .then((d) => d.transaction_fee_cents)
      .catch(() => {
        // Si falla, se reintenta en la siguiente llamada en vez de dejar
        // cacheado un error para toda la sesion.
        promesa = null;
        throw new Error("no se pudo leer la cuota");
      });
  }
  return promesa;
}
