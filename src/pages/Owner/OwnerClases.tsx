import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import ClassManagementCard from "../../components/ClassManagementCard";
import { WEEK_ORDER, type StudioHour } from "../../lib/hours";

import { api } from "../../lib/api";
// GET /studios/:id/classes (classes.* mas el nombre del instructor ya unido).
type Clase = {
  id: number;
  name: string;
  instructor_name: string | null;
  instructor_id: number | null;
  capacity: number;
  price: number;
  studio_id: number;
};

// GET /studios/:id/all-schedules. El LEFT JOIN contra schedules deja en null
// todo lo del horario cuando la clase todavia no tiene ninguno; por eso existe
// el filtro `time !== null` antes de pintar el calendario.
type Horario = {
  class_id: number;
  name: string;
  instructor: string | null;
  capacity: number;
  price: number;
  schedule_id: number | null;
  day: number | null;
  time: string | null;
  end_time: string | null;
  is_permanent: boolean | null;
  date: string | null;
};

// GET /studios/:id/instructors.
type Instructor = {
  id: number;
  name: string;
  last_name: string;
  studio_id: number;
};

// El calendario ya no va siempre de 6 a 22: arranca a la hora en que el
// estudio abre mas temprano y llega a la mas noche de toda la semana. Los
// horarios ya programados tambien estiran la rejilla, porque nada impide poner
// una clase fuera del horario de atencion y esconderla seria peor que alargarla.
const DEFAULT_FROM = 6;
const DEFAULT_TO = 22;

/** La hora de un "HH:MM" (o "HH:MM:SS"). */
function hourAt(time: string) {
  return Number(time.slice(0, 2));
}

/**
 * La hora de fin de un horario. Los creados antes de que el dueño la pudiera
 * elegir duraban una hora, asi que sin ella se sigue suponiendo eso.
 */
function endTimeOf(s: { time: string; end_time: string | null }) {
  if (s.end_time) return s.end_time;
  const mins = Math.min(minutesAt(s.time) + 60, 23 * 60 + 59);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Los minutos desde la medianoche de un "HH:MM". */
function minutesAt(time: string) {
  return hourAt(time) * 60 + Number(time.slice(3, 5));
}

/** Minutos desde medianoche al formato del formulario: "7:30 AM". */
function to12h(minutes: number) {
  const h24 = Math.floor(minutes / 60);
  const period = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")} ${period}`;
}

/** Las horas del select, de media en media. */
function timeOptions(fromMinutes: number, toMinutes: number) {
  const options: string[] = [];
  for (let m = Math.floor(fromMinutes / 30) * 30; m <= toMinutes; m += 30) {
    options.push(to12h(m));
  }
  return options;
}

/** El cierre se redondea hacia arriba: si cierra 21:30, la ultima fila es 22. */
function closingHour(time: string) {
  return hourAt(time) + (Number(time.slice(3, 5)) > 0 ? 1 : 0);
}

function calendarHours(
  hours: StudioHour[],
  schedules: { time: string; end_time: string | null }[],
): number[] {
  const froms = hours.length ? hours.map((h) => hourAt(h.opens)) : [DEFAULT_FROM];
  const tos = hours.length ? hours.map((h) => closingHour(h.closes)) : [DEFAULT_TO];
  for (const s of schedules) {
    froms.push(hourAt(s.time));
    // La fila de la hora en que termina la clase tiene que existir: una de
    // 9:30 a 10:30 se dibuja tambien sobre la de las 10.
    tos.push(hourAt(endTimeOf(s)) + (minutesAt(endTimeOf(s)) % 60 >= 30 ? 1 : 0));
  }
  const from = Math.min(...froms);
  const to = Math.max(...tos);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** El lunes de la semana de `base`. getDay() cuenta 0 = domingo. */
function mondayOf(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** "2026-09-21" en hora local, para comparar con la fecha de un horario. */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Los tonos de azul de las clases que se encaraman: cada una lleva el suyo,
// para que se distingan las pestañas del monton.
const TONES = [
  { bg: "#e8eef7", edge: "#1b2c44" },
  { bg: "#c9d9ee", edge: "#33506f" },
  { bg: "#aac4e4", edge: "#1b2c44" },
  { bg: "#8fb0d9", edge: "#33506f" },
];

// Lo que asoma de una clase que esta detras: su pestaña, con el nombre. Tiene
// que dar para una linea de texto completa, o el nombre se corta a la mitad.
const TAB_HEIGHT = 18;

// El hueco que se le quita a cada tarjeta por abajo. Sin el, una clase que
// termina justo cuando empieza la siguiente se pega a ella y las dos parecen
// una sola tarjeta.
const CARD_GAP = 3;

// Lo minimo que mide una tarjeta: dos lineas de texto. Una clase de media hora
// se sale un poco de su hueco antes que esconder al instructor, que es lo que
// dice cual es cual cuando dos clases se llaman igual.
const MIN_CARD_HEIGHT = 34;

// Alto de una hora. Una clase dura una hora, asi que ese es tambien el alto de
// su tarjeta: 56 es lo justo para el nombre y el instructor sin que la semana
// entera pida media pantalla de scroll. Con dos encaramadas a la de delante le
// quedan 40, que siguen alcanzando para las dos lineas.
const ROW_HEIGHT = 56;

// Las columnas del grid de tarjetas, en los mismos cortes que las clases de
// Tailwind de abajo (md y lg). Se leen en JS porque la paginacion necesita
// saber cuantas tarjetas caben en dos filas, y eso cambia con el ancho.
const BREAKPOINTS = [
  { query: "(min-width: 1024px)", columns: 4 },
  { query: "(min-width: 768px)", columns: 2 },
];

function currentColumns() {
  return (
    BREAKPOINTS.find((b) => window.matchMedia(b.query).matches)?.columns ?? 1
  );
}

function useColumns() {
  const [columns, setColumns] = useState(currentColumns);

  useEffect(() => {
    const lists = BREAKPOINTS.map((b) => window.matchMedia(b.query));
    const actualizar = () => setColumns(currentColumns());
    lists.forEach((l) => l.addEventListener("change", actualizar));
    return () =>
      lists.forEach((l) => l.removeEventListener("change", actualizar));
  }, []);

  return columns;
}

function OwnerClases() {
  type Studio = {
    id: number;
    name: string;
    // GET /studios/owner/:id ya trae el horario de atencion (studio_hours).
    hours: StudioHour[];
  };
  const owner = JSON.parse(localStorage.getItem("user") || "{}");

  const [studio, setStudio] = useState<Studio | null>(null);
  const [classes, setClasses] = useState<Clase[]>([]);
  const [schedules, setSchedules] = useState<Horario[]>([]);
  const [classPopup, setClassPopup] = useState(false);
  const [popupMode, setPopupMode] = useState<"add" | "edit">("add");
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [newClassForm, setNewClassForm] = useState({
    name: "",
    instructor_id: 0,
    capacity: 0,
    price: 0,
    classType: "",
    selectedDate: "",
    selectedDays: [] as string[],
    selectedTime: "6:00 AM",
    selectedEndTime: "7:00 AM",
    // Deja elegir cualquier hora del dia, para una clase que cae fuera del
    // horario normal del estudio.
    specialTime: false,
  });
  const [editingClass, setEditingClass] = useState<Clase | null>(null);

  // Lo que sale en rojo dentro del formulario. Se usa para la clase repetida:
  // un alert se cierra y no deja ver que estaba mal.
  const [formError, setFormError] = useState("");

  // 0 = esta semana. El calendario siempre pinta una semana completa; las
  // clases permanentes salen en todas y las unicas solo en su fecha.
  const [weekOffset, setWeekOffset] = useState(0);

  // Cual de las clases que coinciden a la misma hora esta al frente, por
  // monton ("columna-minuto"). Sin entrada, la ultima.
  const [front, setFront] = useState<Record<string, number>>({});

  // Las tarjetas se quedan en dos filas y el resto pasa a otra pagina: antes
  // se acumulaban hacia abajo y empujaban el calendario fuera de la pantalla.
  const [page, setPage] = useState(1);
  const perPage = useColumns() * 2;
  const totalPages = Math.max(1, Math.ceil(classes.length / perPage));

  useEffect(() => {
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => {
        setStudio(data);
      });
  }, [owner.id]);

  useEffect(() => {
    if (!studio?.id) return;
    api(`/studios/${studio?.id}/classes`)
      .then((res) => res.json())
      .then((data) => {
        setClasses(data);
      });
  }, [studio]);

  useEffect(() => {
    if (!studio?.id) return;
    api(`/studios/${studio?.id}/all-schedules`)
      .then((res) => res.json())
      .then((data) => {
        setSchedules(data);
      });
  }, [studio]);

  //Convertir horas y dias a formato del backend
  const convertTo24h = (time: string) => {
    const [hour, minutePart] = time.split(":");
    const [minutes, period] = (minutePart as string).split(" ");
    let h = parseInt(hour as string);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${minutes}`;
  };
  const dayMap: { [key: string]: number } = {
    Domingo: 0,
    Lunes: 1,
    Martes: 2,
    Miércoles: 3,
    Jueves: 4,
    Viernes: 5,
    Sábado: 6,
  };

  //Fucnión para agregar una clase nueva
  const handleAddClass = async () => {
    setFormError("");
    if (
      !newClassForm.name ||
      !newClassForm.instructor_id ||
      !newClassForm.capacity ||
      !newClassForm.price ||
      !newClassForm.classType ||
      !newClassForm.selectedTime ||
      !newClassForm.selectedEndTime
    ) {
      alert("Por favor llena todos los campos");
      return;
    }

    if (
      minutesAt(convertTo24h(newClassForm.selectedEndTime)) <=
      minutesAt(convertTo24h(newClassForm.selectedTime))
    ) {
      alert("La clase tiene que terminar después de empezar");
      return;
    }

    if (newClassForm.classType === "única" && !newClassForm.selectedDate) {
      alert("Selecciona el día de la clase");
      return;
    }

    if (
      newClassForm.classType === "permanente" &&
      newClassForm.selectedDays.length === 0
    ) {
      alert("Selecciona al menos un día");
      return;
    }

    if (claseRepetida()) {
      setFormError(
        "Ya tienes una clase con estas mismas características: mismo instructor, capacidad, precio, horario y día.",
      );
      return;
    }
    const res = await api(`/studios/${studio?.id}/add-class`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newClassForm.name,
        instructor_id: newClassForm.instructor_id,
        capacity: newClassForm.capacity,
        price: newClassForm.price,
        studio_id: studio?.id,
        classType: newClassForm.classType,
        // Sin esto el backend guardaba `date` en NULL y la clase unica no
        // salia ni en el calendario ni en el catalogo del alumno.
        selectedDate: newClassForm.selectedDate,
        selectedDays: newClassForm.selectedDays.map((d) => dayMap[d]),
        selectedTime: convertTo24h(newClassForm.selectedTime),
        selectedEndTime: convertTo24h(newClassForm.selectedEndTime),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log("Clase agregada correctamente");
      setClassPopup(false);
      setNewClassForm({
        name: "",
        instructor_id: 0,
        capacity: 0,
        price: 0,
        classType: "",
        selectedDate: "",
        selectedDays: [] as string[],
        selectedTime: normalTimes[0] ?? "6:00 AM",
        selectedEndTime: normalTimes[2] ?? "7:00 AM",
        specialTime: false,
      });
      api(`/studios/${studio?.id}/classes`)
        .then((res) => res.json())
        .then((data) => setClasses(data));
      // Refrescar schedules
      api(`/studios/${studio?.id}/all-schedules`)
        .then((res) => res.json())
        .then((data) => setSchedules(data));
      console.log(schedules);
    } else {
      console.log("Error:", data.error);
    }
  };

  const handleEditClass = async () => {
    if (!editingClass) return;

    setFormError("");

    if (claseRepetida()) {
      setFormError(
        "Ya tienes otra clase con estas mismas características: mismo instructor, capacidad, precio, horario y día.",
      );
      return;
    }

    const res = await api(`/studios/${studio?.id}/classes/${editingClass.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newClassForm.name,
        instructor_id: newClassForm.instructor_id,
        capacity: newClassForm.capacity,
        price: newClassForm.price,
        classType: newClassForm.classType,
        selectedDate: newClassForm.selectedDate,
        selectedDays: newClassForm.selectedDays.map((d) => dayMap[d]),
        selectedTime: convertTo24h(newClassForm.selectedTime),
        selectedEndTime: convertTo24h(newClassForm.selectedEndTime),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setClassPopup(false);
      setEditingClass(null);
      api(`/studios/${studio?.id}/classes`)
        .then((res) => res.json())
        .then((data) => setClasses(data));
      api(`/studios/${studio?.id}/all-schedules`)
        .then((res) => res.json())
        .then((data) => setSchedules(data));
    } else {
      alert(data.error);
    }
  };

  const handleDeleteClass = async (classId: number) => {
    const res = await api(`/studios/${studio?.id}/classes/${classId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (res.ok) {
      setClasses(classes.filter((c) => c.id !== classId));
      setSchedules(schedules.filter((s) => s.class_id !== classId));
    } else {
      alert(data.error);
    }
  };

  const studioId = studio?.id;
  //Obtener instructores del estudio
  useEffect(() => {
    // Se guarda y se depende de studioId (un numero) en vez del objeto studio:
    // la peticion solo necesita el id, y el objeto cambia de identidad en cada
    // render aunque el id sea el mismo.
    if (!studioId) return;
    api(`/studios/${studioId}/instructors`)
      .then((res) => res.json())
      .then((data) => setInstructors(data));
  }, [studioId]);

  //verifica el estado de schedules para ver si la clase es permanente o unica
  // El predicado de tipo no es decorativo: sin el, TypeScript sigue creyendo
  // que `time` puede ser null dentro del calendario, aunque el filtro ya los
  // haya sacado.
  const validSchedules = schedules.filter(
    (s): s is Horario & { time: string } => s.time !== null,
  );
  const studioHours = studio?.hours ?? [];
  const hours = calendarHours(studioHours, validSchedules);
  // Sin horario guardado (estudios de antes de la migracion 010) no hay dia
  // cerrado que marcar: se pintan los siete igual.
  const openDays = new Set(studioHours.map((h) => h.day));
  const isClosed = (day: number) => studioHours.length > 0 && !openDays.has(day);

  // Las horas que ofrece el select del formulario: las del estudio, o el dia
  // entero si el dueño marca "horario especial".
  const normalTimes = studioHours.length
    ? timeOptions(
        Math.min(...studioHours.map((h) => minutesAt(h.opens))),
        Math.max(...studioHours.map((h) => minutesAt(h.closes))),
      )
    : timeOptions(DEFAULT_FROM * 60, DEFAULT_TO * 60);
  // El dia entero llega hasta las 11:00 PM y no hasta las 11:30: asi siempre
  // queda al menos una media hora por delante para la hora de fin.
  const times = newClassForm.specialTime
    ? timeOptions(0, 23 * 60)
    : normalTimes;

  // La clase termina despues de empezar, asi que la segunda lista arranca
  // media hora despues de la hora elegida. El maximo se estira si hace falta:
  // una clase que empieza justo a la hora de cierre tiene que poder terminar.
  const startMinutes = minutesAt(convertTo24h(newClassForm.selectedTime));
  const lastMinutes = newClassForm.specialTime
    ? 23 * 60 + 30
    : minutesAt(convertTo24h(times[times.length - 1] ?? "10:00 PM"));
  const endTimes = timeOptions(
    startMinutes + 30,
    Math.max(lastMinutes, startMinutes + 60),
  );

  // Una clase igual a otra que ya existe: mismo instructor, capacidad, precio,
  // tipo, horas y dia (o fecha, si es unica). El nombre no cuenta: dos clases
  // con todo lo demas igual son la misma aunque se llamen distinto, y mientras
  // no se podia crear una clase unica quedaron varias repetidas.
  const claseRepetida = () => {
    const inicio = convertTo24h(newClassForm.selectedTime);
    const fin = convertTo24h(newClassForm.selectedEndTime);
    const esPermanente = newClassForm.classType === "permanente";
    const dias = newClassForm.selectedDays.map((d) => dayMap[d]);

    return validSchedules.some((s) => {
      if (editingClass && s.class_id === editingClass.id) return false;
      const clase = classes.find((c) => c.id === s.class_id);
      if (!clase) return false;
      if (clase.instructor_id !== newClassForm.instructor_id) return false;
      if (Number(clase.capacity) !== Number(newClassForm.capacity)) return false;
      if (Number(clase.price) !== Number(newClassForm.price)) return false;
      if (Boolean(s.is_permanent) !== esPermanente) return false;
      if (s.time.slice(0, 5) !== inicio) return false;
      if (endTimeOf(s).slice(0, 5) !== fin) return false;
      return esPermanente
        ? dias.includes(s.day ?? -1)
        : s.date?.slice(0, 10) === newClassForm.selectedDate;
    });
  };

  // Cambiar la hora de inicio, o salir del horario especial, puede dejar la de
  // fin antes que la de inicio o fuera de la lista. Se empuja una hora adelante.
  const conHoras = (inicio: string, fin: string, special: boolean) => {
    const i = minutesAt(convertTo24h(inicio));
    const max = special
      ? 23 * 60 + 30
      : Math.max(
          minutesAt(
            convertTo24h(normalTimes[normalTimes.length - 1] ?? "10:00 PM"),
          ),
          i + 60,
        );
    const f = minutesAt(convertTo24h(fin));
    return {
      selectedTime: inicio,
      selectedEndTime: f > i && f <= max ? fin : to12h(Math.min(i + 60, max)),
    };
  };

  // La semana que se esta viendo, de lunes a domingo.
  const today = new Date();
  const weekStart = mondayOf(today);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekDays = WEEK_ORDER.map((day, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { day, date, key: ymd(date), label: DAY_LABELS[i] ?? "" };
  });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
      : `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  // Las clases de la semana, agrupadas por columna y hora de inicio. Las que
  // empiezan exactamente a la misma hora forman un monton: se encaraman y solo
  // asoma la pestaña de las de atras. Una permanente cae en su dia de la
  // semana; una unica, solo en la fecha que le toca.
  type Grupo = {
    key: string;
    startMinutes: number;
    clases: (Horario & { time: string })[];
  };
  const byColumn: Grupo[][] = weekDays.map(() => []);
  const grupos = new Map<string, Grupo>();
  for (const s of validSchedules) {
    const startMinutes = minutesAt(s.time);
    weekDays.forEach((wd, i) => {
      const here = s.is_permanent
        ? s.day === wd.day
        : s.date?.slice(0, 10) === wd.key;
      if (!here) return;
      const key = `${i}-${startMinutes}`;
      let grupo = grupos.get(key);
      if (!grupo) {
        grupo = { key, startMinutes, clases: [] };
        grupos.set(key, grupo);
        byColumn[i]?.push(grupo);
      }
      grupo.clases.push(s);
    });
  }
  // Por hora de inicio: la que empieza despues se dibuja encima de la anterior.
  byColumn.forEach((col) => col.sort((a, b) => a.startMinutes - b.startMinutes));

  // Donde empieza la rejilla y cuanto mide un minuto en pixeles: es lo que
  // coloca cada clase y le da su alto, una hora.
  const gridStart = (hours[0] ?? DEFAULT_FROM) * 60;
  const pxPerMinute = ROW_HEIGHT / 60;
  // Borrar una clase o encoger la ventana puede dejar la pagina actual vacia.
  if (page > totalPages) setPage(totalPages);

  // Todas las paginas se pintan a la vez, una al lado de otra, y lo que se
  // mueve es la tira: asi el cambio de pagina se desliza en vez de parpadear,
  // y la altura del bloque la fija la pagina mas llena, de modo que una ultima
  // pagina a medias no le sube el calendario al dueño.
  const pages = Array.from({ length: totalPages }, (_, i) =>
    classes.slice(i * perPage, (i + 1) * perPage),
  );

  if (!studio) return null;
  return (
    <div>
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-4xl md:text-6xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Mis{" "}
            <span
              className="text-[#1b2c44]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Clases
            </span>
          </h1>
          <button
            onClick={() => {
              setPopupMode("add");
              setClassPopup(true);
              setFormError("");
              // El select arranca en la primera hora del estudio, no en las
              // 6:00 AM: si esa hora no esta en la lista, lo que se guardaba
              // no era lo que se veia en pantalla.
              setNewClassForm((f) => ({
                ...f,
                selectedTime: normalTimes[0] ?? f.selectedTime,
                selectedEndTime: normalTimes[2] ?? f.selectedEndTime,
                specialTime: false,
              }));
            }}
            className="flex items-center gap-2 bg-[#1b2c44] text-white px-5 py-2.5 rounded-xl text-md font-medium hover:bg-[#33506f] transition-colors cursor-pointer"
          >
            <Plus size={20} />
            Agregar clase
          </button>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-3 mb-3">
            <p className="text-sm text-slate-500">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Clases anteriores"
                className="p-2 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Más clases"
                className="p-2 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        <div className="overflow-hidden mb-8">
          <div
            className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${(page - 1) * 100}%)` }}
          >
            {pages.map((grupo, i) => (
              // `content-start` deja las filas con su altura natural: sin el,
              // la unica tarjeta de una pagina a medias se estiraria para
              // llenar el hueco de la fila que falta.
              // `inert` saca de la navegacion con Tab las paginas que no se
              // ven; si no, se puede llegar a un boton de Editar invisible.
              <div
                key={i}
                inert={i !== page - 1}
                className="w-full shrink-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 content-start"
              >
                {grupo.map((clase) => (
                  <ClassManagementCard
                    key={clase.id}
                    id={clase.id}
                    name={clase.name}
                    instructor_name={clase.instructor_name}
                    capacity={clase.capacity}
                    price={clase.price}
                    onDelete={() => handleDeleteClass(clase.id)}
                    onEdit={() => {
                      const classSchedules = schedules.filter(
                        (s) => s.class_id === clase.id,
                      );
                      const isPermanent = classSchedules[0]?.is_permanent;
                      // La hora guardada viene como "HH:MM:SS"; el formulario
                      // trabaja con "7:30 AM".
                      const horario = classSchedules[0];
                      const selectedTime = horario?.time
                        ? to12h(minutesAt(horario.time))
                        : (normalTimes[0] ?? "6:00 AM");
                      const selectedEndTime =
                        horario?.time
                          ? to12h(
                              minutesAt(
                                endTimeOf({
                                  time: horario.time,
                                  end_time: horario.end_time,
                                }),
                              ),
                            )
                          : (normalTimes[2] ?? "7:00 AM");
                      setPopupMode("edit");
                      setEditingClass(clase);
                      setClassPopup(true);
                      setFormError("");
                      setNewClassForm({
                        name: clase.name,
                        instructor_id: clase.instructor_id ?? 0,
                        capacity: clase.capacity,
                        price: clase.price,
                        classType: isPermanent ? "permanente" : "única",
                        // `date` llega como ISO ("2026-09-21T06:00:00.000Z") y
                        // el <input type="date"> solo entiende el "YYYY-MM-DD".
                        selectedDate: classSchedules[0]?.date?.slice(0, 10) || "",
                        selectedDays: isPermanent
                          ? classSchedules
                              .map(
                                (s) =>
                                  [
                                    "Domingo",
                                    "Lunes",
                                    "Martes",
                                    "Miércoles",
                                    "Jueves",
                                    "Viernes",
                                    "Sábado",
                                  ][s.day as number],
                              )
                              .filter((d): d is string => d !== undefined)
                          : [],
                        // Se conserva la hora de la clase en vez de volver a
                        // las 6:00 AM, y si cae fuera del horario del estudio
                        // el formulario abre ya con "horario especial".
                        selectedTime,
                        selectedEndTime,
                        specialTime:
                          !normalTimes.includes(selectedTime) ||
                          !normalTimes.includes(selectedEndTime),
                      });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Calendario */}
        <div className="bg-white rounded-2xl overflow-hidden border border-slate-100">
          {/* Semana. Las flechas mueven el calendario de siete en siete dias. */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-md font-medium text-slate-600">{weekLabel}</p>
            <div className="flex items-center gap-2">
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="px-3 py-1 rounded-full border border-slate-200 text-md text-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
                >
                  Hoy
                </button>
              )}
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                aria-label="Semana anterior"
                className="p-2 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                aria-label="Semana siguiente"
                className="p-2 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Header días */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-300">
            <div className="p-3 bg-slate-50" />
            {weekDays.map((wd) => {
              const isToday = wd.key === ymd(today);
              const cerrado = isClosed(wd.day);
              return (
                <div
                  key={wd.key}
                  title={cerrado ? "Cerrado" : undefined}
                  className={`p-3 text-center border-l border-slate-300 ${isToday ? "bg-[#e8eef7]" : "bg-slate-50"} ${cerrado ? "opacity-40" : ""}`}
                >
                  <p
                    className={`text-md font-medium ${isToday ? "text-[#1b2c44]" : "text-slate-600"}`}
                  >
                    {wd.label}
                  </p>
                  <p
                    className={`text-md ${isToday ? "text-[#1b2c44] font-medium" : "text-slate-400"}`}
                  >
                    {wd.date.getDate()}
                  </p>
                  <p className="text-md text-slate-400 leading-none">
                    {MONTHS[wd.date.getMonth()]}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Rejilla. Las lineas son el fondo; las clases van encima, con su
              sitio y su alto en minutos, para que una de 6:30 ocupe media hora
              de las 6 y media de las 7. */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            <div className="bg-slate-50 border-r border-slate-300">
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{ height: ROW_HEIGHT }}
                  className="border-b border-slate-300 p-2 text-right pr-3"
                >
                  <p className="text-md text-slate-400">{hour}:00</p>
                </div>
              ))}
            </div>

            {weekDays.map((wd, column) => {
              const cerrado = isClosed(wd.day);
              return (
                // El dia cerrado se apaga con el fondo, no con opacidad: una
                // clase programada ahi tiene que seguir leyendose, porque es
                // justo lo que el dueño querria notar.
                <div
                  key={wd.key}
                  className={`relative border-l border-slate-300 ${cerrado ? "bg-slate-100" : ""}`}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: ROW_HEIGHT }}
                      className="relative border-b border-slate-300"
                    >
                      {/* La media hora, punteada, para leer de un vistazo si
                          una clase empieza en punto o y media. */}
                      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-300/70" />
                    </div>
                  ))}

                  {byColumn[column]?.map(({ key, startMinutes, clases }) => {
                    // Las de atras asoman por arriba; la de delante ocupa el
                    // resto. Al hacer clic en una pestaña, esa pasa al frente y
                    // el monton rota (de ahi la animacion).
                    const frontIndex = front[key] ?? clases.length - 1;
                    const ordered = [
                      ...clases.slice(frontIndex + 1),
                      ...clases.slice(0, frontIndex + 1),
                    ];
                    const tabs = clases.length - 1;
                    const top = (startMinutes - gridStart) * pxPerMinute;
                    // El monton mide lo que la mas larga de las que empiezan a
                    // esa hora: son un solo folder.
                    const duracion = Math.max(
                      ...clases.map((c) => minutesAt(endTimeOf(c)) - startMinutes),
                    );
                    const height = Math.max(
                      duracion * pxPerMinute - tabs * TAB_HEIGHT - CARD_GAP,
                      tabs > 0 ? TAB_HEIGHT : MIN_CARD_HEIGHT,
                    );

                    return ordered.map((s, k) => {
                      const indexInGroup = (frontIndex + 1 + k) % clases.length;
                      const tone = TONES[indexInGroup % TONES.length]!;
                      const isFront = k === tabs;
                      return (
                        // Es un <div> y no un <button>: el navegador centra
                        // verticalmente el contenido de un boton pase lo que
                        // pase, y en la pestaña de una clase de atras eso
                        // empujaba el nombre fuera de la franja que se ve.
                        <div
                          key={s.schedule_id}
                          {...(tabs > 0 && {
                            role: "button",
                            tabIndex: 0,
                            onClick: () =>
                              setFront((f) => ({ ...f, [key]: indexInGroup })),
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              setFront((f) => ({ ...f, [key]: indexInGroup }));
                            },
                          })}
                          title={`${s.name}${s.instructor ? ` · ${s.instructor}` : ""}`}
                          style={{
                            top: top + k * TAB_HEIGHT,
                            height,
                            zIndex: k + 1,
                            backgroundColor: tone.bg,
                            borderLeftColor: tone.edge,
                          }}
                          className={`absolute left-1 right-1 overflow-hidden rounded border-l-2 px-2 py-0.5 transition-all duration-300 motion-reduce:transition-none ${
                            tabs > 0 ? "cursor-pointer shadow-sm" : ""
                          } ${isFront ? "" : "rounded-b-none"}`}
                        >
                          {/* Sin `truncate`: el nombre se acomoda en varias
                              lineas antes que salir cortado, porque es lo que
                              distingue dos clases del mismo instructor. */}
                          <p className="text-xs font-medium text-[#1b2c44] leading-tight break-words">
                            {s.name}
                          </p>
                          <p className="text-xs text-[#33506f] leading-tight truncate">
                            {s.is_permanent
                              ? s.instructor
                              : `Única · ${s.instructor ?? ""}`}
                          </p>
                        </div>
                      );
                    });
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/*Formulario agregar clase */}
        {classPopup && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg">
                {popupMode === "add" ? "Agregar clase" : "Editar clase"}
              </p>

              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Nombre de la clase
                </label>
                <input
                  type="text"
                  value={newClassForm.name}
                  onChange={(e) =>
                    setNewClassForm({ ...newClassForm, name: e.target.value })
                  }
                  placeholder="Reformer Básico"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                />
              </div>

              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Instructor
                </label>
                <select
                  value={newClassForm.instructor_id}
                  onChange={(e) =>
                    setNewClassForm({
                      ...newClassForm,
                      instructor_id: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors text-slate-600"
                >
                  <option value="">Selecciona un instructor</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.name} {instructor.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Capacidad
                  </label>
                  <input
                    type="number"
                    value={newClassForm.capacity}
                    onChange={(e) =>
                      setNewClassForm({
                        ...newClassForm,
                        capacity: parseInt(e.target.value),
                      })
                    }
                    placeholder="10"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Precio
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">$</span>
                    <input
                      type="number"
                      value={newClassForm.price}
                      onChange={(e) =>
                        setNewClassForm({
                          ...newClassForm,
                          price: parseFloat(e.target.value),
                        })
                      }
                      placeholder="320"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-md text-slate-600 block mb-2">
                  Tipo de clase
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="classType"
                      value="única"
                      checked={newClassForm.classType === "única"}
                      onChange={(e) =>
                        setNewClassForm({
                          ...newClassForm,
                          classType: e.target.value,
                        })
                      }
                      className="accent-[#1b2c44]"
                    />
                    <span className="text-md text-slate-700">Única</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="classType"
                      value="permanente"
                      checked={newClassForm.classType === "permanente"}
                      onChange={(e) =>
                        setNewClassForm({
                          ...newClassForm,
                          classType: e.target.value,
                        })
                      }
                      className="accent-[#1b2c44]"
                    />
                    <span className="text-md text-slate-700">Permanente</span>
                  </label>
                </div>
              </div>

              {newClassForm.classType === "única" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-md text-slate-600 block mb-1.5">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={newClassForm.selectedDate}
                      onChange={(e) =>
                        setNewClassForm({
                          ...newClassForm,
                          selectedDate: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                    />
                  </div>
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-md text-slate-600 block mb-1.5">
                          Empieza
                        </label>
                        <select
                          value={newClassForm.selectedTime}
                          onChange={(e) =>
                            setNewClassForm({
                              ...newClassForm,
                              ...conHoras(
                                e.target.value,
                                newClassForm.selectedEndTime,
                                newClassForm.specialTime,
                              ),
                            })
                          }
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                        >
                          {times.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-md text-slate-600 block mb-1.5">
                          Termina
                        </label>
                        <select
                          value={newClassForm.selectedEndTime}
                          onChange={(e) =>
                            setNewClassForm({
                              ...newClassForm,
                              selectedEndTime: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                        >
                          {endTimes.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newClassForm.specialTime}
                        onChange={(e) => {
                          // Al volver al horario normal, una hora que ya no
                          // esta en la lista dejaria el select en blanco.
                          const inicio =
                            e.target.checked ||
                            normalTimes.includes(newClassForm.selectedTime)
                              ? newClassForm.selectedTime
                              : (normalTimes[0] ?? newClassForm.selectedTime);
                          setNewClassForm({
                            ...newClassForm,
                            specialTime: e.target.checked,
                            ...conHoras(
                              inicio,
                              newClassForm.selectedEndTime,
                              e.target.checked,
                            ),
                          });
                        }}
                        className="accent-[#1b2c44]"
                      />
                      <span className="text-md text-slate-600">
                        Horario especial (fuera del horario del estudio)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {newClassForm.classType === "permanente" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-md text-slate-600 block mb-2">
                      Días
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Lunes",
                        "Martes",
                        "Miércoles",
                        "Jueves",
                        "Viernes",
                        "Sábado",
                        "Domingo",
                      ].map((d) => (
                        <label
                          key={d}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            value={d}
                            checked={newClassForm.selectedDays.includes(d)}
                            onChange={(e) =>
                              setNewClassForm({
                                ...newClassForm,
                                selectedDays: e.target.checked
                                  ? [...newClassForm.selectedDays, d]
                                  : newClassForm.selectedDays.filter(
                                      (day) => day !== d,
                                    ),
                              })
                            }
                            className="accent-[#1b2c44]"
                          />
                          <span className="text-md text-slate-700">{d}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-md text-slate-600 block mb-1.5">
                          Empieza
                        </label>
                        <select
                          value={newClassForm.selectedTime}
                          onChange={(e) =>
                            setNewClassForm({
                              ...newClassForm,
                              ...conHoras(
                                e.target.value,
                                newClassForm.selectedEndTime,
                                newClassForm.specialTime,
                              ),
                            })
                          }
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                        >
                          {times.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-md text-slate-600 block mb-1.5">
                          Termina
                        </label>
                        <select
                          value={newClassForm.selectedEndTime}
                          onChange={(e) =>
                            setNewClassForm({
                              ...newClassForm,
                              selectedEndTime: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                        >
                          {endTimes.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newClassForm.specialTime}
                        onChange={(e) => {
                          // Al volver al horario normal, una hora que ya no
                          // esta en la lista dejaria el select en blanco.
                          const inicio =
                            e.target.checked ||
                            normalTimes.includes(newClassForm.selectedTime)
                              ? newClassForm.selectedTime
                              : (normalTimes[0] ?? newClassForm.selectedTime);
                          setNewClassForm({
                            ...newClassForm,
                            specialTime: e.target.checked,
                            ...conHoras(
                              inicio,
                              newClassForm.selectedEndTime,
                              e.target.checked,
                            ),
                          });
                        }}
                        className="accent-[#1b2c44]"
                      />
                      <span className="text-md text-slate-600">
                        Horario especial (fuera del horario del estudio)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {formError && (
                <p
                  role="alert"
                  className="text-md text-red-600 bg-red-50 rounded-xl px-4 py-3"
                >
                  {formError}
                </p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setClassPopup(false)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={
                    popupMode === "add" ? handleAddClass : handleEditClass
                  }
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  {popupMode === "add" ? "Guardar clase" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OwnerClases;
