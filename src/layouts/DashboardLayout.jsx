import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";

function DashboardLayout() {
    return (
        <div className="flex h-screen bg-[#f6eee2]">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">
                <Outlet />
            </main>
        </div>
    )
}

export default DashboardLayout;