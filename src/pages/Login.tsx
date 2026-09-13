import { useState } from "react";
import { Dumbbell, Store, ArrowLeft } from "lucide-react";
import { estados } from "../data/estados.js";
import { Link, useNavigate } from "react-router-dom";

import { api, setCachedUser } from "../lib/api";
import {
  fetchPlans,
  firstChargePrice,
  formatMoney,
  type Plan,
  type BillingInterval,
} from "../lib/plans";
import PlanPicker from "../components/PlanPicker";
import SubscriptionPayment from "../components/SubscriptionPayment";

type Step =
  | "Iniciar sesión"
  | "Crear cuenta"
  | "Registrar usuario"
  | "Registrar estudio"
  | "Elegir plan"
  | "Pagar"
  | "Recuperar contraseña";

function Login() {
  const [step, setStep] = useState<Step>("Iniciar sesión");

  {
    /*Formulario de inicio de sesión */
  }
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  {
    /*Formulario de registro de usuario */
  }
  const [registerUserForm, setRegisterUserForm] = useState({
    name: "",
    last_name: "",
    country: "México",
    state: "",
    email: "",
    confirmEmail: "",
    password: "",
    confirmPassword: "",
  });

  {
    /*Formulario de registro de estudio */
  }
  const [registerStudioForm, setRegisterStudioForm] = useState({
    name: "",
    last_name: "",
    studio_name: "",
    country: "México",
    state: "",
    phone: "",
    email: "",
    confirmEmail: "",
    password: "",
    confirmPassword: "",
  });

  {
    /*Formulario de recuperar contraseña */
  }
  const [forgotForm, setForgotForm] = useState({ email: "" });

  {
    /*Plan elegido por el dueño de estudio. Sin esto no se crea el perfil. */
  }
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");
  const [creatingStudio, setCreatingStudio] = useState(false);

  const navigate = useNavigate();

  const selectedPlan =
    plans.find((p) => p.id === selectedPlanId) ?? null;

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.password) {
      alert("Por favor llena todos los campos");
      return;
    }
    const res = await api("/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginForm),
    });
    const data = await res.json();
    if (res.ok) {
      // La sesion real es la cookie httpOnly que acaba de poner el backend.
      // Esto solo cachea el nombre y el rol para pintar la interfaz.
      setCachedUser(data);
      if (data.role === "admin") {
        navigate("/admin");
      } else if (data.role === "owner") {
        navigate("/panel-de-control");
      } else {
        navigate("/explorar");
      }
    } else {
      alert(data.error || "No pudimos iniciar sesión");
    }
  };

  const handleRegisterUser = async () => {
    if (
      !registerUserForm.name ||
      !registerUserForm.last_name ||
      !registerUserForm.email ||
      !registerUserForm.password ||
      !registerUserForm.state ||
      !registerUserForm.country ||
      !registerUserForm.confirmEmail ||
      !registerUserForm.confirmPassword
    ) {
      alert("Por favor llena todos los campos");
      return;
    }
    if (registerUserForm.email !== registerUserForm.confirmEmail) {
      alert("Los correos no coinciden");
      return;
    }

    if (registerUserForm.password !== registerUserForm.confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }

    const res = await api("/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerUserForm),
    });
    const data = await res.json();
    if (res.ok) {
      setCachedUser(data);
      navigate("/explorar");
    } else {
      alert(data.error || "No pudimos crear tu cuenta");
    }
  };

  // Paso 1: valida los datos del estudio y pasa a elegir plan. El registro
  // real no ocurre aqui, porque sin plan no hay perfil que crear.
  const handleStudioFormNext = async () => {
    if (
      !registerStudioForm.name ||
      !registerStudioForm.last_name ||
      !registerStudioForm.email ||
      !registerStudioForm.password ||
      !registerStudioForm.state ||
      !registerStudioForm.country ||
      !registerStudioForm.confirmEmail ||
      !registerStudioForm.confirmPassword ||
      !registerStudioForm.studio_name ||
      !registerStudioForm.phone
    ) {
      alert("Por favor llena todos los campos");
      return;
    }

    if (registerStudioForm.email !== registerStudioForm.confirmEmail) {
      alert("Los correos no coinciden");
      return;
    }

    if (registerStudioForm.password !== registerStudioForm.confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }

    setStep("Elegir plan");
    if (plans.length === 0) {
      try {
        const data = await fetchPlans();
        setPlans(data);
        // Preselecciona el destacado para que el paso no arranque vacio.
        setSelectedPlanId(
          (data.find((p) => p.is_featured) ?? data[0])?.id ?? null,
        );
      } catch {
        alert("No pudimos cargar los planes. Intenta de nuevo.");
      }
    }
  };

  // Paso 2: crea el estudio con el plan elegido y manda directo al pago.
  const handleRegisterStudio = async () => {
    if (!selectedPlanId) {
      alert("Elige un plan para continuar");
      return;
    }

    setCreatingStudio(true);
    try {
      const res = await api("/studios/register-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...registerStudioForm,
          plan_id: selectedPlanId,
          billing_interval: billingInterval,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No pudimos registrar el estudio");
        return;
      }

      setCachedUser(data);

      // La cuenta ya existe y la sesion tambien, pero la suscripcion nace
      // pendiente. El cobro se hace en el siguiente paso, sin salir de la app;
      // si el dueño lo abandona, el panel se lo vuelve a pedir en vez de
      // perder la cuenta recien creada.
      setStep("Pagar");
    } finally {
      setCreatingStudio(false);
    }
  };

  const handleForgotPassword = async () => {
    const res = await api("/users/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forgotForm),
    });
    const data = await res.json();
    if (res.ok) {
      // Mensaje neutro a proposito: no revela si el correo esta registrado.
      alert("Si el correo está registrado, te enviamos un enlace");
    } else {
      alert(data.error || "No pudimos enviar el correo");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fa] flex items-center justify-center p-4">
      <div
        className={`bg-white rounded-3xl p-8 w-full ${step === "Registrar estudio" || step === "Elegir plan" ? "max-w-3xl" : "max-w-sm"} shadow-sm`}
      >
        {/* Logo. Es la salida del formulario: de vuelta a la landing. */}
        <div className="text-center mb-8">
          <Link
            to="/"
            className="text-3xl font-semibold tracking-widest text-[#1b2c44] inline-block hover:text-[#33506f] transition-colors"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Wellco
          </Link>
        </div>

        {/* Switch tabs */}
        <div className="relative flex bg-[#eef2f7] rounded-xl p-1 mb-6">
          <div
            className="absolute top-1 left-1 h-[calc(100%-8px)] w-[calc(50%-4px)] bg-[#1b2c44] rounded-lg transition-transform duration-300"
            style={{
              transform:
                step === "Iniciar sesión" || step === "Recuperar contraseña"
                  ? "translateX(0)"
                  : "translateX(100%)",
            }}
          />
          <button
            onClick={() => setStep("Iniciar sesión")}
            className={`flex-1 py-2.5 text-sm font-medium relative z-10 transition-colors duration-300 cursor-pointer ${
              step !== "Crear cuenta" &&
              step !== "Registrar usuario" &&
              step !== "Registrar estudio"
                ? "text-white"
                : "text-slate-400"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => setStep("Crear cuenta")}
            className={`flex-1 py-2.5 text-sm font-medium relative z-10 transition-colors duration-300 cursor-pointer ${
              step === "Crear cuenta" ||
              step === "Registrar usuario" ||
              step === "Registrar estudio"
                ? "text-white"
                : "text-slate-400"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* Formulario iniciar sesión */}
        {step === "Iniciar sesión" && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, email: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
              />
            </div>
            <button
              onClick={handleLogin}
              className="w-full bg-[#1b2c44] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#33506f] transition-colors mt-2 cursor-pointer"
            >
              Iniciar sesión
            </button>
            <p
              onClick={() => setStep("Recuperar contraseña")}
              className="text-center text-xs text-slate-400 cursor-pointer hover:text-slate-600 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </p>
          </div>
        )}

        {/* Botones crear cuenta */}
        {step === "Crear cuenta" && (
          <div className="flex flex-col gap-4">
            <div className="mb-2">
              <p className="text-lg font-semibold text-slate-800">
                ¿Cómo quieres usar Wellco?
              </p>
              <p className="text-sm text-slate-400">Elige tu tipo de cuenta</p>
            </div>
            <button
              onClick={() => setStep("Registrar usuario")}
              className="flex flex-col items-center gap-2 p-5 border border-slate-200 rounded-2xl hover:border-[#1b2c44] hover:bg-[#f4f7fa] transition-all cursor-pointer"
            >
              <Dumbbell size={24} className="text-[#1b2c44]" />
              <p className="font-medium text-slate-800">Soy usuario</p>
              <p className="text-xs text-slate-400">
                Quiero reservar clases de pilates
              </p>
            </button>
            <button
              onClick={() => setStep("Registrar estudio")}
              className="flex flex-col items-center gap-2 p-5 border border-slate-200 rounded-2xl hover:border-[#1b2c44] hover:bg-[#f4f7fa] transition-all cursor-pointer"
            >
              <Store size={24} className="text-[#1b2c44]" />
              <p className="font-medium text-slate-800">Soy dueño de estudio</p>
              <p className="text-xs text-slate-400">
                Quiero publicar mi estudio en Wellco
              </p>
            </button>
          </div>
        )}

        {/*Formulario registrar usuario*/}
        {step === "Registrar usuario" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArrowLeft
                size={20}
                onClick={() => setStep("Crear cuenta")}
                className="text-[#1b2c44] cursor-pointer"
              />
              <p className="font-semibold text-slate-800">Nuevo usuario</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">
                  Nombre
                </label>
                <input
                  type="text"
                  placeholder="Valeria"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                  value={registerUserForm.name}
                  onChange={(e) =>
                    setRegisterUserForm({
                      ...registerUserForm,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">
                  Apellido
                </label>
                <input
                  type="text"
                  placeholder="Martínez"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                  value={registerUserForm.last_name}
                  onChange={(e) =>
                    setRegisterUserForm({
                      ...registerUserForm,
                      last_name: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                País
              </label>
              <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors text-slate-600">
                <option value="México">México</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Estado
              </label>
              <select
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors text-slate-600"
                value={registerUserForm.state}
                onChange={(e) =>
                  setRegisterUserForm({
                    ...registerUserForm,
                    state: e.target.value,
                  })
                }
              >
                <option value="">Selecciona un estado</option>
                {estados.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={registerUserForm.email}
                onChange={(e) =>
                  setRegisterUserForm({
                    ...registerUserForm,
                    email: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Confirmar correo electrónico
              </label>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={registerUserForm.confirmEmail}
                onChange={(e) =>
                  setRegisterUserForm({
                    ...registerUserForm,
                    confirmEmail: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={registerUserForm.password}
                onChange={(e) =>
                  setRegisterUserForm({
                    ...registerUserForm,
                    password: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Confirmar contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={registerUserForm.confirmPassword}
                onChange={(e) =>
                  setRegisterUserForm({
                    ...registerUserForm,
                    confirmPassword: e.target.value,
                  })
                }
              />
            </div>

            <button
              onClick={handleRegisterUser}
              className="w-full bg-[#1b2c44] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#33506f] transition-colors mt-2 cursor-pointer"
            >
              Crear cuenta
            </button>
          </div>
        )}

        {/*Formulario registrar estudio*/}
        {step === "Registrar estudio" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArrowLeft
                size={20}
                onClick={() => setStep("Crear cuenta")}
                className="text-[#1b2c44] cursor-pointer"
              />
              <p className="font-semibold text-slate-800">Nuevo estudio</p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Columna izquierda */}
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">
                      Nombre
                    </label>
                    <input
                      type="text"
                      placeholder="Carlos"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                      value={registerStudioForm.name}
                      onChange={(e) =>
                        setRegisterStudioForm({
                          ...registerStudioForm,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">
                      Apellido
                    </label>
                    <input
                      type="text"
                      placeholder="García"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                      value={registerStudioForm.last_name}
                      onChange={(e) =>
                        setRegisterStudioForm({
                          ...registerStudioForm,
                          last_name: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Nombre del estudio
                  </label>
                  <input
                    type="text"
                    placeholder="Mi estudio"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    value={registerStudioForm.studio_name}
                    onChange={(e) =>
                      setRegisterStudioForm({
                        ...registerStudioForm,
                        studio_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">
                      País
                    </label>
                    <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors text-slate-600">
                      <option value="México">México</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">
                      Estado
                    </label>
                    <select
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors text-slate-600"
                      value={registerStudioForm.state}
                      onChange={(e) =>
                        setRegisterStudioForm({
                          ...registerStudioForm,
                          state: e.target.value,
                        })
                      }
                    >
                      <option value="">Selecciona</option>
                      {estados.map((estado) => (
                        <option key={estado} value={estado}>
                          {estado}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    placeholder="33 1234 5678"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    value={registerStudioForm.phone}
                    onChange={(e) =>
                      setRegisterStudioForm({
                        ...registerStudioForm,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* Columna derecha */}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    value={registerStudioForm.email}
                    onChange={(e) =>
                      setRegisterStudioForm({
                        ...registerStudioForm,
                        email: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Confirmar correo
                  </label>
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    value={registerStudioForm.confirmEmail}
                    onChange={(e) =>
                      setRegisterStudioForm({
                        ...registerStudioForm,
                        confirmEmail: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    value={registerStudioForm.password}
                    onChange={(e) =>
                      setRegisterStudioForm({
                        ...registerStudioForm,
                        password: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    value={registerStudioForm.confirmPassword}
                    onChange={(e) =>
                      setRegisterStudioForm({
                        ...registerStudioForm,
                        confirmPassword: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <button
              onClick={handleStudioFormNext}
              className="block mx-auto bg-[#1b2c44] text-white py-3 px-30 rounded-xl text-sm font-medium hover:bg-[#33506f] transition-colors mt-auto cursor-pointer"
            >
              Continuar
            </button>
          </div>
        )}

        {/*Elegir plan: paso obligatorio antes de crear el perfil*/}
        {step === "Elegir plan" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArrowLeft
                size={20}
                onClick={() => setStep("Registrar estudio")}
                className="text-[#1b2c44] cursor-pointer"
              />
              <div>
                <p className="font-semibold text-slate-800">Elige tu plan</p>
                <p className="text-xs text-slate-400">
                  Tu estudio se crea al confirmar el pago
                </p>
              </div>
            </div>

            <PlanPicker
              plans={plans}
              selectedId={selectedPlanId}
              onSelect={setSelectedPlanId}
              interval={billingInterval}
              onIntervalChange={setBillingInterval}
            />

            <button
              onClick={handleRegisterStudio}
              disabled={!selectedPlanId || creatingStudio}
              className="block mx-auto bg-[#1b2c44] text-white py-3 px-16 rounded-xl text-sm font-medium hover:bg-[#33506f] transition-colors mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingStudio ? "Creando..." : "Crear estudio"}
            </button>
            {selectedPlan && (
              <p className="text-xs text-slate-400 text-center">
                Hoy se te cobran ${formatMoney(
                  firstChargePrice(selectedPlan, billingInterval),
                )}{" "}
                {selectedPlan.currency.toUpperCase()}
                {billingInterval === "year" ? " por el año" : " el primer mes"}.
              </p>
            )}
          </div>
        )}

        {/*Pago. La cuenta ya existe; falta cobrar para activarla.*/}
        {step === "Pagar" && (
          <div className="flex flex-col gap-4">
            <div className="mb-2">
              <p className="font-semibold text-slate-800">Datos de pago</p>
              <p className="text-xs text-slate-400">
                {selectedPlan
                  ? `Plan ${selectedPlan.name} · ${
                      billingInterval === "year" ? "anual" : "mensual"
                    }`
                  : "Completa tu suscripción"}
              </p>
            </div>

            <SubscriptionPayment
              cta="Pagar y activar"
              onSuccess={() => navigate("/panel-de-control")}
            />
          </div>
        )}

        {/* Recuperar contraseña */}
        {step === "Recuperar contraseña" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <ArrowLeft
                size={20}
                onClick={() => setStep("Iniciar sesión")}
                className="text-[#1b2c44] cursor-pointer"
              />
              <p className="font-semibold text-slate-800">
                Recuperar contraseña
              </p>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                value={forgotForm.email}
                onChange={(e) =>
                  setForgotForm({
                    ...forgotForm,
                    email: e.target.value,
                  })
                }
              />
            </div>
            <button
              onClick={handleForgotPassword}
              className="w-full bg-[#1b2c44] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#33506f] transition-colors mt-2 cursor-pointer"
            >
              Enviar
            </button>
            <p className="text-center text-xs text-slate-400">
              Te enviaremos un enlace para restablecer tu contraseña
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;
