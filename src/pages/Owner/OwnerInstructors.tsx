import InstructorCard from "../../components/InstructorCard";
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";

import { api } from "../../lib/api";
function OwnerInstructors() {
  //Obtener datos del estudio
  type Studio = {
    id: number;
    name: string;
  };
  const owner = JSON.parse(localStorage.getItem("user") || "{}");
  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, []);
  const studioId = studio?.id;
  //Obtener instructores del estudio
  const [instructors, setInstructors] = useState<any[]>([]);
  useEffect(() => {
    if (studio) {
      api(`/studios/${studioId}/instructors`)
        .then((res) => res.json())
        .then((data) => setInstructors(data));
    }
  }, [studio]);

  //Saber desde cuando se unió el instructor al estudio
  const getTimeSince = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const months = Math.floor(
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 30),
    );
    const days =
      Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)) %
      30;
    if (months === 0) return `${days} días`;
    return `${months} meses, ${days} días`;
  };

  //Formulario para agregar nuevo instructor
  const [showInstructorForm, setShowInstructorForm] = useState(false);
  const [newInstructorForm, setNewInstructorForm] = useState({
    name: "",
    last_name: "",
  });

  const handleAddInstructor = async () => {
    if (!newInstructorForm.name || !newInstructorForm.last_name) {
      alert("Por favor llena todos los campos");
      return;
    }
    const res = await api(`/studios/${studio?.id}/instructors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newInstructorForm),
    });
    if (res.ok) {
      setShowInstructorForm(false);
      setNewInstructorForm({ name: "", last_name: "" });
      api(`/studios/${studio?.id}/instructors`)
        .then((res) => res.json())
        .then((data) => setInstructors(data));
    }
  };

  //Eliminar un instructor
  const [deleteInstructorId, setDeleteInstructorId] = useState<number | null>(
    null,
  );

  const handleDeleteInstructor = async (instructorId: number) => {
    const res = await api(
      `/studios/${studio?.id}/instructors/${instructorId}`,
      {
        method: "DELETE",
      },
    );
    if (res.ok) {
      setDeleteInstructorId(null);
      api(`/studios/${studio?.id}/instructors`)
        .then((res) => res.json())
        .then((data) => setInstructors(data));
    }
  };

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
              Instructores
            </span>
          </h1>
          <button
            onClick={() => setShowInstructorForm(true)}
            className="flex items-center gap-2 bg-[#3a5a3a] text-white px-5 py-2.5 rounded-xl text-md font-medium hover:bg-[#2e4a2e] transition-colors cursor-pointer"
          >
            <Plus size={20} />
            Agregar Instructor
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {instructors.map((instructor) => (
            <InstructorCard
              key={instructor.id}
              id={instructor.id}
              name={instructor.name}
              last_name={instructor.last_name}
              classes_per_week={instructor.classes_per_week}
              joined={getTimeSince(instructor.created_at)}
              onDelete={() => setDeleteInstructorId(instructor.id)}
            />
          ))}
        </div>

        {/* Formulario para agregar nuevo instructor */}
        {showInstructorForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col gap-4">
              <p className="font-semibold text-stone-800 text-lg text-center">
                Agregar instructor
              </p>

              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Nombre
                </label>
                <input
                  value={newInstructorForm.name}
                  onChange={(e) =>
                    setNewInstructorForm({
                      ...newInstructorForm,
                      name: e.target.value,
                    })
                  }
                  type="text"
                  placeholder="Mariana"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                />
              </div>

              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Apellido
                </label>
                <input
                  value={newInstructorForm.last_name}
                  onChange={(e) =>
                    setNewInstructorForm({
                      ...newInstructorForm,
                      last_name: e.target.value,
                    })
                  }
                  type="text"
                  placeholder="Cervantes"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                />
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowInstructorForm(false)}
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddInstructor}
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pop up de confirmación para eliminar un instructor */}
        {deleteInstructorId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col gap-4 text-center">
              <p className="font-semibold text-stone-800 text-lg">
                ¿Eliminar instructor?
              </p>
              <p className="text-md text-stone-600">
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setDeleteInstructorId(null)}
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteInstructor(deleteInstructorId)}
                  className="flex-1 bg-red-400 text-white py-2.5 rounded-xl text-md hover:bg-red-500 transition-colors cursor-pointer"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OwnerInstructors;
