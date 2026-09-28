import { useState } from "react";

import { apiJson } from "../lib/api";

/* Lo que se le enseña al admin antes de mover el interruptor. Es opcional:
   sin esto el cambio se guarda al primer clic, como antes. */
export type DemoConfirm = {
  /** De quien es la cuenta, para el titulo del pop up. */
  name: string;
  /** Que pasa al prenderlo y que pasa al apagarlo. */
  encender: string;
  apagar: string;
};

type DemoToggleProps = {
  /** Ruta PATCH del admin, p. ej. /admin/studios/3/demo */
  path: string;
  value: boolean;
  label: string;
  confirm?: DemoConfirm;
};

/* Interruptor "Cuenta demo" del panel de admin. Guarda al momento y, si el
   servidor rechaza el cambio, vuelve a la posicion anterior. */
function DemoToggle({ path, value, label, confirm }: DemoToggleProps) {
  const [on, setOn] = useState(value);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Pop up abierto: es un cambio con consecuencias (un estudio demo
  // desaparece del catalogo de todos los demas) y estaba a un solo clic.
  const [asking, setAsking] = useState(false);

  const guardar = async () => {
    const next = !on;
    setOn(next);
    setAsking(false);
    setSaving(true);
    setFailed(false);
    try {
      await apiJson(path, {
        method: "PATCH",
        body: JSON.stringify({ is_demo: next }),
      });
    } catch {
      setOn(!next);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={failed ? "No se pudo guardar" : label}
        onClick={() => (confirm ? setAsking(true) : guardar())}
        disabled={saving}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:cursor-wait ${
          on ? "bg-[#1b2c44]" : "bg-slate-200"
        } ${failed ? "ring-2 ring-red-300" : ""}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>

      {asking && confirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6">
            <p className="font-semibold text-slate-800">
              {on ? "¿Quitarle el modo demo?" : "¿Convertirla en cuenta demo?"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{confirm.name}</p>

            <p className="text-sm text-slate-600 leading-relaxed mt-4">
              {on ? confirm.apagar : confirm.encender}
            </p>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setAsking(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:border-slate-400 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                className="flex-1 bg-ink text-white py-2.5 rounded-xl text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer"
              >
                {on ? "Sí, quitarlo" : "Sí, convertirla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DemoToggle;
