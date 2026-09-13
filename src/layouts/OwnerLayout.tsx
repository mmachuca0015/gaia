import { Outlet } from "react-router-dom";
import OwnerSidebar from "../components/OwnerSidebar";
import SubscriptionBanner from "../components/SubscriptionBanner";
function OwnerLayout() {
  return (
    <div className="flex h-screen bg-[#f4f7fa]">
      <div className="hidden lg:block">
        <OwnerSidebar />
      </div>
      <main className="flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
        {/* Va en el layout, no en cada pagina: el aviso debe verse en
            cualquier pantalla del panel, no solo en el inicio. */}
        <SubscriptionBanner />
        <Outlet />
      </main>
    </div>
  );
}

export default OwnerLayout;
