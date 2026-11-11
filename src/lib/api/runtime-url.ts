const ACTIVE_INSTANCE_KEY = "toolsmith-console-active-instance";

function activeInstanceId(): string | null {
  try { return localStorage.getItem(ACTIVE_INSTANCE_KEY); } catch { return null; }
}

export function setStoredActiveInstance(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_INSTANCE_KEY, id);
    else localStorage.removeItem(ACTIVE_INSTANCE_KEY);
  } catch {}
}

export function runtimeUrl(url: string): string {
  if (!url.startsWith("/api/")) return url;
  const id = activeInstanceId();
  if (!id) return url;
  return "/control/v1/instances/" + encodeURIComponent(id) + "/runtime" + url;
}
