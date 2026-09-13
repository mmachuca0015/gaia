import type { ReactNode } from "react";

type BrowserFrameProps = {
  url: string;
  children: ReactNode;
};

/* Marco de navegador para los renders de la app. Es decoracion: no hay nada
   interactivo adentro, solo una captura hecha con markup. */
function BrowserFrame({ url, children }: BrowserFrameProps) {
  return (
    <div className="rounded-2xl border border-line bg-paper overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-surface">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        </div>
        <div className="flex-1 text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-paper border border-line text-[10px] text-slate-400">
            {url}
          </span>
        </div>
        <div className="w-12" />
      </div>
      {children}
    </div>
  );
}

export default BrowserFrame;
