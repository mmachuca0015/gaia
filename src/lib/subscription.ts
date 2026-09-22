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
  /**
   * Si su plan incluye mandar avisos a los alumnos. Lo resuelve el backend con
   * la misma regla que aplican las rutas de avisos, asi que el menu no puede
   * ofrecer una pestaña que la API va a rechazar. Heredados y demo lo traen
   * igual que cualquier otro.
   */
  notices?: boolean;
}

export function fetchOwnerSubscription() {
  return apiJson<OwnerSubscription>("/subscriptions/me");
}

/**
 * Lo que se lleva por delante un cambio de plan: las sucursales que dejarian
 * de publicarse y cuanta gente cuelga de cada una. Sin `planId` es el impacto
 * de CANCELAR, donde no sobrevive ninguna.
 *
 * Los numeros los cuenta el backend. La pantalla no los estima: decirle a un
 * dueño "12 reservaciones" y que sean otras es peor que no decirle nada.
 */
export interface BranchImpact {
  id: number;
  name: string;
  branch_name: string | null;
  /** Reservaciones activas con fecha de hoy en adelante. */
  bookings: number;
  /**
   * Las de arriba que se pagaron con tarjeta. Si la sucursal cierra pero al
   * dueño le queda otra, esas se le abonan gratis al alumno alli. Las que
   * salieron de un paquete no cuentan: se le regresa la clase al paquete.
   */
  credit_classes: number;
  /** Clases de paquete compradas, sin canjear y todavia vigentes. */
  package_classes: number;
}

export function fetchPlanImpact(planId?: number) {
  const query = planId == null ? "" : `?plan_id=${planId}`;
  return apiJson<{ branches: BranchImpact[]; max_studios: number }>(
    `/subscriptions/impact${query}`,
  );
}

/**
 * Deja de renovar al terminar el periodo pagado.
 *
 * `confirmRefunds` es obligatorio cuando quedan alumnos con clases pagadas:
 * al cancelar no sobrevive ninguna sucursal, asi que hay que devolverles su
 * dinero y lo paga el estudio. El backend lo exige (409).
 */
export function cancelSubscription(confirmRefunds?: boolean) {
  return apiJson("/subscriptions/cancel", {
    method: "POST",
    body: JSON.stringify({ confirm_refunds: confirmRefunds }),
  });
}

export function resumeSubscription() {
  return apiJson("/subscriptions/resume", { method: "POST" });
}

/**
 * Programa el cambio de plan para la siguiente renovacion.
 *
 * `reason` es la encuesta de salida: solo se manda al bajar de plan y es
 * opcional. `confirmBranches` es lo contrario: cuando el plan nuevo incluye
 * menos sucursales, el backend rechaza el cambio (409) hasta que venga en
 * true, asi que no es un adorno de la pantalla.
 */
export function changePlan(
  planId: number,
  opts: {
    reason?: string | undefined;
    confirmBranches?: boolean | undefined;
  } = {},
) {
  return apiJson("/subscriptions/change-plan", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      reason: opts.reason,
      confirm_branches: opts.confirmBranches,
    }),
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
  return toPesos(
    interval === "year" ? plan.annual_price_cents : plan.price_cents,
  );
}

/** "16 de octubre de 2026" */
export function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
