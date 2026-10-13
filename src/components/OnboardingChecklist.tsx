import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronRight, Circle, Store, X } from "lucide-react";

import { getCachedUser } from "../lib/api";
import { fetchBranches, type Branch } from "../lib/branches";
import {
  fetchOwnerSubscription,
  stillPublished,
  type OwnerSubscription,
} from "../lib/subscription";

const GENERAL = "/owner/estudio/general";

type Item = { label: string; detail: string; done: boolean; path: string };

/* Lo que le falta al estudio para publicarse en el marketplace.

   El registro solo pide lo basico; lo demas se llena en el panel. La primera
   vez que el dueño entra, esto sale como pop up. Despues se queda como una
   franja que lo vuelve a abrir, hasta que no falte nada.

   No decide nada: las palomitas salen de `missing` (que el backend calcula
   con el mismo SQL que publica, STUDIO_COMPLETE) y del estado de la
   suscripcion. */
function buildItems(branch: Branch, sub: OwnerSubscription | null): Item[] {
  const falta = (...campos: string[]) =>
    campos.filter((c) => branch.missing.includes(c));

  const datos = falta(
    "Nombre",
    "Descripción",
    "Teléfono",
    "Imagen de perfil",
    "Imagen de portada",
  );
  const direccion = falta("Dirección", "Ubicación en el mapa");

  const planDone =
    !sub ||
    sub.status === "activa" ||
    sub.status === "heredada" ||
    sub.status === "demo" ||
    stillPublished(sub);

  return [
    {
      label: "Datos del estudio",
      detail: datos.length
        ? `Falta: ${datos.join(", ").toLowerCase()}`
        : "Nombre, descripción, teléfono e imágenes",
      done: datos.length === 0,
      path: GENERAL,
    },
    {
      label: "Dirección",
      detail: direccion.length
        ? `Falta: ${direccion.join(", ").toLowerCase()}`
        : "Dirección y ubicación en el mapa",
      done: direccion.length === 0,
      path: GENERAL,
    },
    {
      label: "Horario",
      detail: "Los días y horas en que abres",
      done: !branch.missing.includes("Horario"),
      path: GENERAL,
    },
    {
      label: "Cuenta de Stripe",
      detail: "Para recibir el pago de tus clases",
      done: !branch.missing.includes("Cuenta de Stripe"),
      path: "/owner/estudio/pagos",
    },
    {
      label: "Plan de suscripción",
      detail:
        sub?.status === "sin_plan" || sub?.status === "cancelada"
          ? "Escoge tu plan y págalo"
          : sub?.status === "pendiente" || sub?.status === "vencida"
            ? "Completa el pago de tu plan"
            : "Plan pagado",
      done: planDone,
      path: "/owner/estudio/suscripcion",
    },
  ];
}

// El pop up sale solo la primera vez. Recordarlo es una comodidad de este
// navegador: si se pierde, lo peor es que vuelva a salir una vez.
const seenKey = (ownerId: number) => `wellco:pendientes-vistos:${ownerId}`;

function wasSeen(ownerId: number) {
  try {
    return localStorage.getItem(seenKey(ownerId)) === "1";
  } catch {
    return false;
  }
}

function markSeen(ownerId: number) {
  try {
    localStorage.setItem(seenKey(ownerId), "1");
  } catch {
    // Sin almacenamiento el pop up vuelve a salir la proxima vez. No pasa nada.
  }
}

function OnboardingChecklist() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const ownerId = getCachedUser()?.id ?? 0;

  // Se relee al cambiar de pantalla: lo que el dueño acaba de llenar se
  // palomea sin recargar.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchBranches(),
      fetchOwnerSubscription().catch(() => null),
    ])
      .then(([{ branches }, sub]) => {
        if (cancelled) return;
        // La primera sucursal es la que nacio con la cuenta. Un estudio demo
        // no se publica para nadie, asi que no tiene nada que completar.
        const main = branches[0];
        if (!main || sub?.status === "demo") {
          setItems([]);
          return;
        }
        const next = buildItems(main, sub);
        setItems(next);
        if (next.some((i) => !i.done) && !wasSeen(ownerId)) {
          markSeen(ownerId);
          setOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, ownerId]);

  if (!items) return null;
  const pending = items.filter((i) => !i.done).length;
  if (pending === 0) return null;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-6 rounded-2xl bg-white border border-line px-5 py-4 flex items-center gap-4 text-left hover:bg-surface transition-colors cursor-pointer"
      >
        <Store size={20} className="text-ink shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-slate-800">
            Tu estudio todavía no se publica
          </p>
          <p className="text-sm text-slate-500">
            {pending === 1
              ? "Te falta 1 paso para aparecer en el marketplace"
              : `Te faltan ${pending} pasos para aparecer en el marketplace`}
          </p>
        </div>
        <ChevronRight size={18} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800 text-lg">
                  Completa tu estudio
                </p>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Para que tu estudio se publique en el marketplace y tus
                  alumnos puedan reservar, completa toda tu información.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <ul className="mt-5 flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.label}>
                  <button
                    onClick={() => go(item.path)}
                    className="w-full flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-surface transition-colors cursor-pointer"
                  >
                    {item.done ? (
                      <span className="w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center shrink-0">
                        <Check size={14} />
                      </span>
                    ) : (
                      <Circle size={24} className="text-slate-300 shrink-0" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-sm font-medium ${
                          item.done ? "text-slate-400" : "text-slate-800"
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="block text-xs text-slate-400 truncate">
                        {item.detail}
                      </span>
                    </span>
                    {!item.done && (
                      <ChevronRight size={16} className="text-slate-400 shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-5 bg-ink text-white py-2.5 rounded-xl text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default OnboardingChecklist;
