import { Outlet } from "react-router-dom";
import OwnerSidebar from "../components/OwnerSidebar";
function OwnerLayout() {
  return (
    <div className="flex h-screen bg-[#f4f7fa]">
      <div className="hidden lg:block">
        <OwnerSidebar />
      </div>
      <main className="flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
        <Outlet />
      </main>
    </div>
  );
}

export default OwnerLayout;
