import { useCallback, useEffect, useState } from "react";
import { Package, Pencil, Plus } from "lucide-react";

import { ApiError, apiJson, getCachedUser } from "../../lib/api";
import {
  VALIDITY_OPTIONS,
  classesText,
  formatDay,
  kindText,
  money,
  validityLabel,
  type PackageClass,
  type StudioPackage,
  type ValidityUnit,
} from "../../lib/packages";

type PackageStatus = "a_la_venta" | "terminado" | "programado" | "desactivado";

// GET /studios/:id/packages
type OwnerPackage = StudioPackage & {
  status: PackageStatus;
  /** Cuantas veces se ha comprado. */
  purchases: number;
};

type FormState = {
  name: string;
  class_count: string;
  price: string;
  sale_price: string;
  any_class: boolean;
  class_ids: number[];
  permanent_only: boolean;
  /** Se vende sin fechas, hasta que el dueño lo desactive. */
  indefinite: boolean;
  sale_starts_on: string;
  sale_ends_on: string;
  is_active: boolean;
  /** "7-day", "3-month"... */
  validity: string;
};

const emptyForm: FormState = {
  name: "",
  class_count: "",
  price: "",
  sale_price: "",
  any_class: true,
  class_ids: [],
  permanent_only: false,
  indefinite: true,
  sale_starts_on: "",
  sale_ends_on: "",
  is_active: true,
  validity: "",
};

function formFrom(p: OwnerPackage): FormState {
  return {
    name: p.name,
    class_count: String(p.class_count),
    price: String(p.price_cents / 100),
    sale_price:
      p.sale_price_cents != null ? String(p.sale_price_cents / 100) : "",
    any_class: p.any_class,
    class_ids: p.classes.map((c) => c.id),
    permanent_only: p.permanent_only,
    indefinite: !p.sale_starts_on && !p.sale_ends_on,
    sale_starts_on: p.sale_starts_on ?? "",
    sale_ends_on: p.sale_ends_on ?? "",
    is_active: p.is_active,
    validity: `${p.validity_value}-${p.validity_unit}`,
  };
}

const STATUS_LABEL: Record<PackageStatus, string> = {
  a_la_venta: "A la venta",
  terminado: "Terminado",
  programado: "Programado",
  desactivado: "Desactivado",
};

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-line bg-surface text-sm outline-none focus:border-slate-400 transition-colors";

function saleWindowText(p: StudioPackage) {
  if (!p.sale_starts_on || !p.sale_ends_on) return "Indefinido";
  return `${formatDay(p.sale_starts_on)} – ${formatDay(p.sale_ends_on)}`;
}

function OwnerPaquetes() {
  const ownerId = getCachedUser()?.id;
  const [studioId, setStudioId] = useState<number | null>(null);
  const [packages, setPackages] = useState<OwnerPackage[]>([]);
  const [classes, setClasses] = useState<PackageClass[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    apiJson<{ id: number }>(`/studios/owner/${ownerId}`).then((s) =>
      setStudioId(s.id),
    );
  }, [ownerId]);

  const load = useCallback(() => {
    if (!studioId) return;
    apiJson<{ packages: OwnerPackage[]; classes: PackageClass[] }>(
      `/studios/${studioId}/packages`,
    ).then((data) => {
      setPackages(data.packages);
      setClasses(data.classes);
      setLoaded(true);
    });
  }, [studioId]);

  useEffect(load, [load]);

  // --- Pop up: crear o editar. `editing` null = paquete nuevo.
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OwnerPackage | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setConfirmDelete(false);
    setShowForm(true);
  };

  const openEdit = (p: OwnerPackage) => {
    setEditing(p);
    setForm(formFrom(p));
    setFormError("");
    setConfirmDelete(false);
    setShowForm(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleClass = (id: number) =>
    setForm((f) => ({
      ...f,
      class_ids: f.class_ids.includes(id)
        ? f.class_ids.filter((x) => x !== id)
        : [...f.class_ids, id],
    }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.class_count || !form.price) {
      setFormError("Llena nombre, número de clases y precio");
      return;
    }
    if (form.sale_price && Number(form.sale_price) >= Number(form.price)) {
      setFormError("El precio con descuento debe ser menor al precio");
      return;
    }
    if (!form.any_class && form.class_ids.length === 0) {
      setFormError("Elige al menos una clase o marca «Cualquier clase»");
      return;
    }
    if (!form.indefinite && (!form.sale_starts_on || !form.sale_ends_on)) {
      setFormError("Elige inicio y fin del paquete, o márcalo como indefinido");
      return;
    }
    if (!form.indefinite && form.sale_ends_on < form.sale_starts_on) {
      setFormError("El fin del paquete no puede ser antes del inicio");
      return;
    }
    if (!form.validity) {
      setFormError("Elige la duración del paquete");
      return;
    }

    const [validityValue, validityUnit] = form.validity.split("-");
    setSaving(true);
    setFormError("");
    try {
      await apiJson(
        editing
          ? `/studios/${studioId}/packages/${editing.id}`
          : `/studios/${studioId}/packages`,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            class_count: Number(form.class_count),
            price: Number(form.price),
            sale_price: form.sale_price ? Number(form.sale_price) : null,
            any_class: form.any_class,
            class_ids: form.any_class ? [] : form.class_ids,
            permanent_only: form.permanent_only,
            indefinite: form.indefinite,
            sale_starts_on: form.indefinite ? null : form.sale_starts_on,
            sale_ends_on: form.indefinite ? null : form.sale_ends_on,
            is_active: form.indefinite ? form.is_active : true,
            validity_value: Number(validityValue),
            validity_unit: validityUnit as ValidityUnit,
          }),
        },
      );
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "No pudimos guardar el paquete",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiJson(`/studios/${studioId}/packages/${editing.id}`, {
        method: "DELETE",
      });
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "No pudimos borrar el paquete",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!studioId) return null;

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis <span className="text-ink">Paquetes</span>
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-ink text-white px-5 py-2.5 rounded-xl font-medium hover:bg-ink-soft transition-colors cursor-pointer"
        >
          <Plus size={20} />
          Agregar paquete
        </button>
      </div>

      {loaded && packages.length === 0 && (
        <div className="bg-white border border-dashed border-line rounded-2xl p-10 text-center">
          <Package size={28} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-800 font-medium mb-1">
            Aún no tienes paquetes
          </p>
          <p className="text-sm text-slate-500">
            Crea uno para vender varias clases en un solo pago.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((p) => {
          const selling = p.status === "a_la_venta";
          const price = p.sale_price_cents ?? p.price_cents;
          return (
            <div
              key={p.id}
              className={`bg-white border border-line rounded-2xl p-6 flex flex-col gap-4 transition-opacity ${
                selling ? "" : "opacity-55"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-block text-[11px] px-2 py-0.5 rounded-full mb-2 ${
                      selling
                        ? "bg-ink/8 text-ink"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                  <p className="font-semibold text-slate-800 text-lg">
                    {p.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {p.class_count} {p.class_count === 1 ? "clase" : "clases"} ·
                    dura {validityLabel(p.validity_value, p.validity_unit)}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(p)}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-ink border border-line rounded-lg px-3 py-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Pencil size={14} />
                  Editar
                </button>
              </div>

              <div>
                <p
                  className="text-3xl font-semibold text-ink"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  ${money(price)}{" "}
                  <span className="text-xs text-slate-400 font-sans">MXN</span>
                  {p.sale_price_cents != null && (
                    <span className="text-base text-slate-400 line-through font-sans ml-2">
                      ${money(p.price_cents)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  ${money(Math.round(price / p.class_count))} por clase
                </p>
              </div>

              <dl className="text-sm flex flex-col gap-2 pt-4 border-t border-line">
                <div>
                  <dt className="text-slate-400 text-xs mb-0.5">Venta</dt>
                  <dd className="text-slate-800">{saleWindowText(p)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs mb-0.5">Clases</dt>
                  <dd className="text-slate-800">
                    {classesText(p.any_class, p.classes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs mb-0.5">
                    Tipo de clase
                  </dt>
                  <dd className="text-slate-800">
                    {kindText(p.permanent_only)}
                  </dd>
                </div>
                {p.purchases > 0 && (
                  <div>
                    <dt className="text-slate-400 text-xs mb-0.5">Vendidos</dt>
                    <dd className="text-slate-800">{p.purchases}</dd>
                  </div>
                )}
              </dl>
            </div>
          );
        })}
      </div>

      {/* Pop up: crear o editar paquete */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col gap-5">
            <p className="font-semibold text-slate-800 text-lg text-center">
              {editing ? "Editar paquete" : "Agregar paquete"}
            </p>

            {editing && editing.purchases > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
                Ya se vendió {editing.purchases}{" "}
                {editing.purchases === 1 ? "vez" : "veces"}. Los cambios solo
                aplican a compras nuevas: quien ya lo compró lo sigue usando con
                las condiciones que pagó.
              </p>
            )}

            <div>
              <label className="text-sm text-slate-600 block mb-1.5">
                Nombre
              </label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Paquete 10 clases"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1.5">
                Número de clases
              </label>
              <input
                value={form.class_count}
                onChange={(e) => set("class_count", e.target.value)}
                type="number"
                min={1}
                step={1}
                placeholder="10"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600 block mb-1.5">
                  Precio (MXN)
                </label>
                <input
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  type="number"
                  min={1}
                  placeholder="1200"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 block mb-1.5">
                  Precio con descuento
                </label>
                <input
                  value={form.sale_price}
                  onChange={(e) => set("sale_price", e.target.value)}
                  type="number"
                  min={1}
                  placeholder="Opcional"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Cuanto dura despues de comprarlo */}
            <div>
              <label className="text-sm text-slate-600 block mb-1.5">
                Duración del paquete
              </label>
              <select
                value={form.validity}
                onChange={(e) => set("validity", e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="" disabled>
                  Elige cuánto dura
                </option>
                {VALIDITY_OPTIONS.map((o) => (
                  <option
                    key={`${o.value}-${o.unit}`}
                    value={`${o.value}-${o.unit}`}
                  >
                    {validityLabel(o.value, o.unit)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5">
                Tiempo que tiene el alumno para usar sus clases desde que lo
                compra.
              </p>
            </div>

            {/* Cuando se vende */}
            <fieldset>
              <legend className="text-sm text-slate-600 mb-1.5">
                Periodo de venta
              </legend>
              <div className="border border-line rounded-xl divide-y divide-line">
                <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sale_window"
                    checked={!form.indefinite}
                    onChange={() => set("indefinite", false)}
                    className="accent-ink w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">Con fechas</span>
                </label>
                {!form.indefinite && (
                  <div className="grid grid-cols-2 gap-3 px-4 py-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Inicio del paquete
                      </label>
                      <input
                        type="date"
                        value={form.sale_starts_on}
                        onChange={(e) => set("sale_starts_on", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Fin del paquete
                      </label>
                      <input
                        type="date"
                        value={form.sale_ends_on}
                        min={form.sale_starts_on || undefined}
                        onChange={(e) => set("sale_ends_on", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sale_window"
                    checked={form.indefinite}
                    onChange={() => set("indefinite", true)}
                    className="accent-ink w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">Indefinido</span>
                </label>
                {/* Pausar la venta solo tiene sentido en un paquete que ya
                    existe: uno nuevo nace a la venta. */}
                {form.indefinite && editing && (
                  <label className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer">
                    <span className="text-sm text-slate-700">
                      Desactivar paquete
                      <span className="block text-xs text-slate-400 mt-0.5">
                        Mientras esta casilla esté marcada, el paquete no
                        aparece en tu estudio y nadie lo puede comprar.
                        Desmárcala para volver a venderlo. Quien ya lo compró
                        puede seguir reservando con él.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={!form.is_active}
                      onChange={(e) => set("is_active", !e.target.checked)}
                      className="accent-ink w-4 h-4 shrink-0"
                    />
                  </label>
                )}
              </div>
            </fieldset>

            {/* Clases donde se puede canjear */}
            <fieldset>
              <legend className="text-sm text-slate-600 mb-1.5">
                Clases en las que se puede usar
              </legend>
              <div className="border border-line rounded-xl divide-y divide-line">
                <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.any_class}
                    onChange={(e) => set("any_class", e.target.checked)}
                    className="accent-ink w-4 h-4"
                  />
                  <span className="text-sm text-slate-800 font-medium">
                    Cualquier clase
                  </span>
                </label>
                {classes.length === 0 ? (
                  <p className="px-4 py-2.5 text-sm text-slate-400">
                    Todavía no tienes clases creadas.
                  </p>
                ) : (
                  classes.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${
                        form.any_class
                          ? "opacity-40 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={form.any_class}
                        checked={
                          form.any_class || form.class_ids.includes(c.id)
                        }
                        onChange={() => toggleClass(c.id)}
                        className="accent-ink w-4 h-4"
                      />
                      <span className="text-sm text-slate-700">
                        {c.instructor
                          ? `${c.name} con ${c.instructor}`
                          : c.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            {/* Permanentes y unicas, o solo permanentes */}
            <fieldset>
              <legend className="text-sm text-slate-600 mb-1.5">
                Tipo de clase que aplica
              </legend>
              <div className="border border-line rounded-xl divide-y divide-line">
                {[
                  { value: false, label: "Permanentes y únicas" },
                  { value: true, label: "Solo permanentes" },
                ].map((opt) => (
                  <label
                    key={opt.label}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="permanent_only"
                      checked={form.permanent_only === opt.value}
                      onChange={() => set("permanent_only", opt.value)}
                      className="accent-ink w-4 h-4"
                    />
                    <span className="text-sm text-slate-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {formError && (
              <p className="text-sm text-red-500 text-center">{formError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-line text-slate-600 py-2.5 rounded-xl text-sm hover:bg-surface transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-ink text-white py-2.5 rounded-xl text-sm hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving
                  ? "Guardando..."
                  : editing
                    ? "Guardar cambios"
                    : "Crear paquete"}
              </button>
            </div>

            {editing &&
              (confirmDelete ? (
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-center flex flex-col gap-3">
                  <p className="text-sm text-slate-700">
                    ¿Borrar «{editing.name}»? Deja de venderse.
                    {editing.purchases > 0 &&
                      " Quien ya lo compró lo sigue usando."}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 border border-line bg-white text-slate-600 py-2 rounded-xl text-sm cursor-pointer"
                    >
                      No
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="flex-1 bg-red-400 text-white py-2 rounded-xl text-sm hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Sí, borrar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm text-red-500 hover:text-red-600 cursor-pointer"
                >
                  Borrar paquete
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default OwnerPaquetes;
