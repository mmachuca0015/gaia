import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";

import { api, apiJson, ApiError } from "../../lib/api";
import StudioHoursEditor from "../../components/StudioHoursEditor";
import {
  DAY_NAMES,
  WEEK_ORDER,
  formatRange,
  toPayload,
  validateWeek,
  weekFrom,
  type DayHours,
  type StudioHour,
} from "../../lib/hours";
// Respuesta de api.zippopotam.us: las claves llevan espacio, tal cual las
// manda ese servicio.
type ZipPlace = {
  "place name": string;
  state: string;
};

// Mapa para la direccion. Va fuera del componente a proposito: declarado
// dentro, React lo trataba como un componente nuevo en cada render y el marcador
// perdia su estado cada vez que se redibujaba el formulario.
function DraggableMarker({
  position,
  setPosition,
}: {
  position: [number, number];
  setPosition: (pos: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return <Marker position={position} />;
}

function OwnerEstudioGeneral() {
  const navigate = useNavigate();
  type Studio = {
    id: number;
    name: string;
    description: string;
    street: string;
    ext_number: string;
    int_number: string;
    neighborhood: string;
    city: string;
    state: string;
    country: string;
    zip_code: string;
    cover_url: string;
    logo_url: string;
    phone: string | null;
    /** Horario de atencion; vacio si el estudio aun no lo captura. */
    hours: StudioHour[];
  };
  const owner = JSON.parse(localStorage.getItem("user") || "{}");
  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, [owner.id]);

  //Paso para saber que boton hizo clic
  type EditMode =
    | "name"
    | "description"
    | "address"
    | "logo"
    | "cover"
    | "logo"
    | "phone"
    | "hours"
    | null;
  const [editMode, setEditMode] = useState<EditMode>(null);

  //Formulario para editar
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    street: "",
    ext_number: "",
    int_number: "",
    neighborhood: "",
    city: "",
    state: "",
    country: "México",
    zip_code: "",
    cover_url: "",
    logo_url: "",
    latitude: 0,
    longitude: 0,
    phone: "",
  });

  // Horario en edicion y error de cualquiera de los pop ups.
  const [hoursDraft, setHoursDraft] = useState<DayHours[]>([]);
  const [modalError, setModalError] = useState("");

  const reloadStudio = () =>
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));

  const handleSavePhone = async () => {
    setModalError("");
    try {
      await apiJson(`/studios/${studio?.id}`, {
        method: "PUT",
        body: JSON.stringify({ phone: editForm.phone }),
      });
      setEditMode(null);
      reloadStudio();
    } catch (err) {
      setModalError(
        err instanceof ApiError ? err.message : "No pudimos guardar el teléfono",
      );
    }
  };

  const handleSaveHours = async () => {
    const error = validateWeek(hoursDraft);
    if (error) {
      setModalError(error);
      return;
    }
    setModalError("");
    try {
      await apiJson(`/studios/${studio?.id}/hours`, {
        method: "PUT",
        body: JSON.stringify({ hours: toPayload(hoursDraft) }),
      });
      setEditMode(null);
      reloadStudio();
    } catch (err) {
      setModalError(
        err instanceof ApiError ? err.message : "No pudimos guardar el horario",
      );
    }
  };

  //Estado para la iformación de la api para direcciones
  const [zipData, setZipData] = useState<{
    state: string;
    city: string;
    neighborhoods: string[];
  } | null>(null);
  //Función que llama a la API cuando el usuario escribe el CP
  const fetchZipData = async (zip: string, country: string) => {
    if (zip.length < 4) return;
    const res = await fetch(`https://api.zippopotam.us/${country}/${zip}`);
    if (!res.ok) return;
    const data = await res.json();
    const state = data.places[0]["state"];
    const city = data.places[0]["place name"];
    setZipData({
      state,
      city,
      neighborhoods: data.places.map((p: ZipPlace) => p["place name"]),
    });
    // Actualiza también el editForm
    setEditForm((prev) => ({ ...prev, state, city }));
  };

  const handleUpdateStudio = async () => {
    const res = await api(`/studios/${studio?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      setEditMode(null);
      api(`/studios/owner/${owner.id}`)
        .then((res) => res.json())
        .then((data) => setStudio(data));
    }
  };

  //Cloudinary upload
  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "upload_preset",
      import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET,
    );

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData },
    );
    const data = await res.json();
    return data.secure_url;
  };

  const [markerPosition, setMarkerPosition] = useState<[number, number]>([
    20.6737, -103.348,
  ]);

  if (!studio) return null;
  return (
    <div>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <ArrowLeft
            size={22}
            onClick={() => navigate(-1)}
            className="text-[#1b2c44] cursor-pointer"
          />
          <h1
            className="text-4xl md:text-6xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Mi{" "}
            <span
              className="text-[#1b2c44]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Estudio
            </span>
          </h1>
        </div>

        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {/* Información General */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="font-semibold text-slate-800">
                Información General
              </p>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-md text-slate-600 mb-0.5">
                  Nombre del estudio
                </p>
                <p className="text-slate-800">{studio?.name}</p>
              </div>
              <button
                onClick={() => {
                  setEditMode("name");
                  setEditForm({ ...editForm, name: studio?.name || "" });
                }}
                className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="flex items-start justify-between px-5 py-4">
              <div>
                <p className="text-md text-slate-600 mb-0.5">Descripción</p>
                <p className="text-slate-800 max-w-sm">{studio?.description}</p>
              </div>
              <button
                onClick={() => {
                  setEditMode("description");
                  setEditForm({
                    ...editForm,
                    description: studio?.description || "",
                  });
                }}
                className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
          </div>

          {/* Dirección y contacto */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="font-semibold text-slate-800">
                Dirección y contacto
              </p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              {[
                { label: "Calle", value: studio?.street },
                { label: "Número exterior", value: studio?.ext_number },
                { label: "Número interior", value: studio?.int_number },
                { label: "Colonia", value: studio?.neighborhood },
                { label: "Código Postal", value: studio?.zip_code },
                { label: "Ciudad", value: studio?.city },
                { label: "Estado", value: studio?.state },
                { label: "País", value: studio?.country },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <p className="text-md text-slate-600">{item.label}</p>
                  <p className="text-slate-800">{item.value || "—"}</p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100">
                <div>
                  <p className="text-md text-slate-600">Teléfono</p>
                  <p className="text-xs text-slate-400">
                    Es el que ven tus alumnos
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-slate-800">{studio?.phone || "—"}</p>
                  <button
                    onClick={() => {
                      setModalError("");
                      setEditMode("phone");
                      setEditForm({ ...editForm, phone: studio?.phone || "" });
                    }}
                    className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
                  >
                    Editar
                  </button>
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => {
                    setEditMode("address");
                    setEditForm({
                      ...editForm,
                      street: studio?.street || "",
                      ext_number: studio?.ext_number || "",
                      int_number: studio?.int_number || "",
                      neighborhood: studio?.neighborhood || "",
                      city: studio?.city || "",
                      state: studio?.state || "",
                      country: "MX",
                      zip_code: studio?.zip_code || "",
                    });
                  }}
                  className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
                >
                  Editar dirección
                </button>
              </div>
            </div>
          </div>

          {/* Horario de atencion */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">Horario</p>
                <p className="text-xs text-slate-400">
                  Con él, tus alumnos ven si estás abierto
                </p>
              </div>
              <button
                onClick={() => {
                  setModalError("");
                  setHoursDraft(weekFrom(studio?.hours));
                  setEditMode("hours");
                }}
                className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
              >
                {studio?.hours?.length ? "Editar" : "Agregar horario"}
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-2">
              {studio?.hours?.length ? (
                WEEK_ORDER.map((day) => {
                  const h = studio.hours.find((x) => x.day === day);
                  return (
                    <div key={day} className="flex items-center justify-between">
                      <p className="text-md text-slate-600">{DAY_NAMES[day]}</p>
                      <p className={h ? "text-slate-800" : "text-slate-400"}>
                        {h ? formatRange(h.opens, h.closes) : "Cerrado"}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
                  Aún no tienes horario. Agrégalo para que tus alumnos sepan
                  cuándo estás abierto.
                </p>
              )}
            </div>
          </div>

          {/* Medios */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="font-semibold text-slate-800">Medios</p>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-md text-slate-600 mb-1">Imagen de perfil</p>
                {studio?.logo_url ? (
                  <img
                    src={studio.logo_url}
                    className="w-16 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <p className="text-md text-slate-400">Sin imagen</p>
                )}
              </div>
              <button
                onClick={() => {
                  setEditMode("logo");
                  setEditForm({
                    ...editForm,
                    logo_url: studio?.logo_url || "",
                  });
                }}
                className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-md text-slate-600 mb-1">Imagen de portada</p>
                {studio?.cover_url ? (
                  <img
                    src={studio.cover_url}
                    className="w-16 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <p className="text-md text-slate-400">Sin imagen</p>
                )}
              </div>
              <button
                onClick={() => {
                  setEditMode("cover");
                  setEditForm({
                    ...editForm,
                    cover_url: studio?.cover_url || "",
                  });
                }}
                className="text-md text-[#1b2c44] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
          </div>
        </div>

        {/* Formulario para editar el nombre del estudio */}
        {editMode === "name" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Cambiar nombre del estudio
              </p>
              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Nombre
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  placeholder={studio?.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Formulario para editar la descripción del estudio */}
        {editMode === "description" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-2xl mx-4 flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Cambiar descripción del estudio
              </p>
              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Descripción
                </label>
                <textarea
                  value={editForm.description}
                  placeholder={studio?.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors resize-none"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Formulario para editar la dirección */}
        {editMode === "address" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Editar dirección
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    País
                  </label>
                  <select
                    value={editForm.country}
                    onChange={(e) =>
                      setEditForm({ ...editForm, country: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                  >
                    <option value="MX">México</option>
                  </select>
                </div>
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Código Postal
                  </label>
                  <input
                    type="text"
                    value={editForm.zip_code}
                    onChange={(e) => {
                      setEditForm({ ...editForm, zip_code: e.target.value });
                      fetchZipData(e.target.value, editForm.country);
                    }}
                    placeholder="45010"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Estado
                  </label>
                  <select
                    value={editForm.state}
                    onChange={(e) =>
                      setEditForm({ ...editForm, state: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                  >
                    <option value="">
                      {zipData?.state || "Ingresa tu CP"}
                    </option>
                    {zipData && (
                      <option value={zipData.state}>{zipData.state}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Ciudad
                  </label>
                  <select
                    value={editForm.city}
                    onChange={(e) =>
                      setEditForm({ ...editForm, city: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                  >
                    <option value="">{zipData?.city || "Ingresa tu CP"}</option>
                    {zipData && (
                      <option value={zipData.city}>{zipData.city}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Colonia
                </label>
                <select
                  value={editForm.neighborhood}
                  onChange={(e) =>
                    setEditForm({ ...editForm, neighborhood: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none text-slate-600"
                >
                  <option value="">Selecciona una colonia</option>
                  {zipData?.neighborhoods.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Calle
                </label>
                <input
                  type="text"
                  value={editForm.street}
                  onChange={(e) =>
                    setEditForm({ ...editForm, street: e.target.value })
                  }
                  placeholder="Av. Juárez"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Número exterior
                  </label>
                  <input
                    type="text"
                    value={editForm.ext_number}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ext_number: e.target.value })
                    }
                    placeholder="123"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-md text-slate-600 block mb-1.5">
                    Número interior
                  </label>
                  <input
                    type="text"
                    value={editForm.int_number}
                    onChange={(e) =>
                      setEditForm({ ...editForm, int_number: e.target.value })
                    }
                    placeholder="2B (opcional)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Ubica tu estudio en el mapa
                </label>
                <p className="text-md text-slate-400 mb-2">
                  Da click en el mapa para colocar el pin
                </p>
                <MapContainer
                  center={markerPosition}
                  zoom={15}
                  className="w-full h-48 rounded-xl z-0"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <DraggableMarker
                    position={markerPosition}
                    setPosition={(pos) => {
                      setMarkerPosition(pos);
                      setEditForm({
                        ...editForm,
                        latitude: pos[0],
                        longitude: pos[1],
                      });
                    }}
                  />
                </MapContainer>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Telefono de contacto */}
        {editMode === "phone" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Teléfono del estudio
              </p>
              <div>
                <label className="text-md text-slate-600 block mb-1.5">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  placeholder="33 1234 5678"
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors"
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  Tus alumnos lo ven en la página de tu estudio.
                </p>
              </div>
              {modalError && (
                <p className="text-sm text-red-500 text-center">{modalError}</p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePhone}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Horario de atencion */}
        {editMode === "hours" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Horario del estudio
              </p>
              <p className="text-sm text-slate-500 text-center -mt-2">
                Marca los días que abres y a qué hora.
              </p>
              <StudioHoursEditor value={hoursDraft} onChange={setHoursDraft} />
              {modalError && (
                <p className="text-sm text-red-500 text-center">{modalError}</p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveHours}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {editMode === "cover" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Imagen de portada
              </p>

              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await uploadImage(file);
                  setEditForm({ ...editForm, cover_url: url });
                }}
                className="w-full text-md text-slate-600 hover:cursor-pointer"
              />

              {editForm.cover_url && (
                <img
                  src={editForm.cover_url}
                  className="w-full h-32 object-cover rounded-xl"
                />
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {editMode === "logo" && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 flex flex-col gap-4">
              <p className="font-semibold text-slate-800 text-lg text-center">
                Logo del estudio
              </p>

              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await uploadImage(file);
                  setEditForm({ ...editForm, logo_url: url });
                }}
                className="w-full text-md text-slate-600 hover:cursor-pointer"
              />

              {editForm.logo_url && (
                <img
                  src={editForm.logo_url}
                  className="w-full h-32 object-cover rounded-xl"
                />
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OwnerEstudioGeneral;
