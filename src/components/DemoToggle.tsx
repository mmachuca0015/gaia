import { useState } from "react";

import { apiJson } from "../lib/api";

type DemoToggleProps = {
  /** Ruta PATCH del admin, p. ej. /admin/studios/3/demo */
  path: string;
  value: boolean;
  label: string;
};

/* Interruptor "Cuenta demo" del panel de admin. Guarda al momento y, si el
   servidor rechaza el cambio, vuelve a la posicion anterior. */
function DemoToggle({ path, value, label }: DemoToggleProps) {
  const [on, setOn] = useState(value);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    const next = !on;
    setOn(next);
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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={failed ? "No se pudo guardar" : label}
      onClick={toggle}
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
  );
}

export default DemoToggle;
