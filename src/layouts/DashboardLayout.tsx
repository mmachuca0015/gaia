import Sidebar from "../components/Sidebar";
import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import BottomNav from "../components/BottomNav";

// En el telefono se desplaza la pagina entera, no una caja por dentro: con
// `h-screen` (100vh) la caja media lo mismo que la pantalla SIN las barras de
// Safari, habia dos scrolls (el de la caja y el de la pagina) y lo de abajo
// quedaba tapado por el menu inferior. En escritorio sigue la caja, para que
// el sidebar no se mueva.
function DashboardLayout() {
  // Al cambiar de pantalla se empieza arriba: con el scroll en la pagina, la
  // posicion de la anterior se quedaria (entrar a un estudio desde abajo de
  // Explorar lo abriria a media pagina).
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh lg:h-screen bg-[#f4f7fa]">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 lg:overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export default DashboardLayout;
