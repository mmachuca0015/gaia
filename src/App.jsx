import { BrowserRouter, Routes, Route } from "react-router-dom";
import Explorar from "./pages/Dashboard/Explorar";
import DashboardLayout from "./layouts/DashboardLayout";
import MisClases from "./pages/Dashboard/MisClases";
import Perfil from "./pages/Dashboard/Perfil";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Landing page (próximamente)</div>} />
        <Route path="/login" element={<Login />} />
        <Route path="/panel-de-control" element={<div>Panel de control</div>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<DashboardLayout />}>
          <Route path="/explorar" element={<Explorar />} />
          <Route path="/clases" element={<MisClases />} />
          <Route path="/perfil" element={<Perfil />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
