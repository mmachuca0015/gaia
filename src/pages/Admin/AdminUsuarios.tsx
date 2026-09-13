import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { api } from "../../lib/api";
type User = {
  id: number;
  name: string;
  last_name: string;
  email: string;
  role: "user" | "owner";
  country: string | null;
  city: string | null;
  created_at: string;
};

const PER_PAGE = 25;

const ROLES = {
  user: { label: "Usuario", className: "bg-stone-100 text-stone-600" },
  owner: { label: "Dueño", className: "bg-[#3a5a3a]/10 text-[#3a5a3a]" },
};

function roleBadge(role: User["role"]) {
  return (
    ROLES[role] ?? { label: "—", className: "bg-stone-100 text-stone-500" }
  );
}

// La base guarda el país como "MX" en estudios y "México" en usuarios.
function formatCountry(country: string | null) {
  if (!country) return "—";
  if (country.toUpperCase() === "MX") return "México";
  return country;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Ventana de páginas con elipsis cuando hay muchas: 1 … 4 5 6 … 20
function buildPages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push("...");
  pages.push(totalPages);

  return pages;
}

function AdminUsuarios() {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/admin/users?page=${page}`)
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Usuarios{" "}
          <span
            className="italic text-[#3a5a3a]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            App
          </span>
        </h1>
        <p className="text-stone-600 mt-2">{total} usuarios registrados</p>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="p-10 text-center text-stone-500">Cargando...</div>
        ) : users.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <Users size={36} className="text-stone-300" />
            <p className="text-stone-600 font-medium">
              No hay usuarios registrados
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      Nombre
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      Correo
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      Rol
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      País
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      Estado
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      ID
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-stone-600">
                      Fecha de registro
                    </th>
                  </tr>
                </thead>
                <tbody
                  className={`transition-opacity ${loading ? "opacity-40" : ""}`}
                >
                  {users.map((user) => (
                    <tr
                      key={`${user.role}-${user.id}`}
                      className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-stone-800 font-medium whitespace-nowrap">
                        {user.name} {user.last_name}
                      </td>
                      <td className="px-6 py-4 text-stone-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${roleBadge(user.role).className}`}
                        >
                          {roleBadge(user.role).label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-stone-600 whitespace-nowrap">
                        {formatCountry(user.country)}
                      </td>
                      <td className="px-6 py-4 text-stone-600 whitespace-nowrap">
                        {user.city || "—"}
                      </td>
                      <td className="px-6 py-4 text-stone-400 text-sm">
                        {user.id}
                      </td>
                      <td className="px-6 py-4 text-stone-600 text-sm whitespace-nowrap">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-stone-100">
              <p className="text-sm text-stone-500">
                Mostrando {from}–{to} de {total}
              </p>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-stone-200 text-stone-600 transition-colors cursor-pointer hover:border-[#3a5a3a] hover:text-[#3a5a3a] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-stone-200 disabled:hover:text-stone-600"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {buildPages(page, totalPages).map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`dots-${i}`}
                        className="w-9 h-9 flex items-center justify-center text-stone-400 text-sm"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        aria-current={p === page ? "page" : undefined}
                        className={`w-9 h-9 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                          p === page
                            ? "bg-[#3a5a3a] text-white"
                            : "text-stone-600 hover:bg-[#e8e2d8]"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Página siguiente"
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-stone-200 text-stone-600 transition-colors cursor-pointer hover:border-[#3a5a3a] hover:text-[#3a5a3a] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-stone-200 disabled:hover:text-stone-600"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminUsuarios;
