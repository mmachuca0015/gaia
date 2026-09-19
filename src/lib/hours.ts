// Horario de atencion de un estudio. `day` usa la convencion de la base:
// 0 = domingo. En pantalla la semana empieza en lunes.

export interface StudioHour {
  day: number;
  /** "HH:MM" */
  opens: string;
  closes: string;
}

/** Un renglon del editor: los 7 dias, abiertos o no. */
export interface DayHours {
  day: number;
  open: boolean;
  opens: string;
  closes: string;
}

export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Lunes primero, domingo al final. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Punto de partida del registro: lunes a viernes y sabado en la mañana. */
export function defaultWeek(): DayHours[] {
  return WEEK_ORDER.map((day) => ({
    day,
    open: day !== 0,
    opens: day === 6 ? "08:00" : "07:00",
    closes: day === 6 ? "14:00" : "21:00",
  }));
}

/** Del horario guardado al editor. Sin horario, arranca con el de ejemplo. */
export function weekFrom(hours: StudioHour[] | null | undefined): DayHours[] {
  if (!hours || hours.length === 0) return defaultWeek();
  return WEEK_ORDER.map((day) => {
    const h = hours.find((x) => x.day === day);
    return h
      ? { day, open: true, opens: h.opens, closes: h.closes }
      : { day, open: false, opens: "07:00", closes: "21:00" };
  });
}

/** Del editor a lo que recibe el backend: solo los dias que abre. */
export function toPayload(week: DayHours[]): StudioHour[] {
  return week
    .filter((d) => d.open)
    .map(({ day, opens, closes }) => ({ day, opens, closes }));
}

/** Mensaje de error, o null si el horario se puede guardar. */
export function validateWeek(week: DayHours[]): string | null {
  const open = week.filter((d) => d.open);
  if (open.length === 0) return "Elige al menos un día en que abre tu estudio";
  const bad = open.find((d) => !d.opens || !d.closes || d.closes <= d.opens);
  if (bad) {
    return `Revisa el ${DAY_NAMES[bad.day]!.toLowerCase()}: la hora de cierre debe ser después de la de apertura`;
  }
  return null;
}

/** "7:00 a 21:00" */
export function formatRange(opens: string, closes: string) {
  const short = (t: string) => t.replace(/^0/, "");
  return `${short(opens)} a ${short(closes)}`;
}
