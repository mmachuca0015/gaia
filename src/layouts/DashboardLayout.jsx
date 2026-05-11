import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";
import BottomNav from "../components/BottomNav";

function DashboardLayout() {
  return (
    <div className="flex h-screen bg-[#f6eee2]">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export default DashboardLayout;
