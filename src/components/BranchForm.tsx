// Alta de una sucursal. Pide lo mismo que el registro del estudio: nombre,
// descripcion, direccion con el pin del mapa, telefono, horario e imagenes.
//
// Nada es obligatorio salvo el nombre. Una sucursal a medias se crea igual,
// pero no se publica: el panel le dice al dueño que le falta hasta que la
// completa. Asi puede dar de alta la sucursal hoy y subir las fotos despues.
import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";

import { ApiError } from "../lib/api";
import { createBranch } from "../lib/branches";
import StudioHoursEditor from "./StudioHoursEditor";
import { defaultWeek, toPayload, validateWeek, type DayHours } from "../lib/hours";
import { estados } from "../data/estados";

// Respuesta de api.zippopotam.us: las claves llevan espacio, tal cual las
// manda ese servicio.
type ZipPlace = {
  "place name": string;
  state: string;
};

// Va fuera del componente a proposito: declarado dentro, React lo trataba como
// un componente nuevo en cada render y el mapa se reiniciaba.
//
// Solo escucha el clic; el marcador se pinta aparte, para que el mapa no
// aparezca con un pin puesto donde el dueño no ha marcado nada.
function EscuchaElClic({
  setPosition,
}: {
  setPosition: (pos: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

const input =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md outline-none focus:border-slate-400 transition-colors";
const label = "text-md text-slate-600 block mb-1.5";

interface Props {
  onClose: () => void;
  /** Se llama con el id de la sucursal recien creada. */
  onCreated: (id: number) => void;
}

function BranchForm({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: "",
    branch_name: "",
    description: "",
    zip_code: "",
    neighborhood: "",
    street: "",
    ext_number: "",
    int_number: "",
    city: "",
    state: "",
    country: "México",
    phone: "",
    logo_url: "",
    cover_url: "",
  });
  const [week, setWeek] = useState<DayHours[]>(defaultWeek);
  // Guadalajara, solo como punto de partida del mapa.
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [mapCenter] = useState<[number, number]>([20.6737, -103.348]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  const [zipData, setZipData] = useState<{ neighborhoods: string[] } | null>(
    null,
  );

  const fetchZipData = async (zip: string) => {
    if (zip.length < 4) return;
    const res = await fetch(`https://api.zippopotam.us/MX/${zip}`);
    if (!res.ok) return;
    const data = await res.json();
    setZipData({
      neighborhoods: data.places.map((p: ZipPlace) => p["place name"]),
    });
    setForm((prev) => ({
      ...prev,
      state: data.places[0]["state"],
      city: data.places[0]["place name"],
    }));
  };

  const uploadImage = async (file: File, field: "logo_url" | "cover_url") => {
    setUploading(field === "logo_url" ? "logo" : "cover");
    try {
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
      if (data.secure_url) setForm((prev) => ({ ...prev, [field]: data.secure_url }));
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Escribe el nombre de la sucursal");
      return;
    }
    // El horario solo se manda si algun dia abre; si no, se guarda sin
    // horario y queda como uno de los pendientes de la sucursal.
    const abiertos = week.filter((d) => d.open);
    if (abiertos.length > 0) {
      const errorHorario = validateWeek(week);
      if (errorHorario) {
        setError(errorHorario);
        return;
      }
    }

    setError("");
    setSaving(true);
    try {
      const { id } = await createBranch({
        ...form,
        latitude: pin ? pin[0] : null,
        longitude: pin ? pin[1] : null,
        hours: abiertos.length > 0 ? toPayload(week) : [],
      });
      onCreated(id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No pudimos crear la sucursal",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col gap-5">
        <div>
          <p className="font-semibold text-slate-800 text-lg">
            Nueva sucursal
          </p>
          <p className="text-md text-slate-500">
            Lo que dejes en blanco lo puedes llenar después. La sucursal no
            aparece en el catálogo hasta que esté completa.
          </p>
        </div>

        <div>
          <label className={label}>Nombre del estudio</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="GAIA Studio Providencia"
            className={input}
          />
          <p className="text-xs text-slate-400 mt-1">
            Es el que ven tus alumnos en el catálogo.
          </p>
        </div>

        <div>
          <label className={label}>Nombre corto (opcional)</label>
          <input
            type="text"
            value={form.branch_name}
            onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
            placeholder="Providencia"
            className={input}
          />
          <p className="text-xs text-slate-400 mt-1">
            Solo para distinguirla aquí en tu panel.
          </p>
        </div>

        <div>
          <label className={label}>Descripción</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Qué hace especial a esta sucursal"
            className={input}
          />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="font-semibold text-slate-800 mb-3">
            Dirección y contacto
          </p>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Código Postal</label>
                <input
                  type="text"
                  value={form.zip_code}
                  onChange={(e) => {
                    setForm({ ...form, zip_code: e.target.value });
                    fetchZipData(e.target.value);
                  }}
                  placeholder="44100"
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Estado</label>
                <select
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className={`${input} text-slate-600`}
                >
                  <option value="">Selecciona un estado</option>
                  {estados.map((e: string) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={label}>Colonia</label>
              {zipData ? (
                <select
                  value={form.neighborhood}
                  onChange={(e) =>
                    setForm({ ...form, neighborhood: e.target.value })
                  }
                  className={`${input} text-slate-600`}
                >
                  <option value="">Selecciona una colonia</option>
                  {zipData.neighborhoods.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.neighborhood}
                  onChange={(e) =>
                    setForm({ ...form, neighborhood: e.target.value })
                  }
                  placeholder="Escribe el código postal para elegirla"
                  className={input}
                />
              )}
            </div>

            <div>
              <label className={label}>Ciudad</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Guadalajara"
                className={input}
              />
            </div>

            <div>
              <label className={label}>Calle</label>
              <input
                type="text"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                placeholder="Av. Juárez"
                className={input}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Número exterior</label>
                <input
                  type="text"
                  value={form.ext_number}
                  onChange={(e) =>
                    setForm({ ...form, ext_number: e.target.value })
                  }
                  placeholder="123"
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Número interior</label>
                <input
                  type="text"
                  value={form.int_number}
                  onChange={(e) =>
                    setForm({ ...form, int_number: e.target.value })
                  }
                  placeholder="2B (opcional)"
                  className={input}
                />
              </div>
            </div>

            <div>
              <label className={label}>Ubica la sucursal en el mapa</label>
              <p className="text-md text-slate-400 mb-2">
                Da click en el mapa para colocar el pin
              </p>
              <MapContainer
                center={mapCenter}
                zoom={13}
                className="w-full h-48 rounded-xl z-0"
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <EscuchaElClic setPosition={setPin} />
                {pin && <Marker position={pin} />}
              </MapContainer>
              {!pin && (
                <p className="text-xs text-amber-700 mt-1">
                  Todavía no has colocado el pin.
                </p>
              )}
            </div>

            <div>
              <label className={label}>Teléfono</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="33 1234 5678"
                className={input}
              />
              <p className="text-xs text-slate-400 mt-1">
                Es el que ven tus alumnos.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="font-semibold text-slate-800 mb-1">Horario</p>
          <p className="text-md text-slate-400 mb-3">
            Con él, tus alumnos ven si esta sucursal está abierta
          </p>
          <StudioHoursEditor value={week} onChange={setWeek} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="font-semibold text-slate-800 mb-3">Medios</p>
          <div className="flex flex-col gap-4">
            {(
              [
                { field: "logo_url", titulo: "Imagen de perfil", key: "logo" },
                { field: "cover_url", titulo: "Imagen de portada", key: "cover" },
              ] as const
            ).map(({ field, titulo, key }) => (
              <div key={field}>
                <label className={label}>{titulo}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(file, field);
                  }}
                  className="w-full text-md text-slate-600 hover:cursor-pointer"
                />
                {uploading === key && (
                  <p className="text-md text-slate-400 mt-1">Subiendo…</p>
                )}
                {form[field] && (
                  <img
                    src={form[field]}
                    className="w-full h-28 object-cover rounded-xl mt-2"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="text-md text-red-600 bg-red-50 rounded-xl px-4 py-3"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading !== null}
            className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-md hover:bg-[#33506f] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Creando…" : "Crear sucursal"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BranchForm;
