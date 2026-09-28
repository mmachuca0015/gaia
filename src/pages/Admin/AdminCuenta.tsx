import { useState } from "react";

import { api } from "../../lib/api";

// Mismo minimo que valida el backend (MIN_PASSWORD_LENGTH en routes/users.js).
// Aqui solo sirve para avisar antes de mandar; la regla la pone el servidor.
const MIN_LENGTH = 8;

/* Cuenta del admin: cambiar la contraseña.
   Usa POST /users/change-password, la misma ruta de alumnos y dueños: exige la
   contraseña actual en la misma peticion y cierra las demas sesiones.
   Los admins no tienen recuperacion por correo a proposito (quien tomara el
   correo tomaria el panel); si se pierde, se reinicia con
   backend/scripts/reset-admin-password.js. */
function AdminCuenta() {
  const email = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").email ?? "";
    } catch {
      return "";
    }
  })();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const problem =
    next && next.length < MIN_LENGTH
      ? `La contraseña debe tener al menos ${MIN_LENGTH} caracteres`
      : confirm && next !== confirm
        ? "Las contraseñas no coinciden"
        : next && current && next === current
          ? "La nueva contraseña es igual a la actual"
          : "";
  const ready = current && next && confirm && !problem;

  const guardar = async () => {
    setSaving(true);
    setError("");
    const res = await api("/users/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    setAsking(false);
    if (!res.ok) {
      setError(data?.error || "No pudimos cambiar la contraseña");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  };

  const input =
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors";

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mi{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            cuenta
          </span>
        </h1>
        {email && <p className="text-slate-600 mt-2">{email}</p>}
      </div>

      <div className="max-w-md bg-white rounded-2xl p-6 flex flex-col gap-4">
        <p className="font-semibold text-slate-800">Cambiar contraseña</p>

        <label className="text-md text-slate-600">
          <span className="block mb-1.5">Contraseña actual</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setDone(false);
            }}
            className={input}
          />
        </label>

        <label className="text-md text-slate-600">
          <span className="block mb-1.5">Nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setDone(false);
            }}
            className={input}
          />
        </label>

        <label className="text-md text-slate-600">
          <span className="block mb-1.5">Confirmar nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setDone(false);
            }}
            className={input}
          />
        </label>

        {problem && <p className="text-sm text-red-600">{problem}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && (
          <p className="text-sm text-emerald-700">
            Contraseña actualizada. Se cerraron tus otras sesiones.
          </p>
        )}

        <button
          onClick={() => setAsking(true)}
          disabled={!ready || saving}
          className="bg-ink text-white py-2.5 rounded-xl text-md font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Guardar
        </button>
      </div>

      {asking && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6">
            <p className="font-semibold text-slate-800">
              ¿Cambiar tu contraseña?
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mt-4">
              Se cerrará la sesión de admin en cualquier otro navegador o
              dispositivo. En este sigues dentro.
            </p>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setAsking(false)}
                disabled={saving}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:border-slate-400 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={saving}
                className="flex-1 bg-ink text-white py-2.5 rounded-xl text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:cursor-wait"
              >
                {saving ? "Guardando..." : "Sí, cambiarla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCuenta;
