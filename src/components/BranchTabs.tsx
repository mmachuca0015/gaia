// Las pestañas de sucursal del panel del dueño. Con una sola sucursal no se
// pintan: seria una pestaña suelta que no lleva a ningun lado.
//
// En Estudio > General llevan ademas los tres puntos y el boton de agregar
// (`actions`); en las demas pantallas solo cambian de sucursal.
import { useState } from "react";
import { MoreVertical, Plus } from "lucide-react";

import { branchLabel, type Branch } from "../lib/branches";

interface Props {
  branches: Branch[];
  activeId: number | null;
  onSelect: (id: number) => void;
  actions?: {
    onRename: (branch: Branch) => void;
    onDelete: (branch: Branch) => void;
    onAdd: () => void;
    canAdd: boolean;
  };
}

function BranchTabs({ branches, activeId, onSelect, actions }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (branches.length <= 1 && !actions) return null;

  return (
    <div className="flex items-end gap-1 flex-wrap border-b border-slate-200">
      {branches.map((branch, i) => {
        const activa = branch.id === activeId;
        return (
          <div key={branch.id} className="relative">
            <div
              className={`flex items-center gap-1 rounded-t-xl border-b-2 transition-colors ${
                activa ? "bg-white border-[#1b2c44]" : "border-transparent"
              }`}
            >
              <button
                onClick={() => {
                  onSelect(branch.id);
                  setMenuOpen(false);
                }}
                className={`flex items-center gap-2 pl-4 py-2.5 text-md cursor-pointer ${
                  activa
                    ? `text-slate-800 font-medium ${actions ? "pr-1" : "pr-4"}`
                    : "text-slate-500 hover:text-slate-700 pr-4"
                }`}
              >
                {branchLabel(branch, i)}
                {!branch.complete && (
                  <span
                    title="Le falta información"
                    className="w-1.5 h-1.5 rounded-full bg-amber-500"
                  />
                )}
              </button>
              {activa && actions && (
                <button
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-label="Opciones de la sucursal"
                  className="pr-2 py-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <MoreVertical size={16} />
                </button>
              )}
            </div>

            {activa && actions && menuOpen && (
              <>
                {/* Capa para cerrar el menu al hacer clic fuera. */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onRename(branch);
                    }}
                    className="w-full text-left px-4 py-3 text-md text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cambiar nombre
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onDelete(branch);
                    }}
                    className="w-full text-left px-4 py-3 text-md text-red-500 hover:bg-red-50 border-t border-slate-100 cursor-pointer"
                  >
                    Borrar sucursal
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {actions?.canAdd && (
        <button
          onClick={actions.onAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 text-md text-[#1b2c44] font-medium hover:text-[#33506f] transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Agregar sucursal
        </button>
      )}
    </div>
  );
}

export default BranchTabs;
