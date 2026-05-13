import { BrowserRouter, Routes, Route } from "react-router-dom";
import Explorar from "./pages/Dashboard/Explorar";
import DashboardLayout from "./layouts/DashboardLayout";
import MisClases from "./pages/Dashboard/MisClases";
import Perfil from "./pages/Dashboard/Perfil";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Landing page (próximamente)</div>} />
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
