// Suscripcion del dueño de la sesion: estado, cancelacion y cambio de plan.
// Todo lo que decide que se cobra lo resuelve el backend; aqui solo se pide.
import { apiJson } from "./api";
import { toPesos, type BillingInterval } from "./plans";

export type SubscriptionStatus =
  | "pendiente"
  | "activa"
  | "vencida"
  | "cancelada"
  | "heredada"
  /** Estudio de demostracion: no paga ni ve avisos de pago. */
  | "demo";

export interface PlanPrice {
  price_cents: number;
  annual_price_cents: number;
}

export interface PendingPlan extends PlanPrice {
  id: number;
  name: string;
}

export interface OwnerSubscription extends Partial<PlanPrice> {
  status: SubscriptionStatus;
  plan_id?: number;
  plan_name?: string;
  plan_slug?: string;
  currency?: string;
  billing_interval?: BillingInterval;
  started_at?: string;
  /** Ya pago alguna vez: al volver no recibe descuento de bienvenida. */
  has_paid_before?: boolean;
  /**
   * Ultimo dia cubierto por un cobro exitoso. Con el pago pendiente o
   * rechazado, el estudio sigue publicado solo hasta este dia.
   */
  paid_until?: string | null;
  /** Fin del periodo pagado: dia del siguiente cobro, o ultimo dia de uso. */
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  /** Plan que entra en la siguiente renovacion. */
  pending_plan?: PendingPlan | null;
}

export function fetchOwnerSubscription() {
  return apiJson<OwnerSubscription>("/subscriptions/me");
}

export function cancelSubscription() {
  return apiJson("/subscriptions/cancel", { method: "POST" });
}

export function resumeSubscription() {
  return apiJson("/subscriptions/resume", { method: "POST" });
}

export function changePlan(planId: number) {
  return apiJson("/subscriptions/change-plan", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId }),
  });
}

/** Guarda plan e intervalo de un estudio cuya suscripcion ya termino. */
export function selectPlan(planId: number, interval: BillingInterval) {
  return apiJson("/subscriptions/select-plan", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId, billing_interval: interval }),
  });
}

/** ¿Sigue publicado un estudio con el pago pendiente o rechazado? */
export function stillPublished(sub: OwnerSubscription) {
  return Boolean(sub.paid_until && new Date(sub.paid_until) > new Date());
}

/** Fecha del siguiente cobro si se paga hoy. */
export function nextChargeDate(interval: BillingInterval, from = new Date()) {
  const next = new Date(from);
  if (interval === "year") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

/** Lo que se cobra en cada renovacion, en pesos, segun el intervalo. */
export function renewalPrice(plan: PlanPrice, interval: BillingInterval) {
  return toPesos(interval === "year" ? plan.annual_price_cents : plan.price_cents);
}

/** "16 de octubre de 2026" */
export function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
