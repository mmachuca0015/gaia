// Editor del horario de atencion: un renglon por dia con su casilla de
// "abre" y la hora de apertura y cierre. Lo usan el registro del estudio y
// la pantalla Estudio > General del dueño.
import { DAY_NAMES, type DayHours } from "../lib/hours";

interface Props {
  value: DayHours[];
  onChange: (week: DayHours[]) => void;
}

const timeInput =
  "px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 disabled:opacity-40";

function StudioHoursEditor({ value, onChange }: Props) {
  const update = (day: number, patch: Partial<DayHours>) =>
    onChange(value.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  // Copia el horario del primer dia abierto a todos los dias abiertos: la
  // mayoria de los estudios abre igual entre semana.
  const firstOpen = value.find((d) => d.open);
  const copyToAll = () => {
    if (!firstOpen) return;
    onChange(
      value.map((d) =>
        d.open
          ? { ...d, opens: firstOpen.opens, closes: firstOpen.closes }
          : d,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
        {value.map((d) => (
          <div
            key={d.day}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <label className="flex items-center gap-2.5 cursor-pointer min-w-[120px]">
              <input
                type="checkbox"
                checked={d.open}
                onChange={(e) => update(d.day, { open: e.target.checked })}
                className="accent-[#1b2c44] w-4 h-4"
              />
              <span
                className={`text-sm ${d.open ? "text-slate-800" : "text-slate-400"}`}
              >
                {DAY_NAMES[d.day]}
              </span>
            </label>
            {d.open ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <input
                  type="time"
                  value={d.opens}
                  onChange={(e) => update(d.day, { opens: e.target.value })}
                  aria-label={`${DAY_NAMES[d.day]}: abre`}
                  className={timeInput}
                />
                a
                <input
                  type="time"
                  value={d.closes}
                  onChange={(e) => update(d.day, { closes: e.target.value })}
                  aria-label={`${DAY_NAMES[d.day]}: cierra`}
                  className={timeInput}
                />
              </div>
            ) : (
              <span className="text-sm text-slate-400">Cerrado</span>
            )}
          </div>
        ))}
      </div>
      {firstOpen && (
        <button
          type="button"
          onClick={copyToAll}
          className="self-end text-xs text-[#1b2c44] hover:underline cursor-pointer"
        >
          Usar {firstOpen.opens}–{firstOpen.closes} en todos los días abiertos
        </button>
      )}
    </div>
  );
}

export default StudioHoursEditor;
