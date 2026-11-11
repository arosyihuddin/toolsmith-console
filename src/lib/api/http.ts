import { runtimeUrl } from "./runtime-url";

class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Typed JSON request helper. Throws ApiError using the server-provided message. */
export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(runtimeUrl(url), { cache: 'no-store', ...init });
  const data = (await response.json().catch(() => ({}))) as { error?: string | { code?: string; message?: string } } & Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.error === "string"
      ? data.error
      : data.error?.message ?? `Request failed (${response.status})`;
    if (response.status === 401 && url.startsWith("/control/v1/") && !url.includes("/runtime/")) {
      window.dispatchEvent(new CustomEvent("toolsmith-console:auth-required"));
    }
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
