// Cliente HTTP unico de la app.
//
// Dos razones para que todo pase por aqui:
//   1. `credentials: "include"` manda la cookie de sesion en cada peticion.
//      Sin esto el backend no reconoce al usuario, porque la cookie es
//      httpOnly y JavaScript no puede adjuntarla a mano.
//   2. La URL del backend sale de una variable de entorno, no hardcodeada,
//      para que el build de produccion apunte al dominio real.

const BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/$/, "");

// Datos de presentacion del usuario (nombre, rol...). NO son una credencial:
// el backend nunca los mira. Solo evitan un parpadeo mientras /users/me
// responde. Si alguien los manipula, el servidor lo rechaza igual.
const USER_KEY = "user";

export type Role = "user" | "owner" | "admin";

export interface SessionUser {
  id: number;
  name: string;
  last_name: string;
  email: string;
  role: Role;
  state?: string;
  country?: string;
  stripe_customer_id?: string | null;
  /** Cuenta de demostracion: sus reservas en estudios demo no se cobran. */
  is_demo?: boolean;
}

export function getCachedUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem("role", user.role);
}

export function clearCachedUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("role");
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions extends RequestInit {
  /** No redirigir al login si la respuesta es 401 (util en /users/me). */
  silent401?: boolean;
}

export async function api(path: string, options: ApiOptions = {}) {
  const { silent401, headers, body, ...rest } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    ...(body != null ? { body } : {}),
    // La cookie httpOnly viaja aqui. Es lo que autentica la peticion.
    credentials: "include",
    headers: {
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  });

  // Sesion vencida o revocada: se limpia el cache local y se manda al login.
  if (response.status === 401 && !silent401) {
    clearCachedUser();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
}

/** Igual que `api`, pero devuelve el JSON y lanza ApiError si falla. */
export async function apiJson<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const response = await api(path, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || "Error del servidor";
    throw new ApiError(message, response.status);
  }

  return data as T;
}

/** Pregunta al backend quien es el usuario de la sesion. null si no hay. */
export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const response = await api("/users/me", { silent401: true });
    if (!response.ok) {
      clearCachedUser();
      return null;
    }
    const user = (await response.json()) as SessionUser;
    setCachedUser(user);
    return user;
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await api("/users/logout", { method: "POST" });
  } finally {
    clearCachedUser();
  }
}
