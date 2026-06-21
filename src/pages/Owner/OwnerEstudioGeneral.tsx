import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";

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
  };
  const owner = JSON.parse(localStorage.getItem("user") || "{}");
  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    fetch(`http://localhost:3001/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, []);

  //Paso para saber que boton hizo clic
  type EditMode =
    | "name"
    | "description"
    | "address"
    | "logo"
    | "cover"
    | "logo"
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
  });

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
      neighborhoods: data.places.map((p: any) => p["place name"]),
    });
    // Actualiza también el editForm
    setEditForm((prev) => ({ ...prev, state, city }));
  };

  const handleUpdateStudio = async () => {
    const res = await fetch(`http://localhost:3001/studios/${studio?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      setEditMode(null);
      fetch(`http://localhost:3001/studios/owner/${owner.id}`)
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

  //Mapa para la dirección
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
            className="text-[#3a5a3a] cursor-pointer"
          />
          <h1
            className="text-4xl md:text-6xl font-semibold text-stone-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Mi{" "}
            <span
              className="italic text-[#3a5a3a]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Estudio
            </span>
          </h1>
        </div>

        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {/* Información General */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <p className="font-semibold text-stone-800">
                Información General
              </p>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <p className="text-md text-stone-600 mb-0.5">
                  Nombre del estudio
                </p>
                <p className="text-stone-800">{studio?.name}</p>
              </div>
              <button
                onClick={() => {
                  setEditMode("name");
                  setEditForm({ ...editForm, name: studio?.name || "" });
                }}
                className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="flex items-start justify-between px-5 py-4">
              <div>
                <p className="text-md text-stone-600 mb-0.5">Descripción</p>
                <p className="text-stone-800 max-w-sm">{studio?.description}</p>
              </div>
              <button
                onClick={() => {
                  setEditMode("description");
                  setEditForm({
                    ...editForm,
                    description: studio?.description || "",
                  });
                }}
                className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
          </div>

          {/* Dirección y contacto */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <p className="font-semibold text-stone-800">
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
                  <p className="text-md text-stone-600">{item.label}</p>
                  <p className="text-stone-800">{item.value || "—"}</p>
                </div>
              ))}
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
                  className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
                >
                  Editar dirección
                </button>
              </div>
            </div>
          </div>

          {/* Medios */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <p className="font-semibold text-stone-800">Medios</p>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <p className="text-md text-stone-600 mb-1">Imagen de perfil</p>
                {studio?.logo_url ? (
                  <img
                    src={studio.logo_url}
                    className="w-16 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <p className="text-md text-stone-400">Sin imagen</p>
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
                className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-md text-stone-600 mb-1">Imagen de portada</p>
                {studio?.cover_url ? (
                  <img
                    src={studio.cover_url}
                    className="w-16 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <p className="text-md text-stone-400">Sin imagen</p>
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
                className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
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
              <p className="font-semibold text-stone-800 text-lg text-center">
                Cambiar nombre del estudio
              </p>
              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Nombre
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  placeholder={studio?.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
              <p className="font-semibold text-stone-800 text-lg text-center">
                Cambiar descripción del estudio
              </p>
              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Descripción
                </label>
                <textarea
                  value={editForm.description}
                  placeholder={studio?.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors resize-none"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditMode(null)}
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
              <p className="font-semibold text-stone-800 text-lg text-center">
                Editar dirección
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-stone-600 block mb-1.5">
                    País
                  </label>
                  <select
                    value={editForm.country}
                    onChange={(e) =>
                      setEditForm({ ...editForm, country: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none text-stone-600"
                  >
                    <option value="MX">México</option>
                  </select>
                </div>
                <div>
                  <label className="text-md text-stone-600 block mb-1.5">
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
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-stone-600 block mb-1.5">
                    Estado
                  </label>
                  <select
                    value={editForm.state}
                    onChange={(e) =>
                      setEditForm({ ...editForm, state: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none text-stone-600"
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
                  <label className="text-md text-stone-600 block mb-1.5">
                    Ciudad
                  </label>
                  <select
                    value={editForm.city}
                    onChange={(e) =>
                      setEditForm({ ...editForm, city: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none text-stone-600"
                  >
                    <option value="">{zipData?.city || "Ingresa tu CP"}</option>
                    {zipData && (
                      <option value={zipData.city}>{zipData.city}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Colonia
                </label>
                <select
                  value={editForm.neighborhood}
                  onChange={(e) =>
                    setEditForm({ ...editForm, neighborhood: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none text-stone-600"
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
                <label className="text-md text-stone-600 block mb-1.5">
                  Calle
                </label>
                <input
                  type="text"
                  value={editForm.street}
                  onChange={(e) =>
                    setEditForm({ ...editForm, street: e.target.value })
                  }
                  placeholder="Av. Juárez"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-md text-stone-600 block mb-1.5">
                    Número exterior
                  </label>
                  <input
                    type="text"
                    value={editForm.ext_number}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ext_number: e.target.value })
                    }
                    placeholder="123"
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-md text-stone-600 block mb-1.5">
                    Número interior
                  </label>
                  <input
                    type="text"
                    value={editForm.int_number}
                    onChange={(e) =>
                      setEditForm({ ...editForm, int_number: e.target.value })
                    }
                    placeholder="2B (opcional)"
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-md outline-none focus:border-stone-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-md text-stone-600 block mb-1.5">
                  Ubica tu estudio en el mapa
                </label>
                <p className="text-md text-stone-400 mb-2">
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
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
              <p className="font-semibold text-stone-800 text-lg text-center">
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
                className="w-full text-md text-stone-600 hover:cursor-pointer"
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
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
              <p className="font-semibold text-stone-800 text-lg text-center">
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
                className="w-full text-md text-stone-600 hover:cursor-pointer"
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
                  className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStudio}
                  className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-md hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
