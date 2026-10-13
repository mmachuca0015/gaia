import { useEffect, useState } from "react";

import { ApiError, apiJson } from "../lib/api";

type Impact = {
  name: string;
  last_name: string;
  email: string;
  is_demo: boolean;
  bookings: number;
  purchases: number;
  favorites?: number;
  studios?: number;
  classes?: number;
  subscription_status?: string | null;
};

type Props = {
  role: "user" | "owner";
  id: number;
  onClose: () => void;
  onDeleted: () => void;
};

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/* Pop up de "Eliminar cuenta" de /admin/usuarios. Borra la cuenta y todo lo
   suyo de la base, sin vuelta atras. Antes enseña lo que se va a llevar
   (lo cuenta el backend) y pide escribir el correo, como candado contra un
   clic en la fila equivocada. */
function AdminDeleteAccountModal({ role, id, onClose, onDeleted }: Props) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadError, setLoadError] = useState("");
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<Impact>(`/admin/accounts/${role}/${id}/delete-impact`)
      .then(setImpact)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "No se pudo cargar la cuenta"),
      );
  }, [role, id]);

  const matches =
    !!impact && typed.trim().toLowerCase() === impact.email.trim().toLowerCase();

  const eliminar = async () => {
    if (!matches) return;
    setDeleting(true);
    setError("");
    try {
      await apiJson(`/admin/accounts/${role}/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm_email: typed.trim() }),
      });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la cuenta");
      setDeleting(false);
    }
  };

  const lines: string[] = [];
  if (impact) {
    if (role === "owner") {
      lines.push(plural(impact.studios ?? 0, "sucursal", "sucursales"));
      lines.push(plural(impact.classes ?? 0, "clase", "clases"));
      lines.push(
        `${plural(impact.bookings, "reservación", "reservaciones")} de sus alumnos`,
      );
      lines.push(`${plural(impact.purchases, "paquete vendido", "paquetes vendidos")}`);
      if (impact.subscription_status) {
        lines.push(`Su suscripción (${impact.subscription_status}) y sus cobros`);
      }
    } else {
      lines.push(plural(impact.bookings, "reservación", "reservaciones"));
      lines.push(plural(impact.purchases, "paquete comprado", "paquetes comprados"));
      lines.push(plural(impact.favorites ?? 0, "favorito", "favoritos"));
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-md p-6">
        <p className="font-semibold text-slate-800">¿Eliminar esta cuenta?</p>
        {impact && (
          <p className="text-xs text-slate-400 mt-0.5">
            {impact.name} {impact.last_name} · {role === "owner" ? "Dueño" : "Usuario"}
          </p>
        )}

        {loadError ? (
          <p className="text-sm text-red-600 mt-4">{loadError}</p>
        ) : !impact ? (
          <p className="text-sm text-slate-500 mt-4">Cargando...</p>
        ) : (
          <>
            <p className="text-sm text-slate-600 leading-relaxed mt-4">
              Se borra de la base de datos para siempre, junto con:
            </p>
            <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc pl-5">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {role === "owner" && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-4 leading-relaxed">
                Su suscripción en Stripe se cancela al momento, sin reembolso.
                Las reservaciones de sus alumnos se borran sin devolverles nada.
              </p>
            )}
            <p className="text-sm text-slate-500 mt-4">
              Los ingresos que registró dejan de contar en las métricas. No se
              puede deshacer.
            </p>

            <label className="block text-sm text-slate-600 mt-4">
              Escribe <span className="font-medium text-slate-800">{impact.email}</span>{" "}
              para confirmar
              <input
                type="email"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-2 w-full border border-line rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-ink"
              />
            </label>
          </>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:border-slate-400 transition-colors cursor-pointer disabled:cursor-wait"
          >
            Cancelar
          </button>
          <button
            onClick={eliminar}
            disabled={!matches || deleting}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? "Eliminando..." : "Eliminar cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminDeleteAccountModal;
