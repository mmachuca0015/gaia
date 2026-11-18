// Cobros que pueden pedir 3D Secure: reservar una clase, comprar un paquete y
// la diferencia al canjear.
//
// El backend cobra la tarjeta guardada sin abrir nada. Si el banco del alumno
// pide confirmar, responde 402 con `requires_action` y el clientSecret de una
// autorizacion; aqui se abre la ventana del banco y, si el alumno confirma, se
// repite la MISMA peticion con `paymentIntentId`. El backend vuelve a validar
// todo y recien entonces guarda la reserva y captura el cobro
// (chargeSavedCard en backend/services/charges.js).
import { api, ApiError } from "./api";
import { stripePromise } from "./stripe";

interface AuthenticationNeeded {
  requires_action: true;
  clientSecret: string;
  paymentIntentId: string;
}

async function post(path: string, body: object) {
  const res = await api(path, { method: "POST", body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return { res, data };
}

/** POST que pasa por el banco si hace falta. Devuelve el JSON o lanza ApiError. */
export async function payJson<T>(path: string, body: object = {}): Promise<T> {
  let { res, data } = await post(path, body);

  if (res.status === 402 && (data as AuthenticationNeeded)?.requires_action) {
    const { clientSecret, paymentIntentId } = data as AuthenticationNeeded;
    const stripe = await stripePromise;
    if (!stripe) throw new ApiError("No pudimos abrir el pago con tu banco", 500);

    const { error } = await stripe.confirmCardPayment(clientSecret);
    if (error) {
      throw new ApiError(
        error.message || "Tu banco no confirmó el pago. Prueba con otra tarjeta.",
        402,
      );
    }
    ({ res, data } = await post(path, { ...body, paymentIntentId }));
  }

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string } | null)?.error || "Error del servidor",
      res.status,
    );
  }
  return data as T;
}
