import type { CalendarSSEEvent } from "./types";

// Global event emitter for SSE - allows API routes to push real-time updates to the frontend
type Listener = (event: CalendarSSEEvent) => void;

class SSEBroadcaster {
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcast(event: CalendarSSEEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

// Singleton
export const sseBroadcaster = new SSEBroadcaster();
