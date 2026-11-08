"use client";

import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { apiRequest } from "@/lib/api";

type Notification = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

export default function NotificationCenter() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    let active = true;
    const refreshCount = () => {
      apiRequest<{ count: number }>("/api/notifications/unread-count")
        .then(({ count }) => {
          if (active) {
            setUnreadCount(count);
            setError("");
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(cause instanceof Error ? cause.message : "Could not load notifications.");
          }
        });
    };

    refreshCount();
    const interval = window.setInterval(refreshCount, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  async function toggleNotifications() {
    const shouldOpen = !open;
    setOpen(shouldOpen);
    if (!shouldOpen || !user) return;

    setLoading(true);
    try {
      setNotifications(await apiRequest<Notification[]>("/api/notifications?limit=20"));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notification: Notification) {
    try {
      const updated = await apiRequest<Notification>(
        `/api/notifications/${notification.id}/read`,
        { method: "POST" },
      );
      setNotifications((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (!notification.read_at) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notification.");
    }
  }

  if (!user) return null;

  return (
    <div className="notification-center">
      <button
        aria-controls="notification-panel"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className="sign-in-button notification-trigger"
        onClick={() => void toggleNotifications()}
        type="button"
      >
        <Bell aria-hidden="true" size={17} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>
      {open && (
        <section
          aria-label="Notifications"
          className="notification-panel"
          id="notification-panel"
        >
          <div className="notification-panel-header">
            <h2>Notifications</h2>
            <span>{unreadCount} unread</span>
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {loading ? (
            <p className="notification-empty">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <p className="notification-empty">You’re all caught up.</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((notification) => (
                <li
                  className={`notification-item${notification.read_at ? "" : " unread"}`}
                  key={notification.id}
                >
                  <div className="notification-item-heading">
                    <h3>{notification.title}</h3>
                    {!notification.read_at && (
                      <button
                        aria-label={`Mark ${notification.title} as read`}
                        className="notification-read-button"
                        onClick={() => void markAsRead(notification)}
                        type="button"
                      >
                        <Check aria-hidden="true" size={15} />
                      </button>
                    )}
                  </div>
                  <p>{notification.message}</p>
                  <time dateTime={notification.created_at}>
                    {new Date(notification.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
