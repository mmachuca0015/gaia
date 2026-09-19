// Las sucursales del dueño. Cada una es un estudio: su direccion, su horario,
// sus clases y sus imagenes. Lo que las agrupa es la cuenta del dueño, y
// cuantas puede tener lo dice su plan (Basic 1, Pro 3).
import { useCallback, useEffect, useState } from "react";

import { apiJson } from "./api";
import type { StudioHour } from "./hours";

export interface Branch {
  id: number;
  /** El nombre que ve el alumno en el catalogo. */
  name: string;
  /** El nombre corto con que el dueño la distingue en el panel. */
  branch_name: string | null;
  description: string | null;
  street: string | null;
  ext_number: string | null;
  int_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  logo_url: string | null;
  cover_url: string | null;
  hours: StudioHour[];
  /** Lo calcula el backend con el mismo SQL que decide si se publica. */
  complete: boolean;
  /** Que le falta para publicarse, en palabras. */
  missing: string[];
}

export interface BranchesResponse {
  branches: Branch[];
  /** Cuantas sucursales permite el plan del dueño. */
  max_studios: number;
}

/** Lo que se manda al crear una sucursal. */
export interface NewBranch {
  name: string;
  branch_name?: string;
  description?: string;
  street?: string;
  ext_number?: string;
  int_number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string;
  logo_url?: string;
  cover_url?: string;
  hours?: StudioHour[];
}

export function fetchBranches() {
  return apiJson<BranchesResponse>("/studios/mine");
}

export function createBranch(branch: NewBranch) {
  return apiJson<{ id: number }>("/studios/mine", {
    method: "POST",
    body: JSON.stringify(branch),
  });
}

export function deleteBranch(id: number) {
  return apiJson<{ success: true }>(`/studios/mine/${id}`, {
    method: "DELETE",
  });
}

/** Lo que dice la pestaña. Sin nombre capturado, se numeran. */
export function branchLabel(branch: Branch, index: number) {
  return branch.branch_name?.trim() || `Sucursal ${index + 1}`;
}

// La sucursal abierta se recuerda entre pantallas: si el dueño esta viendo
// Providencia y se va a Reservas, sigue en Providencia. Vive en localStorage
// porque es estado de presentacion, como el nombre y el rol; el backend nunca
// lo mira, y toda ruta comprueba que la sucursal sea suya.
const STORAGE_KEY = "wellco_branch";

function storedBranch(): number | null {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Las sucursales del dueño y cual esta abierta. Lo usan las seis pantallas
 * del panel, para que las pestañas digan lo mismo en todas.
 */
export function useBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [maxStudios, setMaxStudios] = useState(1);
  const [activeId, setActiveIdState] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const setActiveId = useCallback((id: number) => {
    setActiveIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // Modo privado o almacenamiento bloqueado: se pierde al cambiar de
      // pantalla, pero la pagina sigue funcionando.
    }
  }, []);

  const apply = useCallback((data: BranchesResponse) => {
    setBranches(data.branches);
    setMaxStudios(data.max_studios);
    // La guardada puede ya no existir (se borro, o es de otra cuenta que uso
    // este navegador): en ese caso se cae a la primera.
    setActiveIdState((current) => {
      const elegida = current ?? storedBranch();
      return elegida && data.branches.some((b) => b.id === elegida)
        ? elegida
        : (data.branches[0]?.id ?? null);
    });
    setLoaded(true);
  }, []);

  /** Para volver a pedirlas despues de crear o borrar una. */
  const reload = useCallback(() => fetchBranches().then(apply), [apply]);

  useEffect(() => {
    // `cancelled` evita pintar la respuesta de una pantalla que el dueño ya
    // dejo atras.
    let cancelled = false;
    fetchBranches().then((data) => {
      if (!cancelled) apply(data);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const studio = branches.find((b) => b.id === activeId) ?? null;

  return { branches, studio, activeId, setActiveId, maxStudios, loaded, reload };
}
