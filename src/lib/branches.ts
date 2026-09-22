// Las sucursales del dueño. Cada una es un estudio: su direccion, su horario,
// sus clases y sus imagenes. Lo que las agrupa es la cuenta del dueño, y
// cuantas puede tener lo dice su plan (`plans.max_studios`, que el admin edita
// en /admin/suscripciones).
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
  /**
   * Si cabe en el plan del dueño. Las que no caben estan DORMIDAS: se
   * conservan enteras (clases, reservas, ingresos) pero salen del catalogo y
   * el dueño no las administra hasta que vuelva a un plan que las incluya.
   * Lo decide el backend; aqui solo se pinta.
   */
  within_plan: boolean;
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

/**
 * Las que el dueño puede administrar hoy. El backend las manda en el orden en
 * que se crearon y duerme las que sobran del limite, asi que la primera de la
 * lista es siempre la que nacio con la cuenta.
 */
export function awakeBranches(branches: Branch[]) {
  return branches.filter((b) => b.within_plan);
}

/**
 * Cuales se dormirian con un plan de `maxStudios` sucursales. Sirve para
 * avisarle al dueño ANTES de que confirme el cambio, con nombre y apellido en
 * vez de un numero.
 *
 * Se apoya en que la lista viene ordenada por antigüedad desde el backend, que
 * es la misma regla con la que el catalogo decide (STUDIO_WITHIN_PLAN): caben
 * las primeras, se duerme la cola. El backend vuelve a comprobarlo al guardar;
 * esto es solo lo que se pinta.
 */
export function branchesLeftOut(branches: Branch[], maxStudios: number) {
  return branches.slice(Math.max(maxStudios, 0));
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
    // este navegador) o haberse dormido al bajar de plan: en esos casos se cae
    // a la primera que el plan si incluye.
    const despiertas = awakeBranches(data.branches);
    setActiveIdState((current) => {
      const elegida = current ?? storedBranch();
      return elegida && despiertas.some((b) => b.id === elegida)
        ? elegida
        : (despiertas[0]?.id ?? null);
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

  // `studio` es siempre una sucursal que el plan incluye: las dormidas se
  // pintan en las pestañas pero no se abren, y ninguna pantalla del panel debe
  // acabar pidiendole datos al backend (que las rechaza con 403).
  const studio =
    branches.find((b) => b.id === activeId && b.within_plan) ?? null;

  /** Las que el plan dejo fuera. Vacio mientras el plan alcance para todas. */
  const sleeping = branches.filter((b) => !b.within_plan);

  return {
    branches,
    studio,
    sleeping,
    activeId,
    setActiveId,
    maxStudios,
    loaded,
    reload,
  };
}
