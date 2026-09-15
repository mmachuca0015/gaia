// Cupones de cortesia.
//
// Las listas de duraciones y porcentajes estan tambien en el backend
// (routes/coupons.js). Aqui sirven para pintar los desplegables; alla para
// validar. Un <select> no protege nada: cualquiera puede mandar el POST a
// mano, asi que la copia del servidor es la que manda.
import { api, apiJson } from "./api";

export interface Coupon {
  id: number;
  code: string;
  percent_off: number;
  duration_months: number;
  redeemed_at: string | null;
  created_at: string;
  redeemed_by_studio: string | null;
}

// Lo que devuelve /coupons/validate cuando el codigo sirve.
export interface CouponCheck {
  code: string;
  percent_off: number;
  duration_months: number;
  duration_label: string;
}

export const DURACIONES = [1, 3, 6, 12, 24] as const;

// Del 10 al 100, de 10 en 10.
export const PORCENTAJES = Array.from({ length: 10 }, (_, i) => (i + 1) * 10);

export function etiquetaDuracion(meses: number): string {
  if (meses === 1) return "1 mes";
  if (meses < 12) return `${meses} meses`;
  if (meses === 12) return "1 año";
  return `${meses / 12} años`;
}

export function fetchCoupons(): Promise<Coupon[]> {
  return apiJson<Coupon[]>("/coupons");
}

export async function createCoupon(
  percentOff: number,
  durationMonths: number,
): Promise<Coupon> {
  const res = await api("/coupons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      percent_off: percentOff,
      duration_months: durationMonths,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "No pudimos crear el cupón");
  return data as Coupon;
}

// Devuelve el cupon si sirve, o lanza con el motivo exacto ("ya fue
// utilizado", "solo aplica al plan mensual"...). El motivo se le muestra tal
// cual al dueño: saber por que no sirve es la diferencia entre corregir el
// codigo y abandonar el registro.
//
// El codigo va en el cuerpo, no en la URL, para que no quede escrito en los
// logs del servidor ni del proxy.
export async function validateCoupon(
  code: string,
  billingInterval: "month" | "year",
): Promise<CouponCheck> {
  const res = await api("/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, billing_interval: billingInterval }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "No pudimos validar el cupón");
  return data as CouponCheck;
}
