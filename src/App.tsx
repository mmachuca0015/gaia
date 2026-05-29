import { BrowserRouter, Routes, Route } from "react-router-dom";
import Explorar from "./pages/Dashboard/Explorar";
import DashboardLayout from "./layouts/DashboardLayout";
import MisClases from "./pages/Dashboard/MisClases";
import Perfil from "./pages/Dashboard/Perfil";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Landing from "./pages/Landing";
import ProtectedRoute from "./components/ProtectedRoute";
import EstudioDetalle from "./pages/Dashboard/EstudioDetalle";
import AgregarTarjeta from "./pages/Dashboard/AgregarTarjeta";
import Favoritos from "./pages/Dashboard/Favoritos";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/panel-de-control"
            element={<div>Panel de control</div>}
          />

          <Route element={<DashboardLayout />}>
            <Route path="/explorar" element={<Explorar />} />
            <Route path="/clases" element={<MisClases />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/favoritos" element={<Favoritos />} />
            <Route path="/studios/:id" element={<EstudioDetalle />} />
            <Route path="/agregar-tarjeta" element={<AgregarTarjeta />} />
            <Route path="/notificaciones" element={<div>Notificaciones</div>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
