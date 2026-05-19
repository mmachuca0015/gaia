import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";

function ResetPassword() {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [resetForm, setResetForm] = useState({
    password: "",
    confirmPassword: "",
  });

  const handleResetPassword = async () => {
    if (!resetForm.password || !resetForm.confirmPassword) {
      alert("Por favor llena todos los campos");
      return;
    }
    if (resetForm.password !== resetForm.confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }
    const res = await fetch("http://localhost:3001/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...resetForm, token }),
    });
    const data = await res.json();
    if (res.ok) {
      alert("Contraseña actualizada correctamente");
      navigate("/login");
    } else {
      console.log("Error:", data.error);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6eee2] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm  shadow-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-semibold tracking-widest text-[#2c3a2c]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            PILA
          </h1>
          <p className="text-xs tracking-[0.3em] text-stone-400 mt-0.5">
            WELLNESS
          </p>
        </div>
        <h1 className="text-lg font-semibold text-center mb-8 text-stone-800 mt-1">
          Restablecer contraseña
        </h1>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-stone-400 block mb-1.5" htmlFor="">
              Nueva contraseña
            </label>
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm outline-none focus:border-stone-400 transition-colors"
              type="password"
              placeholder="••••••••"
              onChange={(e) =>
                setResetForm({ ...resetForm, password: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs text-stone-400 block mb-1.5" htmlFor="">
              Confirmar contraseña
            </label>
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm outline-none focus:border-stone-400 transition-colors"
              type="password"
              placeholder="••••••••"
              onChange={(e) =>
                setResetForm({ ...resetForm, confirmPassword: e.target.value })
              }
            />
          </div>
          <button
            className="w-full bg-[#3a5a3a] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#2e4a2e] transition-colors mt-2 cursor-pointer"
            onClick={handleResetPassword}
          >
            Restablecer contraseña
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
