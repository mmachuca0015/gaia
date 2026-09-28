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
- **Lugares por fecha** (`services/spots.js`): los lugares libres de una clase
  son `capacity` menos las reservas de **esa fecha**. `schedules.available_spots`
  ya no se usa: era un contador por horario que se acumulaba entre semanas y
  dejaba "llenas" para siempre las clases permanentes. Reservar (con tarjeta o
  con paquete) pasa por `lockSpot`, que bloquea el horario, valida que la clase
  se dé ese día y no sea pasada, y cuenta. `GET /studios/:id/clases` pide
  `?date=` y devuelve lugares y `already_booked` de esa fecha.
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
- **El admin cambia su contraseña en `/admin/cuenta`** (`AdminCuenta.tsx`, misma
  ruta `/users/change-password`). **No tiene recuperación por correo, a
  propósito**: `POST /users/test` ignora a los admins, porque quien se hiciera
  del correo se haría del panel. Si la pierde: `node
  scripts/reset-admin-password.js <correo>` desde `/backend`, con la External
  Database URL de Render en `DATABASE_URL`; da una temporal y cierra sus sesiones.
- **Link compartido de un estudio** (`ShareStudioButton.tsx`): es la página
  `/studios/:id`. Sin sesión, `ProtectedRoute` manda a `/login?redirect=...` y
  `Login.tsx` vuelve ahí tras iniciar sesión o registrarse como alumno. Solo
  acepta rutas internas (`safeRedirect`): no lo relajes o el login se vuelve un
  redirector a cualquier sitio. Dueños y admins ignoran el redirect.

## Modelo de negocio

- **Wellco cobra por dos lados, ambos sobre el PRECIO de la clase** (o del
  paquete), no sobre el total (`backend/routes/payments.js`):
  - **Cargo por servicio de 3%** que paga el **alumno** encima del precio.
    Sustituye a la cuota fija de $3 que pagaba antes.
  - **Comisión de 1.5%** que se le descuenta al **estudio**.
- **Los dos porcentajes viven en la base** (tabla `fee_settings`, una fila, en
  puntos base: 300 = 3%; migración 022) y los edita el admin en
  `/admin/suscripciones` ("Suscripciones y comisiones", `AdminFeesCard.tsx`,
  `PUT /admin/fees`, con pop up de confirmación). Queda anotado en
  `fee_changes`. El backend los lee con `getFees()` (`services/charges.js`,
  cache de 30 s que el cambio limpia) y se los pasa a `splitCharge(base, fees)`.
  En Stripe no hay nada que actualizar: el reparto se calcula en cada
  PaymentIntent. **No vuelvas a escribirlos como constante.**
- **El estudio absorbe la comisión completa de Stripe** (3.6% del total + $3).
- La landing lo anuncia así: "1.5% más la de Stripe (3.6% + $3 MXN)", con el
  porcentaje leído de la API (`Pricing.tsx`). Es lo que paga el estudio; el 3%
  del alumno se ve en el desglose al reservar.

### El reparto, con P = precio y T = P + 3% de P

```
alumno paga       T
Stripe se queda   3.6% de T + $3
Wellco se queda   3% de P + 1.5% de P
estudio recibe    P - 1.5% de P - (3.6% de T + $3)
```

Con una clase de $150: el alumno paga $154.50, Stripe cobra $8.56, Wellco se
queda $6.75 y el estudio recibe $139.19.

**La comisión de Stripe se resta de `transfer_data.amount`.** Es lo menos
obvio del cálculo: Stripe cobra su comisión de la cuenta de la plataforma, no de
la del estudio. Si no se resta ahí, sale del bolsillo de Wellco. No quites esa
resta.

Los dos porcentajes se exponen en `GET /payments/fees` y el
frontend los lee de ahí (`src/lib/fees.ts`, misma fórmula de redondeo que el
backend). **No los escribas también en el frontend**: dos copias acaban
desincronizadas y la pantalla diría un precio distinto al cobrado.

La comisión real de Stripe varía según la tarjeta (internacional, AmEx, etc.),
así que el neto de Wellco es aproximado, no exacto al centavo.

**Cada cobro guarda sus dos cortes** (`service_fee_cents` y `commission_cents`
en `bookings` y `package_purchases`, migración 021). Las métricas del admin
(`FEE_ROWS` en `routes/admin.js`) suman eso, no el total por el porcentaje de
hoy: si cambian los porcentajes, lo ya cobrado no se mueve.

**Los cobros de suscripción** se guardan en `subscription_payments`
(migración 020, lo escribe `invoice.paid`) para la gráfica del admin, que los
muestra **sin IVA** (`net_cents`): el IVA es del SAT, no ingreso. Las facturas
de antes se cargan con `node scripts/backfill-subscription-payments.js`.

### Suscripción de estudios

- Suscripción mensual para estudios: plan Basic ($499 + IVA) y plan Pro ($1,099 + IVA).
  El slug de Basic sigue siendo `light` (ver `migrations/008_plans_basic_pro.sql`)
- **IVA 16% encima del precio del plan.** `price_cents` se guarda **sin IVA**; Stripe
  lo agrega como Tax Rate (`ensureIvaTaxRate`, `inclusive: false`) vía
  `default_tax_rates` en la suscripción. No infles el Price con el 16%: se cobraría
  doble. En pantalla los precios dicen "+ IVA"; el botón de pago muestra el total de
  la factura de Stripe, ya con IVA
- 50% de descuento en el primer mes (`intro_discount`, por plan) — **solo plan mensual**
- 15% de descuento por pagar el año completo (`annual_discount`, por plan; se edita en `/admin/suscripciones`, no en el código)
- **Los dos descuentos no se acumulan**: quien paga anual no recibe el de bienvenida
- Los alumnos no pagan suscripción: solo la clase + el 3% de servicio

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
  - **Bajar de plan pregunta por qué** (tabla `plan_downgrade_reasons`,
    migración 014). Solo al bajar (el plan nuevo cuesta menos), texto libre de
    máximo 500 caracteres y **opcional**: se guarda el renglón aunque venga
    vacío, para saber cuántos bajaron sin contestar, y si el INSERT falla se
    anota en el log sin tirar un cambio de plan que Stripe ya aplicó. Nadie lo
    lee todavía; se consulta a mano.
  - **Antes de confirmar se le enseña a quién le pega.**
    `GET /subscriptions/impact?plan_id=` (`services/planImpact.js`) devuelve
    las sucursales que se dormirían con ese plan, cada una con sus
    reservaciones futuras y sus clases de paquete sin canjear. Sin `plan_id`
    es el impacto de **cancelar**, donde no sobrevive ninguna. Los números
    los cuenta el backend: estimarlos en el cliente sería enseñar cifras que
    no son.
  - **La casilla obligatoria es solo para quedarse con UNA sucursal.**
    `/subscriptions/change-plan` responde 409 (`code: "sucursales_dormidas"`)
    sin `confirm_branches: true` cuando el plan destino tiene
    `max_studios = 1`. Bajar de cinco a tres enseña los mismos números y
    pregunta "¿quieres seguir adelante?", pero no pone tranca: ahí el dueño
    conserva sucursal a donde mover a su gente.
  - **Cancelar sí exige aceptar los reembolsos** (`confirm_refunds`, 409
    `code: "reembolsos_pendientes"`), porque no queda ninguna sucursal en pie
    y no hay a dónde mover a los alumnos que ya pagaron. El reembolso lo pone
    el estudio, no Wellco: la baja es su decisión.
- **Un paquete de una sucursal dormida se canjea en las que sí caben en el
  plan** (`PURCHASE_COVERS_STUDIO` en `services/packages.js`). El alumno pagó
  por unas clases y el estudio sigue existiendo; dejarlas muertas sería
  quedarse con su dinero. Solo se abre mientras la sucursal de la compra esté
  dormida: despierta, el paquete vale únicamente donde se compró, que es lo
  que se vendió.

## Cuando una sucursal deja de operar (`services/closure.js`)

Todo corre **desde el webhook**, cuando el cambio de veras entra, no cuando el
dueño lo confirma: hasta el último día pagado las clases se dan normal. Dos
caminos, y la diferencia es si le queda alguna sucursal.

- **Bajar de plan** (sobrevive al menos una) → `relocateStudents`, desde
  `invoice.paid` con `billing_reason = subscription_cycle`. Nadie pierde
  dinero, se mueve:
  - Las clases sueltas pagadas con tarjeta se le **abonan gratis** al alumno en
    la sucursal que sobrevive (la primera, la que nació con la cuenta).
  - Las que salieron de un paquete se le **regresan al paquete**
    (`classes_used - 1`), que de todos modos ya se canjea allí. No se abonan
    aparte: sería pagarle dos veces la misma clase.
  - La reserva queda en **`reubicada`**, no cancelada: el estudio conserva el
    dinero porque dio otra clase a cambio, así que sigue contando en
    `REVENUE_ROWS`.
- **Cancelar** (no sobrevive ninguna) → `refundStudents`, desde
  `customer.subscription.deleted`. No hay a dónde mover a nadie:
  - Se devuelve el **precio** de la clase, no el total: el alumno **pierde el
    3%** de cargo por servicio, que cobró Wellco y no tuvo que ver con la baja.
  - De un paquete se devuelve lo proporcional a las clases sin usar
    (`unusedPackageCents`): 0 de 4 usadas devuelve todo, 2 de 4 la mitad.
  - `reverse_transfer: true` le saca el dinero a la cuenta del estudio, no al
    bolsillo de Wellco. **No lo quites**: es la misma razón que la resta de
    `transfer_data.amount`.
  - La reserva queda en **`reembolsada`**, que sí sale de `REVENUE_ROWS`.

Otras reglas de esta parte:

- **Un abono es una compra de paquete con `package_id` NULL** (migración 015).
  Reusa el canje, el vencimiento y "Mis paquetes" en vez de una tabla nueva con
  su mecánica a medias. Dura 6 meses (`CREDIT_MONTHS`). No cuenta como venta:
  `REVENUE_ROWS` exige `package_id IS NOT NULL`.
- **Un abono es de UNA clase y vale lo que el alumno pagó** (`price_cents`).
  Uno por clase y no una bolsa de N, porque con clases de precios distintos el
  valor sería un promedio y a alguien le saldría mal la cuenta.
- **Si canjea una clase más cara, paga solo la diferencia**
  (`PURCHASE_DIFFERENCE` en `services/packages.js`, cobrada en
  `/packages/redeem` con el mismo `splitCharge` que todo lo demás). Un paquete
  comprado **nunca** cobra diferencia: cubre sus clases enteras, que es lo que
  se vendió. Si la clase cuesta menos, no se devuelve nada. Una diferencia tan
  chica que al estudio no le quedaría nada tras la comisión de Stripe no se
  cobra: cobrar $1 cuesta más que $1.
- **La comisión de Stripe de un reembolso la absorbe Wellco**, porque de la
  cuenta del estudio solo se puede recuperar lo que recibió, que ya venía sin
  ella. Se guarda en `refunds.stripe_fee_cents` y sale como columna en el Excel
  del admin, para poder medirla y para que cambiar la regla sea mover un
  cálculo y no reconstruir el historial:
  `SELECT SUM(stripe_fee_cents)/100.0 FROM refunds WHERE status = 'hecho';`
- **`bookings` guarda con qué cargo se pagó** (`stripe_payment_intent_id`,
  `price_cents`, `service_fee_cents`). Sin eso una clase suelta no se puede
  reembolsar. Las reservas **anteriores** a la migración 015 lo tienen en NULL
  y van al Excel del admin.
- **La tabla `refunds` existe para no devolver dos veces.** Stripe reintenta
  los webhooks; sin el UNIQUE por reserva y por compra, el segundo intento
  devolvería el dinero otra vez a costa del estudio.
- **Lo que no se puede devolver solo** (cuenta Connect sin saldo, cargo viejo
  sin referencia) se junta y se le manda al admin por correo con un Excel
  adjunto, un renglón por movimiento con el correo del alumno
  (`sendNoFundsReport`). Asunto: `"<estudio>" cancelación de suscripción. Sin
  fondos para reembolsar alumnos.`
- **Las fechas de los correos salen de SQL con `to_char`** en hora de México.
  Un `DATE` que pg convierte a `Date` se corre un día con el servidor en UTC y
  el alumno leería la fecha equivocada.
- **Qué estudios se publican** (`backend/services/catalog.js`,
  `STUDIO_PUBLISHED`): `activa` sí; `pendiente` y `vencida` solo hasta
  `paid_until`; `cancelada` no; sin fila (heredados) sí. Si no se publica, no
  sale en `GET /studios` y `/payments/charge` rechaza la reserva.
- **Sucursales por plan** (`plans.max_studios`, Basic 1 y Pro 3 de arranque):
  el número lo edita el admin en `/admin/suscripciones`, no el código, y es el
  mismo que muestran la landing y el registro (`branchesFeature` en
  `src/lib/plans.ts`). **No escribas "3 sucursales" como fila de
  `plan_features`**: el texto a mano se queda viejo en cuanto se mueve el
  límite. La migración 013 borró las que había.
- **Las sucursales que no caben en el plan se duermen, no se borran.** Caben
  las primeras `max_studios` **por antigüedad**, así que la que sobrevive a una
  baja de Pro a Basic es la que nació con la cuenta. Es un cálculo
  (`STUDIO_WITHIN_PLAN`), no una columna ni un interruptor: volver a Pro las
  despierta solas y no hay estado que se desincronice del plan. Una dormida
  conserva clases, reservas, paquetes e ingresos, pero sale del catálogo y
  `requireStudioOwner` rechaza sus rutas (403). La única excepción es `DELETE
  /studios/mine/:id` (`allowSleeping`): borrar la despierta es como el dueño se
  queda con otra que no sea la primera.
- **Horario y "Abierto/Cerrado"**: tabla `studio_hours` (un rango por día,
  `day` 0 = domingo, sin cruzar medianoche; migración 010). Se pide al
  registrar el estudio y se edita en Estudio > General (`PUT
  /studios/:id/hours`). `open_now` (`STUDIO_OPEN_NOW`) se calcula con la hora
  de México; los estudios sin horario caen al interruptor viejo
  `studios.is_open`. Usa `open_now`, no `is_open`.
- **"Desde $X / clase"** del catálogo y favoritos es `min_price`
  (`STUDIO_PRICE_FROM` en `services/catalog.js`): la clase más barata con
  horario, calculada en cada consulta. La columna `studios.price_from` es un
  número fijo que nadie actualiza; no la uses para mostrar precios.
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

## Cambio de plan desde el admin (migración 019)

- Tres puntos en la fila de `/admin/estudios` -> **Cambiar plan**
  (`AdminPlanModal.tsx`), rutas `GET`/`POST /admin/studios/:id/plan`. Lo hace
  soporte, no el dueño: para ayudar a un estudio o arreglarle una situación.
- **Pasa por las mismas funciones que el cambio del dueño**
  (`services/subscriptionPlan.js`: `loadOwnerSubscription`, `setStripePlan`).
  Se sacaron de `routes/subscriptions.js` para no tener dos copias que un día
  se separen.
- **Dos formas de aplicarlo, no una fecha libre:**
  - *Al terminar su periodo* (lo normal): `setStripePlan` con
    `proration_behavior: "none"` y `pending_plan_id`. Idéntico al cambio del
    dueño; el periodo pagado se respeta y `plan_id` solo lo mueve el webhook.
  - *Inmediato*: `proration_behavior: "create_prorations"`. Stripe abona lo
    que no se usó del plan anterior y cobra lo que queda del nuevo, y la
    diferencia sale en el **siguiente recibo**. No se cobra la tarjeta en ese
    momento a propósito: es soporte, y un cargo que falla dejaría la
    suscripción en `past_due` justo ahí.
- **Un cambio inmediato que duerme sucursales llama a `relocateStudents` en la
  ruta**, no en el webhook: las sucursales se duermen en cuanto cambia
  `plan_id`, y sin eso quedarían alumnos con reservas en una sucursal que ya
  no le aparece a nadie.
- **Las cuentas demo no se pueden cambiar** (`blockedReason`), ni las
  heredadas, ni una suscripción que no esté `activa`, ni una ya programada
  para terminar. El menú lo esconde y la ruta lo vuelve a comprobar: el pop up
  puede llevar minutos abierto.
- Antes de confirmar enseña a quién le pega (`sleepingImpact`, el mismo del
  dueño) y exige la casilla si alguna sucursal se duerme.
- **Al estudio le llega un correo** (`services/planChangeEmail.js`) con el
  monto (sin IVA, como se guarda), lo que incluye el plan y la fecha del
  próximo cobro. Volver al plan actual (cancelar un cambio programado) no
  manda nada: no cambió de plan.
- Queda anotado en `admin_plan_changes` (quién, de qué plan a cuál, cómo se
  aplicó y un motivo opcional). Nadie lo lee todavía; se consulta a mano.
- **Los correos comparten `services/mailer.js`** (remitente, plantilla, fechas
  en español y el envío). Ahí se corrigió que el SDK de Resend **no lanza**
  cuando el envío falla, devuelve `{ error }`: antes un correo rechazado se
  anotaba como enviado.
- La columna **Plan** de `/admin/estudios` era el texto fijo `'Sin plan'` para
  todos. Ahora sale de `subscriptions` + `plans`; sin fila dice "Heredado".

## Paquetes de clases

- **Dueño:** `/owner/paquetes` (`OwnerPaquetes.tsx`), rutas `ownerRouter` de
  `backend/routes/packages.js` montadas bajo `/studios`. **Alumno:** los
  compra en la pestaña Paquetes de cada estudio (`components/StudioPackages.tsx`
  dentro de `EstudioDetalle.tsx`) y ve los suyos en `/mis-paquetes`
  (`pages/Dashboard/MisPaquetes.tsx`); rutas `userRouter` en `/packages`. No
  hay catálogo global: `GET /packages` exige `studio_id`. Esquema en
  `migrations/009_packages.sql`; reglas en `services/packages.js`.
- Un paquete tiene dos tiempos distintos, no los confundas:
  - **Periodo de venta** (`sale_starts_on`/`sale_ends_on`, o las dos nulas =
    indefinido). Al terminar deja de venderse pero **no se borra**: el dueño lo
    ve opaco y lo puede editar. Solo el indefinido se puede **desactivar**
    (`is_active`). Estado en `PACKAGE_STATUS`; "hoy" es hora de México
    (`TODAY_MX`), porque la base de Render corre en UTC.
  - **Duración** (`validity_value` + `validity_unit`: 7 o 15 días, 1 a 12
    meses): cuánto tiene el alumno para usarlo desde que lo compra.
- Borrar = `deleted_at`. Editar o borrar **nunca afecta lo ya vendido**: la
  compra (`package_purchases` + `package_purchase_classes`) **copia** clases,
  tipo, precio y vence al pagar. El canje lee la copia, no el paquete.
- **Canje** (`usablePurchases`): mismo alumno, le quedan clases, la clase es
  antes del vencimiento, **mismo estudio donde se compró**, clase en la lista
  (o `any_class`) y horario permanente si es `permanent_only`.
  `POST /packages/redeem` bloquea la compra con `FOR UPDATE` para que dos
  reservas no gasten la misma última clase.
- **Cobro:** mismo reparto que una clase (`splitCharge` en
  `services/charges.js`, que usa también `/payments/charge`): el alumno paga el
  precio (el de descuento si hay) + 3%. Mismas reglas demo que las reservas.
- **Métricas:** el dinero de un paquete cuenta al comprarlo. Una reserva hecha
  con paquete (`bookings.package_purchase_id`) **no** suma ingreso, o se
  contaría dos veces. Todo pasa por `REVENUE_ROWS` (`services/revenue.js`).

## Avisos a los alumnos (migración 017)

- **Dueño:** `/owner/avisos` (`OwnerAvisos.tsx`). **Alumno:** `/notificaciones`
  (`pages/Dashboard/Notificaciones.tsx`). Rutas en `backend/routes/notices.js`:
  `ownerRouter` bajo `/studios` (`GET`/`POST /studios/:id/avisos`) y
  `userRouter` en `/notificaciones`. Reglas en `services/notices.js`.
- **Es una caracteristica del plan** (`plans.notices`, migración 018: hoy solo
  Pro). El permiso vive en la base y lo prende el admin en
  `/admin/suscripciones`, no el código, igual que `max_studios`. El backend lo
  resuelve con `ownerNotices` (`services/catalog.js`) y las dos rutas del dueño
  responden 403 `code: "plan_sin_avisos"` sin él; el panel esconde la pestaña
  leyendo `notices` de `GET /subscriptions/me`. **El candado va en la ruta, no
  solo en el menú**: esconder la pestaña evita el clic, no la URL.
  - Un dueño **heredado** (sin fila en `subscriptions`) los conserva, como en
    todo lo demás: el COALESCE cae al plan activo más generoso.
  - La línea "Avisos a tus alumnos" de la landing y del registro la arma
    `planFeatureLines` (`src/lib/plans.ts`) con la columna. **No la escribas
    como fila de `plan_features`**: es el mismo error que "3 sucursales" de la
    migración 013, y la 018 borró la que había.
- **Quien los recibe son los favoritos de ESA sucursal**, no de la cuenta: los
  favoritos son por estudio y un aviso de Providencia no le sirve a quien va a
  Chapalita. La pantalla usa `BranchTabs` como el resto del panel.
- **No son correo.** Se guardan y el alumno los ve dentro de la app. Asi no
  hay que darle de baja de nada ni arriesgar que marquen a Wellco como spam.
- Solo se ve lo mandado **despues** de que agrego el estudio a favoritos
  (`n.created_at >= f.created_at`) y de los **ultimos 30 días**: quien marca un
  estudio hoy no tiene por que enterarse del cambio de horario de la semana
  pasada.
- **Maximo 500 caracteres**, en el CHECK de la tabla y en la ruta; el contador
  del frontend lee `NOTICE_MAX` de `src/lib/notices.ts`.
- **Tope de 5 avisos por sucursal cada 24 horas** (`DAILY_LIMIT`, 429). No es
  regla de negocio, es freno: el alumno no se puede dar de baja de los avisos
  sin quitar el estudio de favoritos, y el estudio que manda veinte se queda
  sin seguidores.
- `studio_notices.recipients` se cuenta **al mandarlo**, no al leerlo: los
  favoritos cambian y contarlos hoy diria a cuantos les llegaria ahora.
- Lo sin leer es una sola fecha, `users.notices_seen_at`, no una fila por aviso
  leido: lo unico que se necesita es el **punto rojo** del menu (sidebar y
  `BottomNav`), que sale de `GET /notificaciones/unread`.
- **El punto se pregunta cada minuto** (`POLL_MS` en `src/lib/notices.ts`),
  al entrar a cada pantalla y al volver a la pestaña del navegador; con la
  pestaña escondida no se pregunta nada. Al abrir Notificaciones se apaga al
  momento por el evento `wellco:avisos` (`noticesChanged`), sin esperar al
  siguiente sondeo: el proyecto no usa librerias de estado global.

## Panel de control del dueño (`PanelControl.tsx`)

- Ingresos = `REVENUE_ROWS`: reservas `activa` **y** `pasada` (solo activas
  hacía desaparecer el ingreso al terminar la clase) + paquetes vendidos.
- Periodos en `PERIODS` (`services/revenue.js`), en **hora de México**. El
  total y la gráfica usan el mismo inicio; la gráfica rellena con ceros
  (`generate_series`) para que un periodo sin ventas no quede en blanco.
- "Clases de hoy" cuenta lo ocupado con las reservas de la fecha de hoy.
  **No uses `schedules.available_spots` para eso**: es un solo contador por
  horario que se acumula entre semanas en las clases permanentes.
- Actividad reciente: reservas, compras de paquete y favoritos de los últimos
  7 días, de 20 en 20 con cursor (`?before=` = `cursor` del último, la fecha
  como texto con microsegundos). El panel se refresca solo cada minuto y al
  volver a la pestaña; el refresco agrega arriba lo nuevo sin perder lo ya
  cargado.

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
