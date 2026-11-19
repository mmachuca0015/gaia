// Dinero de Wellco (la cuenta de plataforma) en Stripe, para /admin/fondos.
//
// Es la contraparte de "Tu dinero" del dueño (GET /payments/balance), pero
// sobre la cuenta propia, no sobre una Connect: saldo, siguiente deposito
// automatico y los depositos de Stripe al banco de los ultimos 90 dias. Los
// cobros no van aqui: ya salen en /admin/pagos y /admin/clases-pagadas.
//
// Se le pregunta a Stripe en cada peticion y no se guarda nada. El saldo
// minimo y el calendario de depositos se leen de Balance Settings de Stripe
// (Configuracion > Depositos): si cambian alla, la pantalla dice lo nuevo sin
// desplegar.
const { stripe } = require("./stripe");

const HISTORY_DAYS = 90;
const HISTORY_MAX = 500;
// Ventana para estimar lo que se libera antes del siguiente deposito. Stripe
// retiene un cobro a lo mucho 31 dias (`delay_days`), asi que nada pendiente
// es mas viejo que eso.
const PENDING_WINDOW_DAYS = 35;
const TZ = "America/Mexico_City";

const WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function mxn(list) {
  return (list ?? [])
    .filter((b) => b.currency === "mxn")
    .reduce((sum, b) => sum + b.amount, 0);
}

/** Fecha de hoy en Mexico como {y, m, d} (m de 1 a 12). */
function todayMx(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })
    .format(now)
    .split("-")
    .map(Number);
  return { y, m, d };
}

function sameDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Siguiente dia de deposito automatico segun el calendario de Stripe, como
 * fecha UTC a medianoche (solo importa el dia). Si hoy toca y Stripe todavia
 * no creo el deposito de hoy, es hoy; si ya lo creo, el siguiente.
 * `manual` o sin calendario: null.
 */
function nextPayoutDay(schedule, payouts) {
  if (!schedule?.interval || schedule.interval === "manual") return null;

  const { y, m, d } = todayMx();
  const today = new Date(Date.UTC(y, m - 1, d));
  const createdToday = payouts.some(
    (p) => p.automatic && sameDay(new Date(p.created * 1000), today),
  );

  const matches = (date) => {
    if (schedule.interval === "daily") return true;
    if (schedule.interval === "weekly") {
      const days = (schedule.weekly_payout_days ?? []).map(
        (w) => WEEKDAY_INDEX[w],
      );
      return days.includes(date.getUTCDay());
    }
    if (schedule.interval === "monthly") {
      // Los dias 29 a 31 caen al ultimo dia de los meses cortos.
      const last = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      return (schedule.monthly_payout_days ?? []).some(
        (n) => Math.min(n, last) === date.getUTCDate(),
      );
    }
    return false;
  };

  for (let i = createdToday ? 1 : 0; i <= 62; i++) {
    const date = new Date(today.getTime() + i * 86400000);
    if (matches(date)) return date;
  }
  return null;
}

/** "BBVA ···1234". Sin banco expandido (o con tarjeta), lo que haya. */
function destinationLabel(dest) {
  if (!dest || typeof dest !== "object") return null;
  const last4 = dest.last4 ? `···${dest.last4}` : "";
  return [dest.bank_name || dest.brand, last4].filter(Boolean).join(" ") || null;
}

async function platformFunds() {
  const now = Math.floor(Date.now() / 1000);

  const [balance, settings, payouts, pendingTxs] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.balanceSettings.retrieve(),
    stripe.payouts
      .list({
        created: { gte: now - HISTORY_DAYS * 86400 },
        limit: 100,
        expand: ["data.destination"],
      })
      .autoPagingToArray({ limit: HISTORY_MAX }),
    stripe.balanceTransactions
      .list({ created: { gte: now - PENDING_WINDOW_DAYS * 86400 }, limit: 100 })
      .autoPagingToArray({ limit: 5000 }),
  ]);

  const payoutCfg = settings.payments?.payouts ?? null;
  const schedule = payoutCfg?.schedule ?? null;
  // Stripe lo guarda en la unidad minima (centavos), igual que los saldos.
  const minimumCents = payoutCfg?.minimum_balance_by_currency?.mxn ?? null;

  const availableCents = mxn(balance.available);
  const inTransitCents = payouts
    .filter((p) => p.status === "pending" || p.status === "in_transit")
    .reduce((sum, p) => sum + p.amount, 0);

  // Siguiente deposito automatico, estimado: lo disponible hoy mas lo que se
  // libera antes de ese dia, menos el saldo minimo que Stripe deja en la
  // cuenta. Stripe no publica el monto antes de crearlo; puede variar si
  // entran cobros o reembolsos de aqui a entonces.
  const day = nextPayoutDay(schedule, payouts);
  let next = null;
  if (day) {
    const dayTs = day.getTime() / 1000;
    const releasing = pendingTxs
      .filter(
        (t) =>
          t.status === "pending" &&
          t.currency === "mxn" &&
          t.available_on <= dayTs,
      )
      .reduce((sum, t) => sum + t.net, 0);
    next = {
      date: day.toISOString().slice(0, 10),
      amount_cents: Math.max(0, availableCents + releasing - (minimumCents ?? 0)),
    };
  }

  const paid = payouts.filter((p) => p.status === "paid");

  return {
    pending_cents: mxn(balance.pending),
    available_cents: availableCents,
    in_transit_cents: inTransitCents,
    minimum_balance_cents: minimumCents,
    schedule: schedule && {
      interval: schedule.interval,
      weekly_payout_days: schedule.weekly_payout_days ?? [],
      monthly_payout_days: schedule.monthly_payout_days ?? [],
    },
    delay_days: settings.payments?.settlement_timing?.delay_days ?? null,
    payouts_enabled: payoutCfg?.status === "enabled",
    next_payout: next,
    payouts: payouts.map((p) => ({
      id: p.id,
      amount_cents: p.amount,
      status: p.status,
      created: p.created,
      arrival_date: p.arrival_date,
      automatic: p.automatic,
      destination: destinationLabel(p.destination),
      failure_message: p.failure_message ?? null,
    })),
    paid_total_cents: paid.reduce((sum, p) => sum + p.amount, 0),
    history_truncated: payouts.length >= HISTORY_MAX,
    history_days: HISTORY_DAYS,
  };
}

module.exports = { platformFunds, nextPayoutDay };
