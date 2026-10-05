/**
 * Real-time Server Sync Client
 * 
 * Provides an instantaneous, durable full-stack sync bridge between PC and mobile devices.
 * - Always available even when Firestore free tier daily quota is exceeded
 * - Server-Sent Events (SSE) push updates in < 300ms across open devices
 * - Atomic persistence on server
 */

import { LocalSyncSnapshot } from "./firestoreSync";
import { getDeviceId } from "./firestoreSync";
import { TombstoneStore } from "./userStorage";

export interface ServerSyncResult {
  success: boolean;
  finalPayload?: any;
  mergedData?: LocalSyncSnapshot;
  mergedTombstones?: TombstoneStore;
  revision?: number;
  error?: string;
}

export async function fetchServerSyncStore(userId: string): Promise<{
  success: boolean;
  exists: boolean;
  data: any | null;
  revision: number;
}> {
  try {
    const res = await fetch(`/api/sync/store/${encodeURIComponent(userId)}`);
    if (!res.ok) {
      return { success: false, exists: false, data: null, revision: 0 };
    }
    return await res.json();
  } catch (err) {
    console.warn("Server sync store fetch failed:", err);
    return { success: false, exists: false, data: null, revision: 0 };
  }
}

export async function postServerSyncStore(
  userId: string,
  localData: LocalSyncSnapshot,
  localTombstones: TombstoneStore,
  localRevision: number
): Promise<ServerSyncResult> {
  try {
    const deviceId = getDeviceId();
    const res = await fetch(`/api/sync/store/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        localData,
        localTombstones,
        deviceId,
        localRevision
      })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson.error || `HTTP ${res.status}` };
    }
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

export function subscribeServerSyncEvents(
  userId: string,
  onRemoteUpdate: (data: any, remoteDeviceId: string, revision: number) => void
): () => void {
  if (typeof window === "undefined" || !window.EventSource) {
    return () => {};
  }

  const deviceId = getDeviceId();
  const url = `/api/sync/events/${encodeURIComponent(userId)}?deviceId=${encodeURIComponent(deviceId)}`;
  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimer: any = null;

  const connect = () => {
    if (isClosed) return;
    try {
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === "sync_update") {
            // Ignore updates that originated from this same device instance
            if (parsed.deviceId && parsed.deviceId === deviceId) {
              return;
            }
            onRemoteUpdate(parsed.data, parsed.deviceId, parsed.revision || 0);
          }
        } catch (e) {
          // Ignore keepalive / malformed frames
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          reconnectTimer = setTimeout(connect, 4000);
        }
      };
    } catch {
      if (!isClosed) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    }
  };

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
