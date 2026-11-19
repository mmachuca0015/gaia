import { useState } from "react";
import { ImagePlus } from "lucide-react";

import { uploadImage } from "../lib/cloudinary";

// Selector de imagen con boton visible, barra de progreso y aviso de error.
// El input nativo se esconde: su "Elegir archivo" no cambia al pasar el mouse
// y la gente no sabia que se podia pulsar.
//
// `onUploadingChange` existe para que la pantalla bloquee su boton de Guardar
// mientras sube: guardar antes de que termine dejaba la imagen vacia.
export default function ImageUploadField({
  value,
  onChange,
  onUploadingChange,
  previewClassName = "w-full h-32 object-cover rounded-xl",
}: {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  previewClassName?: string;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const uploading = progress !== null;

  const handleFile = async (file: File) => {
    setError("");
    setProgress(0);
    onUploadingChange?.(true);
    try {
      onChange(await uploadImage(file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos subir la imagen");
    } finally {
      setProgress(null);
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        className={`flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-3 text-md transition-colors ${
          uploading
            ? "text-slate-400 cursor-not-allowed"
            : "text-ink cursor-pointer hover:bg-ink/5 hover:border-ink"
        }`}
      >
        <ImagePlus size={18} />
        {uploading ? "Subiendo…" : value ? "Cambiar imagen" : "Elegir imagen"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Se limpia para que volver a escoger el mismo archivo tras un
            // error dispare onChange otra vez.
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
      </label>

      {uploading && (
        <div
          className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-ink transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-md text-red-600">
          {error}
        </p>
      )}

      {value && (
        <img
          src={value}
          className={`${previewClassName} ${uploading ? "opacity-50" : ""}`}
        />
      )}
    </div>
  );
}
