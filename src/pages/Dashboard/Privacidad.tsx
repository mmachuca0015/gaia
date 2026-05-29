import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

function Privacidad() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const navigate = useNavigate();

  const [showPopup, setShowPopup] = useState(false);
  const [popupType, setPopupType] = useState<"email" | "password" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const handleContinue = async () => {
    const response = await fetch(
      "http://localhost:3001/users/verify-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typedPassword: currentPassword,
          userId: user.id,
        }),
      },
    );
    const data = await response.json();
    if (data.isValid) {
      setShowPopup(false);
      if (popupType === "email") setShowEmailForm(true);
      if (popupType === "password") setShowPasswordForm(true);
    } else {
      alert("Contraseña incorrecta");
    }
  };

  const handleChangeEmail = async () => {
    if (newEmail !== confirmNewEmail) {
      alert("Los correos no coinciden");
      return;
    }
    // fetch al backend
    const response = await fetch("http://localhost:3001/users/change-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        newEmail: newEmail,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      localStorage.setItem(
        "user",
        JSON.stringify({ ...user, email: newEmail }),
      );
      setShowEmailForm(false);
      setNewEmail("");
      setConfirmNewEmail("");
      alert("Correo actualizado correctamente");
    } else {
      alert(data.error);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }
    const response = await fetch(
      "http://localhost:3001/users/change-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          newPassword: newPassword,
        }),
      },
    );
    const data = await response.json();
    if (response.ok) {
      localStorage.setItem(
        "user",
        JSON.stringify({ ...user, password: newPassword }),
      );
      setShowPasswordForm(false);
      setNewPassword("");
      setConfirmNewPassword("");
      alert("Contraseña actualizada correctamente");
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <ChevronLeft
          size={22}
          onClick={() => navigate("/perfil")}
          className="text-[#3a5a3a] cursor-pointer"
        />
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Tu{" "}
          <span
            className="italic text-[#3a5a3a]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Privacidad
          </span>
        </h1>
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-2xl overflow-hidden">
        {/* Correo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <p className="text-md text-stone-600 mb-0.5">Correo electrónico</p>
            <p className="text-stone-800 text-lg">{user.email}</p>
          </div>
          <button
            onClick={() => {
              setPopupType("email");
              setShowPopup(true);
            }}
            className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
          >
            Cambiar
          </button>
        </div>

        {/* Contraseña */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-md text-stone-600 mb-0.5">Contraseña</p>
            <p className="text-stone-800 text-lg tracking-widest">••••••••</p>
          </div>
          <button
            onClick={() => {
              setPopupType("password");
              setShowPopup(true);
            }}
            className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
          >
            Cambiar
          </button>
        </div>
      </div>

      {showPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-4">
            <p className="font-semibold text-stone-800 text-lg">
              Confirma tu contraseña
            </p>
            <input
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleContinue}
                className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmailForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-4">
            <p className="font-semibold text-stone-800 text-lg text-center">
              Actualiza tu correo
            </p>

            <div>
              <label className="text-md text-stone-600 block mb-1.5">
                Nuevo correo
              </label>
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                type="email"
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
              />
            </div>

            <div>
              <label className="text-md text-stone-600 block mb-1.5">
                Confirmar correo
              </label>
              <input
                value={confirmNewEmail}
                onChange={(e) => setConfirmNewEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                type="email"
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
              />
            </div>

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => {
                  setShowEmailForm(false);
                  setNewEmail("");
                  setConfirmNewEmail("");
                }}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangeEmail}
                className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-4">
            <p className="font-semibold text-stone-800 text-lg text-center">
              Actualiza tu contraseña
            </p>

            <div>
              <label className="text-md text-stone-600 block mb-1.5">
                Nueva contraseña
              </label>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
              />
            </div>

            <div>
              <label className="text-md text-stone-600 block mb-1.5">
                Confirmar contraseña
              </label>
              <input
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
              />
            </div>

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => {
                  setShowPasswordForm(false);
                  setNewPassword("");
                  setConfirmNewPassword("");
                }}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangePassword}
                className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Privacidad;
