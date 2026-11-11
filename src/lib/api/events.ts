import { runtimeUrl } from "./runtime-url";

/**
 * One shared EventSource for the whole app.
 *
 * Browsers cap concurrent connections per origin, and every page used to open
 * its own stream. Consumers now subscribe by event type; the connection is
 * created on the first subscription and closed with the last.
 */
type Handler = (event: MessageEvent) => void;
type ConnectionHandler = (connected: boolean) => void;

const handlers = new Map<string, Set<Handler>>();
const attached = new Set<string>();
const connectionHandlers = new Set<ConnectionHandler>();
let source: EventSource | null = null;
let subscribers = 0;
let connected = false;
let reconnectAttempt = 0;
let reconnectTimer: number | undefined;

function notifyConnection(next: boolean) {
  if (connected === next) return;
  connected = next;
  connectionHandlers.forEach((handler) => handler(connected));
}

function scheduleReconnect() {
  if (reconnectTimer !== undefined || subscribers === 0) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
  reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    if (subscribers > 0 && source?.readyState === EventSource.CLOSED) {
      source = null;
      attached.clear();
      attachSource();
    }
  }, delay);
}

function attachSource() {
  if (source || subscribers === 0 || typeof window === 'undefined') return;
  const current = new EventSource(runtimeUrl('/api/events'));
  source = current;
  current.onopen = () => {
    if (source !== current) return;
    reconnectAttempt = 0;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    notifyConnection(true);
  };
  current.onerror = () => {
    if (source !== current) return;
    notifyConnection(false);
    // Native EventSource retries while CONNECTING; retry explicitly if it becomes CLOSED.
    if (current.readyState === EventSource.CLOSED) scheduleReconnect();
  };
  for (const type of handlers.keys()) {
    current.addEventListener(type, dispatcher(type));
    attached.add(type);
  }
}

function dispatcher(type: string): Handler {
  return (event) => handlers.get(type)?.forEach((handler) => handler(event));
}

export function onServerEvent(type: string, handler: Handler): () => void {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(handler);
  subscribers += 1;
  attachSource();

  if (!attached.has(type)) {
    source?.addEventListener(type, dispatcher(type));
    attached.add(type);
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    handlers.get(type)?.delete(handler);
    subscribers -= 1;
    if (subscribers === 0) {
      source?.close();
      source = null;
      attached.clear();
      handlers.clear();
      notifyConnection(false);
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };
}

/** Subscribe to several event types with one handler. Returns a single cleanup. */
export function onServerEvents(types: string[], handler: Handler): () => void {
  const cleanups = types.map((type) => onServerEvent(type, handler));
  return () => cleanups.forEach((cleanup) => cleanup());
}

/** Called when the shared stream opens or recovers after a network interruption. */
export function onServerConnection(handler: ConnectionHandler): () => void {
  connectionHandlers.add(handler);
  handler(connected);
  return () => connectionHandlers.delete(handler);
}

if (typeof window !== 'undefined') {
  const reconnectIfClosed = () => {
    if (subscribers > 0 && source?.readyState === EventSource.CLOSED) {
      source = null;
      attached.clear();
      attachSource();
    }
  };
  window.addEventListener('online', reconnectIfClosed);
  window.addEventListener('pageshow', reconnectIfClosed);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && subscribers > 0 && source?.readyState === EventSource.CLOSED) {
      source = null;
      attached.clear();
      attachSource();
    }
  });
  window.addEventListener('toolsmith-console:instance-change', () => {
    source?.close();
    source = null;
    attached.clear();
    notifyConnection(false);
    attachSource();
  });
}
