import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  type NotificationItem,
} from "@/stores/notification-store";
import { Toast } from "./Toast";
import { AIProgressCard } from "./AIProgressCard";
import { DecisionCard } from "./DecisionCard";
import { ActionResultCard } from "./ActionResultCard";
import { WarningCard } from "./WarningCard";

const MAX_VISIBLE = 4;

/** Renders a single notification based on its kind */
function NotificationRenderer({ notification }: { notification: NotificationItem }) {
  const dismiss = useNotificationStore((s) => s.dismiss);
  const pauseAutoDismiss = useNotificationStore((s) => s.pauseAutoDismiss);
  const resumeAutoDismiss = useNotificationStore((s) => s.resumeAutoDismiss);

  const handleMouseEnter = () => {
    if ("duration" in notification) {
      pauseAutoDismiss(notification.id);
    }
  };

  const handleMouseLeave = () => {
    if ("duration" in notification) {
      resumeAutoDismiss(notification.id);
    }
  };

  const props = {
    onDismiss: notification.dismissible ? () => dismiss(notification.id) : undefined,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  };

  switch (notification.kind) {
    case "toast":
      return <Toast toast={notification} {...props} />;
    case "ai-progress":
      return <AIProgressCard progress={notification} {...props} />;
    case "decision":
      return <DecisionCard decision={notification} {...props} />;
    case "action-result":
      return <ActionResultCard result={notification} {...props} />;
    case "warning":
      return <WarningCard warning={notification} {...props} />;
  }
}

/** Container for all notifications - positioned in bottom-right corner */
export function NotificationContainer() {
  const notifications = useNotificationStore((s) => s.notifications);
  const containerRef = useRef<HTMLDivElement>(null);

  // Visible notifications (most recent first, limited to MAX_VISIBLE)
  const visibleNotifications = notifications.slice(-MAX_VISIBLE).reverse();
  const hiddenCount = Math.max(0, notifications.length - MAX_VISIBLE);

  // Announce new notifications to screen readers
  const lastNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (notifications.length === 0) return;

    const latest = notifications[notifications.length - 1];
    if (!latest || latest.id === lastNotificationId.current) return;

    lastNotificationId.current = latest.id;

    // The ARIA live region will automatically announce changes
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <>
      {/* Screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {notifications.length > 0 && (
          <>
            {notifications[notifications.length - 1]?.kind === "toast" &&
              (notifications[notifications.length - 1] as { message: string }).message}
            {notifications[notifications.length - 1]?.kind === "ai-progress" &&
              `AI operation in progress: ${(notifications[notifications.length - 1] as { prompt: string }).prompt}`}
            {notifications[notifications.length - 1]?.kind === "decision" &&
              `Decision required: ${(notifications[notifications.length - 1] as { title: string }).title}`}
            {notifications[notifications.length - 1]?.kind === "action-result" &&
              (notifications[notifications.length - 1] as { title: string }).title}
            {notifications[notifications.length - 1]?.kind === "warning" &&
              `Warning: ${(notifications[notifications.length - 1] as { title: string }).title}`}
          </>
        )}
      </div>

      {/* Visual notifications */}
      <div
        ref={containerRef}
        role="region"
        aria-label="Notifications"
        className={cn(
          "fixed bottom-4 right-4 z-50",
          "flex flex-col-reverse gap-2",
          "max-w-sm w-full pointer-events-none"
        )}
      >
        {/* Overflow indicator */}
        {hiddenCount > 0 && (
          <div className="pointer-events-auto text-center text-xs text-text-muted py-1">
            +{hiddenCount} more notification{hiddenCount > 1 ? "s" : ""}
          </div>
        )}

        {/* Visible notifications */}
        {visibleNotifications.map((notification) => (
          <div
            key={notification.id}
            className="pointer-events-auto"
          >
            <NotificationRenderer notification={notification} />
          </div>
        ))}
      </div>
    </>
  );
}
