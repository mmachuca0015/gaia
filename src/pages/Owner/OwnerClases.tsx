import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import ClassManagementCard from "../../components/ClassManagementCard";

function OwnerClases() {
  type Studio = {
    id: number;
    name: string;
  };
  const owner = JSON.parse(localStorage.getItem("user") || "{}");

  const [studio, setStudio] = useState<Studio | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [classPopup, setClassPopup] = useState(false);
  const [popupMode, setPopupMode] = useState<"add" | "edit">("add");
  const [instructors, setInstructors] = useState<any[]>([]);
  const [newClassForm, setNewClassForm] = useState({
    name: "",
    instructor_id: 0,
    capacity: 0,
    price: 0,
    classType: "",
    selectedDate: "",
    selectedDays: [] as string[],
    selectedTime: "6:00 AM",
  });
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    instructor_id: 0,
    capacity: 0,
    price: 0,
    selectedTime: "6:00 AM",
    selectedDay: "",
    selectedDays: [] as string[],
  });

  useEffect(() => {
    fetch(`http://localhost:3001/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => {
        setStudio(data);
      });
  }, []);

  useEffect(() => {
    if (!studio?.id) return;
    fetch(`http://localhost:3001/studios/${studio?.id}/classes`)
      .then((res) => res.json())
      .then((data) => {
        setClasses(data);
      });
  }, [studio]);

  useEffect(() => {
    if (!studio?.id) return;
    fetch(`http://localhost:3001/studios/${studio?.id}/all-schedules`)
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
    if (
      !newClassForm.name ||
      !newClassForm.instructor_id ||
      !newClassForm.capacity ||
      !newClassForm.price ||
      !newClassForm.classType ||
      !newClassForm.selectedTime
    ) {
      alert("Por favor llena todos los campos");
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
    const res = await fetch(
      `http://localhost:3001/studios/${studio?.id}/add-class`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClassForm.name,
          instructor_id: newClassForm.instructor_id,
          capacity: newClassForm.capacity,
          price: newClassForm.price,
          studio_id: studio?.id,
          classType: newClassForm.classType,
          selectedDay: dayMap[newClassForm.selectedDate],
          selectedDays: newClassForm.selectedDays.map((d) => dayMap[d]),
          selectedTime: convertTo24h(newClassForm.selectedTime),
        }),
      },
    );
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
        selectedTime: "6:00 AM",
      });
      fetch(`http://localhost:3001/studios/${studio?.id}/classes`)
        .then((res) => res.json())
        .then((data) => setClasses(data));
      // Refrescar schedules
      fetch(`http://localhost:3001/studios/${studio?.id}/all-schedules`)
        .then((res) => res.json())
        .then((data) => setSchedules(data));
      console.log(schedules);
    } else {
      console.log("Error:", data.error);
    }
  };

  const handleEditClass = async () => {
    const res = await fetch(
      `http://localhost:3001/studios/${studio?.id}/classes/${editingClass.id}`,
      {
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
        }),
      },
    );
    const data = await res.json();
    if (res.ok) {
      setClassPopup(false);
      setEditingClass(null);
      fetch(`http://localhost:3001/studios/${studio?.id}/classes`)
        .then((res) => res.json())
        .then((data) => setClasses(data));
      fetch(`http://localhost:3001/studios/${studio?.id}/all-schedules`)
        .then((res) => res.json())
        .then((data) => setSchedules(data));
    } else {
      alert(data.error);
    }
  };

  const handleDeleteClass = async (classId: number) => {
    const res = await fetch(
      `http://localhost:3001/studios/${studio?.id}/classes/${classId}`,
      {
        method: "DELETE",
      },
    );
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
    if (studio) {
      fetch(`http://localhost:3001/studios/${studioId}/instructors`)
        .then((res) => res.json())
        .then((data) => setInstructors(data));
    }
  }, [studio]);

  //verifica el estado de schedules para ver si la clase es permanente o unica
  const validSchedules = schedules.filter((s) => s.time !== null);
  if (!studio) return null;
  return (
    <div>
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-4xl md:text-6xl font-semibold text-stone-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Mis{" "}
            <span
              className="italic text-[#3a5a3a]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Clases
            </span>
          </h1>
          <button
            onClick={() => {
              setPopupMode("add");
              setClassPopup(true);
            }}
            className="flex items-center gap-2 bg-[#3a5a3a] text-white px-5 py-2.5 rounded-xl text-md font-medium hover:bg-[#2e4a2e] transition-colors cursor-pointer"
          >
            <Plus size={20} />
            Agregar clase
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {classes.map((clase) => (
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
                console.log(isPermanent, classSchedules);
                setPopupMode("edit");
                setEditingClass(clase);
                setClassPopup(true);
                setNewClassForm({
                  name: clase.name,
                  instructor_id: clase.instructor_id,
                  capacity: clase.capacity,
                  price: clase.price,
                  classType: isPermanent ? "permanente" : "única",
                  selectedDate: classSchedules[0]?.date || "",
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
                  selectedTime: "6:00 AM",
                });
              }}
            />
          ))}
        </div>

        {/* Calendario */}
        <div className="bg-white rounded-2xl overflow-hidden border border-stone-100">
          {/* Header días */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-stone-100">
            <div className="p-3 bg-stone-50" />
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, i) => {
              const today = new Date();
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - today.getDay() + i + 1);
              const isToday =
                startOfWeek.toDateString() === today.toDateString();
              return (
                <div
                  key={day}
                  className={`p-3 text-center border-l border-stone-100 ${isToday ? "bg-[#e8f0e8]" : "bg-stone-50"}`}
                >
                  <p
                    className={`text-md font-medium ${isToday ? "text-[#3a5a3a]" : "text-stone-600"}`}
                  >
                    {day}
                  </p>
                  <p
                    className={`text-md ${isToday ? "text-[#3a5a3a] font-medium" : "text-stone-400"}`}
                  >
                    {startOfWeek.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Filas de horas */}
          {Array.from({ length: 17 }, (_, i) => i + 6).map((hour) => (
            <div
              key={hour}
              className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-stone-100"
            >
              <div className="p-2 text-right pr-3 bg-stone-50 border-r border-stone-100">
                <p className="text-md text-stone-400">{hour}:00</p>
              </div>
              {[1, 2, 3, 4, 5, 6, 0].map((dayIndex) => {
                const classesInCell = validSchedules.filter((s) => {
                  const [h, m] = s.time.split(":").map(Number);
                  return s.day === dayIndex && h === hour;
                });
                const halfHourClasses = validSchedules.filter((s) => {
                  const [h, m] = s.time.split(":").map(Number);
                  return s.day === dayIndex && h === hour && m === 30;
                });
                return (
                  <div
                    key={dayIndex}
                    className="relative border-l border-stone-100 h-14 overflow-hidden hover:bg-stone-50 transition-colors"
                  >
                    {classesInCell
                      .filter((s) => {
                        const [h, m] = s.time.split(":").map(Number);
                        return m === 0;
                      })
                      .map((s) => (
                        <div
                          key={s.schedule_id}
                          className="mx-1 mt-1 bg-[#e8f0e8] border-l-2 border-[#3a5a3a] rounded px-2 py-1"
                        >
                          <p className="text-md font-medium text-[#3a5a3a] leading-tight">
                            {s.name}
                          </p>
                          <p className="text-md text-[#3B6D11] leading-tight">
                            {s.instructor}
                          </p>
                        </div>
                      ))}
                    {halfHourClasses.map((s) => (
                      <div
                        key={s.schedule_id}
                        className="mx-1 bg-[#e8f0e8] border-l-2 border-[#3a5a3a] rounded px-2 py-1"
                        style={{ marginTop: "50%" }}
                      >
                        <p className="text-md font-medium text-[#3a5a3a] leading-tight">
                          {s.name}
                        </p>
                        <p className="text-md text-[#3B6D11] leading-tight">
                          {s.instructor}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/*Formulario agregar clase */}
        {classPopup && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto flex flex-col gap-4">
              <p className="font-semibold text-stone-800 text-lg">
                {popupMode === "add" ? "Agregar clase" : "Editar clase"}
              </p>

              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Nombre de la clase
                </label>
                <input
                  type="text"
                  value={newClassForm.name}
                  onChange={(e) =>
                    setNewClassForm({ ...newClassForm, name: e.target.value })
                  }
                  placeholder="Reformer Básico"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                />
              </div>

              <div>
                <label className="text-md text-stone-600 block mb-1.5">
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
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors text-stone-600"
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
                  <label className="text-md text-stone-600 block mb-1.5">
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
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-md text-stone-600 block mb-1.5">
                    Precio
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400">$</span>
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
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-md text-stone-600 block mb-2">
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
                      className="accent-[#3a5a3a]"
                    />
                    <span className="text-md text-stone-700">Única</span>
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
                      className="accent-[#3a5a3a]"
                    />
                    <span className="text-md text-stone-700">Permanente</span>
                  </label>
                </div>
              </div>

              {newClassForm.classType === "única" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-md text-stone-600 block mb-1.5">
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
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-md text-stone-600 block mb-1.5">
                      Hora
                    </label>
                    <select
                      value={newClassForm.selectedTime}
                      onChange={(e) =>
                        setNewClassForm({
                          ...newClassForm,
                          selectedTime: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none text-stone-600"
                    >
                      {[
                        "6:00 AM",
                        "6:30 AM",
                        "7:00 AM",
                        "7:30 AM",
                        "8:00 AM",
                        "8:30 AM",
                        "9:00 AM",
                        "9:30 AM",
                        "10:00 AM",
                        "10:30 AM",
                        "11:00 AM",
                        "11:30 AM",
                        "12:00 PM",
                        "12:30 PM",
                        "1:00 PM",
                        "1:30 PM",
                        "2:00 PM",
                        "2:30 PM",
                        "3:00 PM",
                        "3:30 PM",
                        "4:00 PM",
                        "4:30 PM",
                        "5:00 PM",
                        "5:30 PM",
                        "6:00 PM",
                        "6:30 PM",
                        "7:00 PM",
                        "7:30 PM",
                        "8:00 PM",
                        "8:30 PM",
                        "9:00 PM",
                        "9:30 PM",
                        "10:00 PM",
                      ].map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {newClassForm.classType === "permanente" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-md text-stone-600 block mb-2">
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
                            className="accent-[#3a5a3a]"
                          />
                          <span className="text-md text-stone-700">{d}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-md text-stone-600 block mb-1.5">
                      Hora
                    </label>
                    <select
                      value={newClassForm.selectedTime}
                      onChange={(e) =>
                        setNewClassForm({
                          ...newClassForm,
                          selectedTime: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none text-stone-600"
                    >
                      {[
                        "6:00 AM",
                        "6:30 AM",
                        "7:00 AM",
                        "7:30 AM",
                        "8:00 AM",
                        "8:30 AM",
                        "9:00 AM",
                        "9:30 AM",
                        "10:00 AM",
                        "10:30 AM",
                        "11:00 AM",
                        "11:30 AM",
                        "12:00 PM",
                        "12:30 PM",
                        "1:00 PM",
                        "1:30 PM",
                        "2:00 PM",
                        "2:30 PM",
                        "3:00 PM",
                        "3:30 PM",
                        "4:00 PM",
                        "4:30 PM",
                        "5:00 PM",
                        "5:30 PM",
                        "6:00 PM",
                        "6:30 PM",
                        "7:00 PM",
                        "7:30 PM",
                        "8:00 PM",
                        "8:30 PM",
                        "9:00 PM",
                        "9:30 PM",
                        "10:00 PM",
                      ].map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setClassPopup(false)}
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={
                    popupMode === "add" ? handleAddClass : handleEditClass
                  }
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
