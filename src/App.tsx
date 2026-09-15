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
import Privacidad from "./pages/Dashboard/Privacidad";
import OwnerLayout from "./layouts/OwnerLayout";
import PanelControl from "./pages/Owner/PanelControl";
import OwnerClases from "./pages/Owner/OwnerClases";
import OwnerEstudio from "./pages/Owner/OwnerEstudio";
import OwnerInstructores from "./pages/Owner/OwnerInstructors";
import OwnerEstudioGeneral from "./pages/Owner/OwnerEstudioGeneral";
import OwnerEstudioPagos from "./pages/Owner/OwnerEstudioPagos";
import OwnerEstudioSeguridad from "./pages/Owner/OwnerEstudioSeguridad";
import OwnerReservas from "./pages/Owner/OwnerReservas";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminUsuarios from "./pages/Admin/AdminUsuarios";
import AdminEstudios from "./pages/Admin/AdminEstudios";
import AdminSuscripciones from "./pages/Admin/AdminSuscripciones";
import AdminCupones from "./pages/Admin/AdminCupones";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Cada bloque exige no solo sesion, sino el rol correcto: antes un
            cliente podia abrir /admin escribiendo la URL. */}
        <Route element={<ProtectedRoute allow={["admin"]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route path="/admin/estudios" element={<AdminEstudios />} />
            <Route
              path="/admin/suscripciones"
              element={<AdminSuscripciones />}
            />
            <Route path="/admin/cupones" element={<AdminCupones />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={["owner"]} />}>
          <Route element={<OwnerLayout />}>
            <Route path="/panel-de-control" element={<PanelControl />} />
            <Route path="/owner/clases" element={<OwnerClases />} />
            <Route path="/owner/instructores" element={<OwnerInstructores />} />
            <Route path="/owner/estudio" element={<OwnerEstudio />} />
            <Route
              path="/owner/estudio/general"
              element={<OwnerEstudioGeneral />}
            />
            <Route
              path="/owner/estudio/pagos"
              element={<OwnerEstudioPagos />}
            />
            <Route
              path="/owner/estudio/seguridad"
              element={<OwnerEstudioSeguridad />}
            />
            <Route path="/owner/reservas" element={<OwnerReservas />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={["user"]} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/explorar" element={<Explorar />} />
            <Route path="/clases" element={<MisClases />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/favoritos" element={<Favoritos />} />
            <Route path="/studios/:id" element={<EstudioDetalle />} />
            <Route path="/agregar-tarjeta" element={<AgregarTarjeta />} />
            <Route path="/notificaciones" element={<div>Notificaciones</div>} />
            <Route path="/privacidad" element={<Privacidad />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
