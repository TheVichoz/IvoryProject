import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle } from "lucide-react";

/**
 * API imperativa: window.showSuccess("Mensaje", { duration: 2000 })
 * - Llama esto después de un guardado exitoso (pagos, clientes, etc.)
 */
export function registerSuccessOverlayAPI() {
  window.showSuccess = (message = "Operación exitosa", opts = {}) => {
    const detail = { message, duration: opts.duration ?? 2000 };
    window.dispatchEvent(new CustomEvent("success-overlay", { detail }));
  };
}

/**
 * Backdrop accesible
 * - Se usa <button> para cumplir con accesibilidad (keyboard + screen readers)
 */
const Backdrop = ({ onClick }) => (
  <button
    type="button"
    aria-label="Cerrar mensaje de éxito"
    onClick={onClick}
    className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998] cursor-default"
  />
);

export default function SuccessOverlay() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("Operación exitosa");
  const [timer, setTimer] = useState(null);

  useEffect(() => {
    registerSuccessOverlayAPI();

    const handler = (e) => {
      const { message, duration } = e.detail || {};
      setMsg(message || "Operación exitosa");
      setOpen(true);

      if (timer) clearTimeout(timer);
      const t = setTimeout(() => setOpen(false), duration ?? 2000);
      setTimer(t);
    };

    window.addEventListener("success-overlay", handler);
    return () => {
      window.removeEventListener("success-overlay", handler);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return createPortal(
    <>
      <Backdrop onClick={() => setOpen(false)} />

      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999]
                   w-[90%] max-w-[420px] px-6 py-7 rounded-2xl bg-white shadow-2xl
                   border border-green-200 text-center animate-in fade-in zoom-in-95
                   duration-200"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <CheckCircle className="w-12 h-12 text-green-600" />
          <h3 className="text-2xl font-semibold text-green-700">¡Listo!</h3>
          <p className="text-base text-slate-700">{msg}</p>
        </div>
      </div>
    </>,
    document.body
  );
}
