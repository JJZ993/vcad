/**
 * @deprecated This module is deprecated. Use notification-store instead.
 *
 * This file re-exports from notification-store for backwards compatibility.
 * New code should import from "@/stores/notification-store" directly.
 */

export {
  useNotificationStore as useToastStore,
  type Toast,
} from "./notification-store";
