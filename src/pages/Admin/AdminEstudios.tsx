import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Store } from "lucide-react";
import AdminStudioModal from "../../components/AdminStudioModal";
import type { StudioDetails } from "../../components/AdminStudioModal";

import { api } from "../../lib/api";
type Studio = {
  id: number;
  name: string;
  last_name: string;
  studio_name: string;
  email: string;
  country: string;
  city: string | null;
  plan: string;
};

function AdminEstudios() {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // `loading` es derivado en vez de un estado propio: mientras la pagina ya
  // cargada no sea la que se pide, estamos esperando. Asi desaparece el
  // setLoading(true) sincrono del efecto, que provocaba un render de mas.
  const [loadedPage, setLoadedPage] = useState(0);
  const loading = loadedPage !== page;

  useEffect(() => {
    // Si el usuario cambia de pagina antes de que llegue la respuesta anterior,
    // esa respuesta tardia no debe pisar los datos de la pagina actual.
    let cancelled = false;
    api(`/admin/studios?page=${page}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setStudios(data.studios);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      })
      .finally(() => {
        if (!cancelled) setLoadedPage(page);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const [studioDetails, setStudioDetails] = useState<StudioDetails | null>(
    null,
  );
  const [loadingDetails, setLoadingDetails] = useState<number | null>(null);

  const handleShowDetails = async (studioId: number) => {
    setLoadingDetails(studioId);
    try {
      const res = await api(`/admin/studios/${studioId}/details`);
      const data = await res.json();
      setStudioDetails(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Estudios{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            App
          </span>
        </h1>
        <p className="text-slate-600 mt-2">{total} estudios registrados</p>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : studios.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <Store size={36} className="text-slate-300" />
            <p className="text-slate-600 font-medium">
              No hay estudios registrados
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Nombre
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Apellido
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Estudio
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Correo
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      País
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Ciudad
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Plan
                    </th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-slate-600">
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studios.map((studio) => (
                    <tr
                      key={studio.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-slate-800 font-medium">
                        {studio.name}
                      </td>
                      <td className="px-6 py-4 text-slate-800 font-medium">
                        {studio.last_name}
                      </td>
                      <td className="px-6 py-4 text-slate-800">
                        {studio.studio_name}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {studio.email}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {studio.country}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {studio.city ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {studio.plan}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          disabled={loadingDetails === studio.id}
                          className="text-sm text-[#1b2c44] font-medium cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-wait"
                          onClick={() => handleShowDetails(studio.id)}
                        >
                          {loadingDetails === studio.id
                            ? "Cargando..."
                            : "Detalles"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-full text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 text-slate-600 hover:border-slate-400"
                  >
                    <ChevronLeft size={16} />
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-full text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 text-slate-600 hover:border-slate-400"
                  >
                    Siguiente
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {studioDetails && (
        <AdminStudioModal
          details={studioDetails}
          onClose={() => setStudioDetails(null)}
        />
      )}
    </div>
  );
}

export default AdminEstudios;
