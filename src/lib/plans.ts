// Planes de suscripcion. Los definen la base de datos y el panel de admin, no
// el codigo: la landing, el paso de registro y el admin leen todos de aqui,
// asi que cambiar un precio en un solo lugar mueve las tres vistas.
import { apiJson } from "./api";

export interface PlanFeature {
  id: number;
  label: string;
}

export type BillingInterval = "month" | "year";

export interface Plan {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  /** En centavos, como lo guarda la base y como cobra Stripe. */
  price_cents: number;
  /** Total de un año con el descuento ya aplicado. Lo calcula el backend. */
  annual_price_cents: number;
  currency: string;
  /** Descuento del primer mes. Solo aplica al plan mensual. */
  intro_discount: number;
  /** Descuento por pagar el año completo. */
  annual_discount: number;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  features: PlanFeature[];
}

export function fetchPlans() {
  return apiJson<Plan[]>("/plans");
}

/** Centavos a pesos enteros. Los planes no manejan fracciones de peso. */
export function toPesos(cents: number) {
  return Math.round(cents / 100);
}

export function formatMoney(pesos: number) {
  return pesos.toLocaleString("es-MX");
}

/**
 * Precio mostrado por mes. En anual es el total del año repartido entre 12,
 * derivado del mismo `annual_price_cents` que se le cobra a Stripe: asi el
 * numero grande y el total de abajo nunca se contradicen.
 */
export function monthlyPrice(plan: Plan, annual: boolean) {
  return annual
    ? Math.round(toPesos(plan.annual_price_cents) / 12)
    : toPesos(plan.price_cents);
}

export function annualTotal(plan: Plan) {
  return toPesos(plan.annual_price_cents);
}

/** Lo que se cobra en el primer recibo del plan mensual. */
export function introPrice(plan: Plan) {
  const pesos = toPesos(plan.price_cents);
  return Math.round(pesos * (1 - plan.intro_discount / 100));
}

/**
 * Lo que se cobra hoy segun el intervalo elegido.
 *
 * El descuento de bienvenida y el anual no se acumulan: quien paga al año ya
 * recibio su descuento en el precio.
 */
export function firstChargePrice(plan: Plan, interval: BillingInterval) {
  return interval === "year" ? annualTotal(plan) : introPrice(plan);
}

/**
 * Lo que se cobra hoy cuando el dueño canjeo un cupon de cortesia.
 *
 * El cupon SUSTITUYE al descuento de bienvenida, no se suma: por eso la base
 * del mensual es el precio completo y no `introPrice`. Es la misma regla que
 * aplica el backend al armar el cobro, escrita aqui para que la pantalla no
 * prometa un numero distinto del que cobra Stripe.
 */
export function couponChargePrice(
  plan: Plan,
  interval: BillingInterval,
  percentOff: number,
) {
  const base =
    interval === "year" ? annualTotal(plan) : toPesos(plan.price_cents);
  return Math.round(base * (1 - percentOff / 100));
}
