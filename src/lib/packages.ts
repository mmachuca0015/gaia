// Paquetes de clases: tipos y textos compartidos por el panel del dueño, el
// tab de paquetes del alumno y la reserva de una clase.
import { apiJson } from "./api";

export type ValidityUnit = "day" | "month";

export interface PackageClass {
  id: number;
  name: string;
  instructor: string | null;
}

/** Paquete tal como lo define el estudio. */
export interface StudioPackage {
  id: number;
  name: string;
  class_count: number;
  price_cents: number;
  /** Precio con descuento. Si existe, es lo que se cobra. */
  sale_price_cents: number | null;
  /** Se canjea en cualquier clase del estudio; si no, solo en `classes`. */
  any_class: boolean;
  /** Solo en horarios permanentes; si no, tambien en clases unicas. */
  permanent_only: boolean;
  is_active: boolean;
  /** Ventana de venta (YYYY-MM-DD). Las dos nulas = indefinido. */
  sale_starts_on: string | null;
  sale_ends_on: string | null;
  /** Cuanto dura despues de comprarlo. */
  validity_value: number;
  validity_unit: ValidityUnit;
  classes: PackageClass[];
}

/** Paquete a la venta en la pagina de un estudio. */
export interface CatalogPackage extends StudioPackage {
  studio_id: number;
  studio_name: string;
}

/**
 * Paquete que compro el alumno. Son las condiciones COPIADAS al pagar: si el
 * estudio edita el paquete despues, esto no cambia.
 */
export interface PurchasedPackage {
  id: number;
  name: string;
  classes_total: number;
  classes_used: number;
  remaining: number;
  any_class: boolean;
  permanent_only: boolean;
  /** Precio pagado por el paquete, sin el 3% (el de descuento si hubo). */
  price_cents: number;
  /** Precio normal al momento de comprar. */
  list_price_cents: number | null;
  validity_value: number | null;
  validity_unit: ValidityUnit | null;
  /** Total cobrado, con el 3%. */
  amount_cents: number;
  expires_at: string;
  created_at: string;
  expired: boolean;
  studio_id: number;
  studio_name: string;
  classes: PackageClass[];
}

/** Compra con la que se puede reservar una clase concreta. */
export interface UsablePurchase {
  id: number;
  name: string;
  remaining: number;
  expires_at: string;
}

/** Duraciones que ofrece el formulario. El backend acepta exactamente estas. */
export const VALIDITY_OPTIONS: { value: number; unit: ValidityUnit }[] = [
  { value: 7, unit: "day" },
  { value: 15, unit: "day" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    unit: "month" as const,
  })),
];

export function validityLabel(value: number, unit: ValidityUnit) {
  if (unit === "day") return value === 7 ? "1 semana" : `${value} días`;
  return value === 1 ? "1 mes" : `${value} meses`;
}

/** Precio que se cobra: el de descuento si lo hay. */
export function chargeCents(p: StudioPackage) {
  return p.sale_price_cents ?? p.price_cents;
}

export function classLabel(c: PackageClass) {
  return c.instructor ? `${c.name} con ${c.instructor}` : c.name;
}

export function classesText(anyClass: boolean, classes: PackageClass[]) {
  if (anyClass) return "Cualquier clase del estudio";
  if (classes.length === 0) return "Ninguna: las clases elegidas ya no existen";
  return classes.map(classLabel).join(", ");
}

export function kindText(permanentOnly: boolean) {
  return permanentOnly
    ? "Solo clases permanentes"
    : "Clases permanentes y únicas";
}

export function money(cents: number) {
  return (cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "2026-09-30" -> "30 sep 2026", sin que la zona horaria le reste un dia. */
export function formatDay(iso: string) {
  const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function fetchStudioPackages(studioId: number | string) {
  return apiJson<CatalogPackage[]>(`/packages?studio_id=${studioId}`);
}

export function fetchMyPackages() {
  return apiJson<PurchasedPackage[]>("/packages/mine");
}

export function purchasePackage(packageId: number) {
  return apiJson<{ success: boolean; expiresAt: string; simulated: boolean }>(
    `/packages/${packageId}/purchase`,
    { method: "POST" },
  );
}

export function fetchUsablePurchases(scheduleId: number, classDate: string) {
  return apiJson<UsablePurchase[]>(
    `/packages/usable?schedule_id=${scheduleId}&class_date=${classDate}`,
  );
}

export function redeemPackage(
  purchaseId: number,
  scheduleId: number,
  classDate: string,
) {
  return apiJson<{ success: boolean; remaining: number }>("/packages/redeem", {
    method: "POST",
    body: JSON.stringify({ purchaseId, scheduleId, classDate }),
  });
}
