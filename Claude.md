# wellco — Contexto del proyecto

## Qué es

Marketplace de reservas full-stack que conecta estudios de ejercicio con usuarios finales.

Historial de nombres: GAIA Wellness -> GAIA -> PILA -> **wellco** (nombre actual, desde septiembre de 2025). La carpeta del repo sigue llamandose `GAIA` y `package.json` ya dice `wellco`.

## Stack

- **Frontend:** React + TypeScript, Vite
- **Backend:** Node.js / Express
- **Base de datos:** PostgreSQL (local, puerto 5433)
- **Estilos:** Tailwind CSS
- **Ruteo:** React Router
- **Pagos:** Stripe, incluyendo Stripe Connect para el onboarding de estudios
- **Imágenes:** Cloudinary
- **Emails:** Resend
- **Mapas:** Leaflet / OpenStreetMap
- **Autocompletado de CP:** API de Zippopotam

## Roles de usuario

1. **Cliente** — Explorar estudios, ver detalle de estudio (calendario semanal + mapa), flujo de reserva con Stripe, Mis Clases, Favoritos, Perfil (privacidad y pagos)
2. **Dueño de estudio** — Panel de control con gráficas (Chart.js), gestión de clases (horario permanente o de una sola vez), gestión de instructores, subida de imágenes vía Cloudinary, onboarding de Stripe Connect, vista de reservaciones
3. **Admin** — Login propio, dashboard con 4 gráficas Chart.js, tabla paginada de estudios

## Decisiones de arquitectura importantes

- Campos de dirección estructurados (no un solo string de dirección)
- Contraseñas con bcrypt (12 rondas)
- Las reservas usan `class_date` como campo de fecha
- `schedules.day` son enteros, donde 0 = domingo
- Job de `node-cron` corre cada hora para marcar reservas pasadas
- Sistema de login en tres tablas secuenciales (`users`, `studio_owners`, `admins`) — revisar antes de tocar el flujo de auth

## Autenticación (leer antes de tocar cualquier ruta)

- **La sesión vive en el servidor**, en la tabla `sessions`. La cookie `pila_session` lleva un token opaco aleatorio; en la base de datos solo se guarda su hash SHA-256. Se puede revocar al instante (a diferencia de un JWT).
- Cookie `httpOnly` + `sameSite=lax` + `secure` en producción. JavaScript no puede leerla, así que un XSS no roba la sesión, y el navegador no la manda en POST cross-site, lo que corta CSRF.
- **Ninguna ruta debe leer el id del usuario del body, del query o de un parámetro.** El id autoritativo es `req.user.id`, que pone `requireAuth` a partir de la cookie. Lo mismo aplica a montos: el precio de una clase se lee de la base de datos, nunca del cliente.
- **Los ids se repiten entre tablas**: `users.id = 7` y `studio_owners.id = 7` son cuentas distintas. Toda comprobación de propiedad debe fijar **rol + id**, nunca solo el id.
- Middleware en `backend/middleware/auth.js`: `requireAuth`, `requireRole(...roles)`, `requireStudioOwner(param)`.
- `localStorage` guarda solo datos de presentación (nombre, rol) para evitar un parpadeo en la interfaz. **No es una credencial**: el backend nunca lo mira. `ProtectedRoute` confirma la sesión contra `GET /users/me`.
- Todo el frontend habla con el backend por `src/lib/api.ts`, que añade `credentials: "include"` (sin eso la cookie no viaja) y la URL base desde `VITE_API_URL`. No usar `fetch` directo.
- Cambiar correo o contraseña exige la contraseña actual **en la misma petición**. Cambiar la contraseña cierra todas las demás sesiones.

## Modelo de negocio

- Comisión del 7.2% por transacción (incluye el procesamiento de Stripe)
- Suscripción mensual para estudios: plan Light y plan Pro
- Gratis para los clientes que reservan

**Ojo:** los precios que se muestran en `src/pages/Landing/components/Pricing.tsx`
($199 Light / $399 Pro) y sus listas de features son PLACEHOLDER, puestos solo
para ver el diseño. Faltan los definitivos.

- El plan anual aplica 15% de descuento (`ANNUAL_DISCOUNT` en `Pricing.tsx`). El
  precio grande siempre se muestra por mes; el total anual va en la línea de abajo.
- **La comisión por transacción no se menciona en la landing** — es una decisión
  de producto, no un olvido. Se habla de ella en el demo.

## Diseño / branding

Paleta azul apagada. Sustituye al beige/verde anterior.

- Tipografía de encabezados: Cormorant Garamond (serif), a menudo en itálica para el acento
- Tokens de Tailwind v4 definidos en `src/index.css` con `@theme`:
  - `ink` `#1b2c44` — azul marino desaturado; texto principal y botones primarios
  - `ink-soft` `#33506f` — hover de los botones primarios
  - `paper` `#ffffff` — fondo base
  - `surface` `#f4f7fa` — fondo de secciones alternas, con tinte azul
  - `line` `#e0e7ef` — bordes
- Se usan como `bg-ink`, `text-ink`, `bg-surface`, `border-line`, y admiten
  opacidad (`bg-ink/5`)
- Los grises son la escala `slate` de Tailwind (tiene tinte azul), no `neutral`
  ni `stone`. Texto secundario: `text-slate-500`; texto tenue: `text-slate-400`
- El ámbar (`#faeeda`, `amber-50/700`) se conserva: señala estado, no marca

Toda la app está migrada (landing, dashboards, panel de dueño, admin, auth). Ya
no queda beige ni verde, y las variables `--gaia-*` se eliminaron de
`src/index.css` porque nadie las usaba.

**Cursivas:** los `h1` de la app ("Hola, *nombre*") van en redonda; la cursiva
de Cormorant solo se usa como acento en la landing, que es material de
marketing. Si migras una pantalla nueva, no le pongas `italic` al encabezado.

## Estructura de carpetas

### Backend (`/backend`)

- `routes/` — archivos separados por rol o función
- `db.js` — conexión a la base de datos
- `hash.js` — configuración de bcrypt para el hash de contraseñas
- `auth/sessions.js` — creación, lectura y revocación de sesiones
- `middleware/auth.js` — `requireAuth`, `requireRole`, `requireStudioOwner`
- `migrations/` — SQL versionado; se aplica con `node migrations/run.js`
- `index.js` — archivo principal del backend

### Frontend (`/src`)

- `assets/` — imágenes e iconos del proyecto
- `components/` — componentes de React/TypeScript reutilizables
- `data/` — datos estáticos (por ejemplo, estados de México para formularios)
- `lib/api.ts` — cliente HTTP único (cookie de sesión + URL base). Todas las llamadas pasan por aquí.
- `layouts/` — layouts usados en el proyecto
- `pages/` — páginas: dashboard, login, landing, panel del dueño de estudio, panel de administrador, reset password
- `pages/Landing/components/` — secciones de la landing: `Header`, `Hero`, `ForClients`, `ForOwners`, `Comparison`, `Pricing`, `DemoCta`, `Footer`
- `pages/Landing/components/previews/` — renders de la app hechos con markup (no son capturas): `BrowserFrame`, `UserAppPreview`, `OwnerAppPreview`. Si cambia el UI real de `Explorar.tsx` o `PanelControl.tsx`, hay que actualizarlos a mano
- `App.tsx` — reúne todas las rutas del proyecto
- `main.tsx` — archivo principal de React

## Convenciones de código

- No se usa ninguna librería/patrón de manejo de estado (sin Redux, Context API global, Zustand, etc.)

## Comandos útiles

- **Frontend:** `npm run dev` (dentro de la carpeta del frontend)
- **Backend:** `nodemon index.js` (dentro de `/backend`)
- **Migraciones:** `node migrations/run.js` (dentro de `/backend`)

## Variables de entorno

- Frontend (`.env`): `VITE_API_URL`, `VITE_STRIPE_PUBLIC_KEY`, `VITE_CLOUDINARY_*`
- Backend (`backend/.env`, ver `backend/.env.example`): `DB_*`, `PORT`, `NODE_ENV`, `FRONTEND_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`
- En producción: `NODE_ENV=production` (activa la cookie `Secure`) y `FRONTEND_URL` con el dominio real (controla CORS y los enlaces de los correos).
