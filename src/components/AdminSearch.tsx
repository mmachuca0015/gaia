import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

// Lo que espera despues de la ultima tecla antes de buscar: sin esto seria
// una consulta por letra.
const SEARCH_MS = 350;

type AdminSearchProps = {
  placeholder: string;
  /** Se llama con el texto ya limpio, cuando se deja de escribir. */
  onSearch: (q: string) => void;
};

/* Buscador de las tablas del panel de admin. La espera vive aqui adentro para
   que las cuatro pantallas busquen igual y no haya cuatro copias del mismo
   temporizador. */
function AdminSearch({ placeholder, onSearch }: AdminSearchProps) {
  const [text, setText] = useState("");

  // El padre pasa una funcion nueva en cada render; guardarla en una ref
  // evita que eso reinicie la espera y la busqueda nunca salga.
  const handler = useRef(onSearch);
  useEffect(() => {
    handler.current = onSearch;
  });

  useEffect(() => {
    const timer = setTimeout(() => handler.current(text.trim()), SEARCH_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-72 max-w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#1b2c44]"
      />
    </div>
  );
}

export default AdminSearch;
