// Las sucursales del dueño. Cada una es un estudio: su direccion, su horario,
// sus clases y sus imagenes. Lo que las agrupa es la cuenta del dueño, y
// cuantas puede tener lo dice su plan (Basic 1, Pro 3).
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
