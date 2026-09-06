import { NotificationItem } from "@/types/notifications";
import { apiFetch, apiList } from "./apiClient";

export class NotificationService {
  /** Newest first. The API returns the standard paginated envelope. */
  static async list(limit = 10): Promise<NotificationItem[]> {
    const res = await apiList<NotificationItem>(
      `/notifications/?limit=${limit}`,
      { method: "GET" }
    );
    return res.data;
  }

  static async unreadCount(): Promise<number> {
    const res = await apiFetch<{ count?: number }>("/notifications/unread-count/", {
      method: "GET",
    });
    return Number(res?.count ?? 0);
  }

  /** POST /notifications/mark-read/ */
  static async markRead(ids: string[]): Promise<{ success: boolean }> {
    if (ids.length === 0) return { success: true };
    return apiFetch<{ success: boolean }>(
      "/notifications/mark-read/",
      { method: "POST", body: JSON.stringify({ notification_ids: ids }) }
    );
  }
}
