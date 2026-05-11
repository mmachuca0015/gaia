import { BrowserRouter, Routes, Route } from "react-router-dom";
import Explorar from "./pages/Dashboard/Explorar";
import DashboardLayout from "./layouts/DashboardLayout";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Landing page (próximamente)</div>} />
        <Route element={<DashboardLayout />}>
          <Route path="/explorar" element={<Explorar />} />
          <Route path="/clases" element={<div>Mis Clases</div>} />
          <Route path="/perfil" element={<div>Perfil</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
