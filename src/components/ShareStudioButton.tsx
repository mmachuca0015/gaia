// Boton para compartir el link publico de un estudio. Lo usan el dueño (Panel
// de control, "Copiar link del estudio") y el alumno (pagina del estudio,
// "Compartir estudio").
//
// El link es la pagina del estudio en la app. Quien lo abre sin sesion pasa
// por el login o el registro y vuelve al estudio (ProtectedRoute manda el
// `?redirect=` y Login.tsx lo sigue).
import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

function studioLink(studioId: number | string) {
  return `${window.location.origin}/studios/${studioId}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sin permiso de portapapeles (o sin HTTPS): el truco del textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  }
}

interface Props {
  studioId: number | string;
  studioName: string;
  /**
   * "copy" copia el link. "share" abre el menu de compartir del sistema
   * (WhatsApp, Instagram...) donde exista, y si no, copia.
   */
  mode: "copy" | "share";
  label: string;
  className?: string;
}

function ShareStudioButton({
  studioId,
  studioName,
  mode,
  label,
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const url = studioLink(studioId);
    if (mode === "share" && navigator.share) {
      try {
        await navigator.share({
          title: studioName,
          text: `Reserva tus clases en ${studioName} con Wellco`,
          url,
        });
        return;
      } catch (err) {
        // Cerrar el menu no es un error; cualquier otra falla cae a copiar.
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    if (await copyToClipboard(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Icon = copied ? Check : mode === "share" ? Share2 : Link2;

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-colors cursor-pointer ${
        copied
          ? "border-ink bg-ink text-white"
          : "border-line bg-white text-slate-600 hover:border-slate-400 hover:text-ink"
      } ${className}`}
    >
      <Icon size={15} />
      {copied ? "¡Link copiado!" : label}
    </button>
  );
}

export default ShareStudioButton;
