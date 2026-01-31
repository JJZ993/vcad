import { useState, useRef, useEffect } from "react";
import { getSupabase } from "../client";
import { useAuthStore } from "../stores/auth-store";
import { useSyncStore } from "../stores/sync-store";

interface UserMenuProps {
  /** Callback when "Sync now" is clicked */
  onSyncNow?: () => void;
}

/**
 * User avatar dropdown menu showing account info, sync status, and sign-out option.
 */
export function UserMenu({ onSyncNow }: UserMenuProps) {
  const user = useAuthStore((s) => s.user);
  const { syncStatus, lastSyncAt } = useSyncStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSignOut = async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setOpen(false);
  };

  const formatRelativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url;
  const initials =
    user.email?.[0]?.toUpperCase() ||
    user.user_metadata?.full_name?.[0]?.toUpperCase() ||
    "U";

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium relative overflow-hidden hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 dark:hover:ring-offset-zinc-900 transition-all"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}

        {/* Sync status indicator dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${
            syncStatus === "syncing"
              ? "bg-yellow-500"
              : syncStatus === "error"
                ? "bg-red-500"
                : "bg-green-500"
          }`}
          aria-label={`Sync status: ${syncStatus}`}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-50">
          {/* User info */}
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {user.user_metadata?.full_name || user.email}
            </div>
            {user.user_metadata?.full_name && (
              <div className="text-xs text-zinc-500 truncate">{user.email}</div>
            )}
          </div>

          {/* Sync status */}
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2 text-xs text-zinc-500">
            {syncStatus === "synced" ? (
              <CloudIcon className="w-4 h-4 text-green-500" />
            ) : syncStatus === "syncing" ? (
              <CloudIcon className="w-4 h-4 text-yellow-500 animate-pulse" />
            ) : syncStatus === "error" ? (
              <CloudOffIcon className="w-4 h-4 text-red-500" />
            ) : (
              <CloudIcon className="w-4 h-4 text-zinc-400" />
            )}
            <span>
              {syncStatus === "syncing"
                ? "Syncing..."
                : syncStatus === "error"
                  ? "Sync failed"
                  : lastSyncAt
                    ? `Synced ${formatRelativeTime(lastSyncAt)}`
                    : "Not synced yet"}
            </span>
          </div>

          {/* Menu items */}
          <button
            onClick={() => {
              onSyncNow?.();
              setOpen(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Sync now
          </button>

          <button
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Simple cloud icons
function CloudIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
    </svg>
  );
}

function CloudOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3l18 18M10.5 6.5A5 5 0 0116 10.9 5 5 0 0116 19H7a4 4 0 01-.85-7.91M3 15a4 4 0 014-4"
      />
    </svg>
  );
}
