import { useEffect, useState } from "react";
import { X, CheckCircle, XCircle, Info } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useToastStore, type Toast } from "@/stores/toast-store";

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const COLORS = {
  success: "text-green-400 border-green-400/30",
  error: "text-red-400 border-red-400/30",
  info: "text-blue-400 border-blue-400/30",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const Icon = ICONS[toast.type];

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    // Start exit animation before removal
    const exitTimer = setTimeout(() => {
      setExiting(true);
    }, toast.duration - 200);

    return () => clearTimeout(exitTimer);
  }, [toast.duration]);

  function handleDismiss() {
    setExiting(true);
    setTimeout(() => removeToast(toast.id), 200);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 border bg-card px-3 py-2 shadow-2xl transition-all duration-200",
        COLORS[toast.type],
        visible && !exiting
          ? "translate-x-0 opacity-100"
          : "translate-x-4 opacity-0"
      )}
    >
      <Icon size={16} weight="fill" className={cn(COLORS[toast.type].split(" ")[0])} />
      <span className="text-xs text-text">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="ml-2 text-text-muted hover:text-text"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
