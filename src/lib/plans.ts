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
  /**
   * Sucursales incluidas. Es el mismo numero que aplica el backend para
   * publicar y para dejar crear, no una promesa escrita aparte.
   */
  max_studios: number;
  /**
   * Si el plan incluye mandar avisos a los alumnos que tienen el estudio en
   * favoritos. Es el mismo permiso que aplica el backend, no una promesa
   * escrita aparte.
   */
  notices: boolean;
  features: PlanFeature[];
}

/**
 * La linea de sucursales que se muestra junto a las caracteristicas.
 *
 * Se arma con `max_studios` en vez de guardarse como una fila de
 * `plan_features`: el texto escrito a mano se quedaba viejo en cuanto el admin
 * movia el limite, y la landing prometia sucursales que el panel no daba.
 */
export function branchesFeature(plan: Plan) {
  return plan.max_studios === 1
    ? "1 sucursal"
    : `Hasta ${plan.max_studios} sucursales`;
}

/**
 * La linea de avisos, cuando el plan los incluye. Se arma con `plan.notices`
 * por lo mismo que la de sucursales: la fila escrita a mano en
 * `plan_features` seguia prometiendolos aunque el admin apagara la funcion.
 * Devuelve null cuando el plan no los trae, para no listar lo que no hay.
 */
export function noticesFeature(plan: Plan) {
  return plan.notices ? "Avisos a tus alumnos" : null;
}

/**
 * Las lineas que se enseñan de un plan, en orden: lo que sale de sus columnas
 * (sucursales y avisos) y luego lo que el admin escribio en `plan_features`.
 *
 * Vive aqui y no en cada pantalla porque son cuatro las que la pintan (la
 * landing, el registro, el cambio de plan del dueño y el admin) y antes cada
 * una armaba la lista por su cuenta: agregar una caracteristica obligaba a
 * acordarse de las cuatro.
 */
export function planFeatureLines(plan: Plan) {
  const avisos = noticesFeature(plan);
  return [
    { id: "sucursales", label: branchesFeature(plan) },
    ...(avisos ? [{ id: "avisos", label: avisos }] : []),
    ...plan.features.map((f) => ({ id: String(f.id), label: f.label })),
  ];
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
