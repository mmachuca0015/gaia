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

- **Comisión total del 7.2%, partida en dos mitades, ambas sobre el TOTAL de la
  transacción** (precio de la clase + cuota fija), no sobre el precio de la clase:
  - 3.6% se lo queda Stripe. Lo descuenta de la cuenta de la plataforma.
  - 3.6% es la comisión de Wellco (`COMMISSION_RATE` en `backend/routes/payments.js`).
  - Si ves `0.036` en el código, **no es un error ni está a la mitad**. No lo
    "corrijas" a `0.072`: duplicarías el cobro.
- **Cuota fija de $3 MXN por transacción** (`TRANSACTION_FEE_CENTS`), que paga el
  **cliente** encima del precio de la clase. Cubre el cargo fijo de Stripe.
  - Es **por transacción, no por clase**. Hoy cada reserva es su propio cobro,
    así que coincide; si algún día se reservan varias clases en un solo pago, la
    cuota debe sumarse **una sola vez**.

### El reparto, con T = precio + $3

```
cliente paga      T
Stripe se queda   3.6% de T + $3
Wellco se queda   3.6% de T
estudio recibe    el resto = precio - 7.2% de T
```

Con una clase de $150: el cliente paga $153.00, el estudio recibe $138.98,
Stripe cobra $8.51 y a Wellco le quedan **$5.51 netos, justo el 3.6% de T**.

**La parte porcentual de Stripe se resta de `transfer_data.amount`.** Es lo menos
obvio del cálculo: Stripe cobra su comisión de la cuenta de la plataforma, no de
la del estudio. Si no se resta ahí, sale del bolsillo de Wellco y su comisión
neta queda en **cero**. No quites esa resta.

El monto de la cuota se expone en `GET /payments/fees` y el frontend lo lee de
ahí (`src/lib/fees.ts`). **No lo escribas también en el frontend**: dos copias
acaban desincronizadas y la pantalla diría un precio distinto al cobrado.

La comisión real de Stripe varía según la tarjeta (internacional, AmEx, etc.),
así que el neto de Wellco es aproximado, no exacto al centavo.
- Suscripción mensual para estudios: plan Light y plan Pro
- 50% de descuento en el primer mes (`intro_discount`, por plan) — **solo plan mensual**
- 25% de descuento por pagar el año completo (`annual_discount`, por plan; se edita en `/admin/suscripciones`, no en el código)
- **Los dos descuentos no se acumulan**: quien paga anual no recibe el de bienvenida
- Gratis para los clientes que reservan

**La comisión por transacción no se menciona en la landing** — es una decisión
de producto, no un olvido. Se habla de ella en el demo.

## Suscripciones (leer antes de tocar precios o el registro de estudios)

- **Los precios NO están en el código.** Viven en la tabla `plans` y los leen
  la landing (`Pricing.tsx`), el paso de plan del registro (`PlanPicker.tsx`) y
  el panel de admin (`AdminSuscripciones.tsx`), todos vía `src/lib/plans.ts`.
  Cambiar un precio en `/admin/suscripciones` mueve las tres vistas sin desplegar.
- `price_cents` es un **entero en centavos**. Nunca NUMERIC ni float: así cobra
  Stripe y así no aparecen los 198.99999.
- Las características son filas en `plan_features`, no un array, porque el admin
  las agrega y quita de una en una.
- **Un dueño no puede crear perfil sin plan.** `POST /studios/register-studio`
  exige `plan_id`, lo valida contra la base (que exista y esté activo) y crea la
  fila de `subscriptions` dentro de la misma transacción que el dueño y el estudio.
- **El cobro es dentro de la app, no con Checkout hospedado.** `POST
  /subscriptions/payment-intent` crea la suscripción en Stripe con
  `payment_behavior: "default_incomplete"` y devuelve un `clientSecret`; el
  `PaymentElement` de `SubscriptionPayment.tsx` lo confirma con
  `redirect: "if_required"`. Solo se sale de la app si el banco pide 3D Secure.
- `save_default_payment_method: "on_subscription"` es lo que **deja la tarjeta
  guardada** para el cobro automático del siguiente periodo. Si se quita, la
  renovación falla y la suscripción cae a `vencida`.
- Si ya hay un `stripe_subscription_id` en estado `incomplete`, el endpoint
  **reusa** su client secret en vez de crear otra. Sin eso, cada recarga o
  reintento dejaba suscripciones a medio pagar en Stripe.
- La suscripción nace en `pendiente`. **Solo el webhook la pasa a `activa`**
  (evento `invoice.paid`), nunca el frontend: que el navegador confirme no
  prueba que el cobro cerró, y el cobro puede cerrar aunque cierren la pestaña.
- En la API 2026-04 **`invoice.payment_intent` ya no existe**: el secreto está en
  `invoice.confirmation_secret`. `extractClientSecret` prueba las dos formas.
- El webhook se monta en `index.js` **antes de `express.json`** y con
  `express.raw`. La firma se calcula sobre los bytes exactos que mandó Stripe;
  parsearlos la invalida. Si mueves ese `app.post`, se rompe.
- Un Price de Stripe es inmutable. `ensureStripePrice` crea uno nuevo cuando el
  monto de la base ya no coincide y desactiva el viejo, sin borrarlo: las
  suscripciones vigentes lo siguen necesitando.
- Los dueños registrados **antes** de que existieran los planes no tienen fila en
  `subscriptions`. `GET /subscriptions/me` los reporta como `heredada` y no se
  les bloquea nada. No conviertas eso en un bloqueo sin migrarlos primero.
- Cada plan tiene **dos Prices en Stripe**: mensual (`stripe_price_id`) y anual
  (`stripe_price_id_year`). `ensureStripePrice(plan, interval)` los crea a demanda.
- `subscriptions.billing_interval` recuerda cómo se contrató. Sin eso, al renovar
  no habría forma de saber si toca cobrar el mes o el año.
- **El total anual lo calcula SQL**, no el frontend (`annual_price_cents` en
  `PLANS_QUERY`). Es el mismo número que se le manda a Stripe, así que lo que se
  muestra no puede diferir de lo que se cobra. No lo recalcules en el cliente.
- Un plan con suscripciones no se borra, se desactiva (`is_active = false`).
- **Cancelar y cambiar de plan nunca surte efecto al momento** (pantalla
  `/owner/estudio/suscripcion`, rutas `/subscriptions/cancel`, `/resume` y
  `/change-plan`). El periodo pagado se respeta completo:
  - Cancelar pone `cancel_at_period_end` en Stripe. La suscripción sigue
    `activa` hasta `current_period_end`; ahí Stripe la borra y el webhook
    `customer.subscription.deleted` la pasa a `cancelada`.
  - Cambiar de plan cambia el precio en Stripe **con `proration_behavior:
    "none"`** (no hay cobro extra; el precio nuevo sale en la renovación) y
    guarda el plan en `pending_plan_id`. `plan_id` solo cambia en el
    `invoice.paid` con `billing_reason = subscription_cycle`. No muevas
    `plan_id` antes: el dueño ya pagó el periodo del plan anterior.
  - Cancelar deshace un cambio de plan programado.
- **Qué estudios se publican** (`backend/services/catalog.js`,
  `STUDIO_PUBLISHED`): `activa` sí; `pendiente` y `vencida` solo hasta
  `paid_until`; `cancelada` no; sin fila (heredados) sí. Si no se publica, no
  sale en `GET /studios` y `/payments/charge` rechaza la reserva.
- **`paid_until` ≠ `current_period_end`.** `paid_until` es el último día
  cubierto por un cobro exitoso y lo escribe `invoice.paid` con el fin del
  periodo de las líneas de la factura (no `invoice.period_end`, que en una
  renovación apunta al periodo anterior). `current_period_end` lo avanza
  Stripe aunque la renovación falle; no lo uses para decidir visibilidad.
- **Un estudio cancelado sigue entrando a su cuenta** y elige plan de nuevo
  (`POST /subscriptions/select-plan`, solo con status `cancelada`) antes de
  pagar por `/payment-intent`. Quien ya pagó alguna vez (`started_at` no nulo)
  **no** recibe bienvenida ni cupón al volver.
- Si una renovación falla (`past_due`/`unpaid`), `/payment-intent` cobra la
  factura abierta de esa misma suscripción. No crea otra: cobraría dos veces.

## Cuentas demo (leer antes de tocar el catálogo o `/payments/charge`)

- `studios.is_demo` y `users.is_demo`. Se activan con el interruptor "Demo" en
  `/admin/estudios` y `/admin/usuarios` (`PATCH /admin/{studios|users}/:id/demo`).
  Un dueño es demo por su estudio.
- **Un estudio demo solo existe para los usuarios demo**: catálogo, detalle,
  clases y favoritos responden como si no existiera para cualquier otro
  visitante (`studioVisibleTo` y `viewerIsDemo` en `services/catalog.js`,
  `demoHiddenFrom` en `routes/studios.js`). Lo decide el servidor con la sesión
  (`optionalAuth`); no hay código secreto que se pueda filtrar.
- **Usuario demo + estudio demo = reserva sin Stripe** (`simulated` en
  `/payments/charge`). Cualquier mezcla se rechaza: un usuario demo no reserva
  en estudios reales. No relajes eso: con llaves live el cobro sería real.
- El estudio demo no tiene suscripción: `/subscriptions/me` responde `demo` y
  las rutas de cobro, cancelación y cambio de plan lo rechazan.
- Las reservas de estudios demo no cuentan en `/admin/metrics` ni `/admin/charts`.

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
- `services/stripePlans.js` — puente con Stripe: crea Products, Prices y el cupón de bienvenida
- `routes/plans.js` — lectura pública de planes y CRUD del admin
- `routes/subscriptions.js` — cobro, estado, cancelación, cambio de plan y el webhook de Stripe
- `services/catalog.js` — qué estudios están publicados para los clientes
- `migrations/` — SQL versionado; se aplica con `node migrations/run.js`
- `index.js` — archivo principal del backend

### Frontend (`/src`)

- `assets/` — imágenes e iconos del proyecto
- `components/` — componentes de React/TypeScript reutilizables
- `data/` — datos estáticos (por ejemplo, estados de México para formularios)
- `lib/api.ts` — cliente HTTP único (cookie de sesión + URL base). Todas las llamadas pasan por aquí.
- `lib/stripe.ts` — instancia única de Stripe.js, compartida por `main.tsx` y el `<Elements>` anidado del pago de suscripción
- `lib/plans.ts` — tipos y cálculos de planes; única fuente para landing, registro y admin
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

- Frontend (`.env`): `VITE_API_URL`, `VITE_STRIPE_PUBLIC_KEY`, `VITE_CLOUDINARY_*`, `VITE_DEMO_BOOKING_URL`
- `VITE_DEMO_BOOKING_URL` es la página de reservas de Google Calendar (cuenta de Google creada con el correo de Zoho de `wellcoapp.com`). Si está vacía, `DemoCta.tsx` vuelve a pedir el correo para la waitlist. Como Vite la integra al compilar, cambiarla en Render exige reconstruir `wellco-web`.
- Backend (`backend/.env`, ver `backend/.env.example`): `DB_*`, `PORT`, `NODE_ENV`, `FRONTEND_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- En producción: `NODE_ENV=production` (activa la cookie `Secure`) y `FRONTEND_URL` con el dominio real (controla CORS y los enlaces de los correos).
