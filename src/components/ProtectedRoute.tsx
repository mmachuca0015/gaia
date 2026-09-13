import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchSession, type Role, type SessionUser } from "../lib/api";

interface Props {
  /** Roles con acceso a estas rutas. Si se omite, basta con estar autenticado. */
  allow?: Role[];
}

// La version anterior solo comprobaba que existiera localStorage.user, asi que
// bastaba con escribirlo a mano en la consola para entrar. Ahora la sesion se
// confirma contra el backend, que es quien tiene la cookie httpOnly.
//
// Esto es una comodidad de la interfaz, no la seguridad: aunque alguien
// saltara esta pantalla, cada endpoint valida la sesion por su cuenta.
function ProtectedRoute({ allow }: Props) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    fetchSession().then((user) => {
      if (cancelled) return;
      setSession(user);
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#f4f7fa] flex items-center justify-center">
        <p className="text-sm text-slate-400">Cargando…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Rol equivocado: se manda a cada quien a su propia pantalla de inicio en
  // lugar de dejarlo ver una interfaz que no le corresponde.
  if (allow && !allow.includes(session.role)) {
    const inicio =
      session.role === "admin"
        ? "/admin"
        : session.role === "owner"
          ? "/panel-de-control"
          : "/explorar";
    return <Navigate to={inicio} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
