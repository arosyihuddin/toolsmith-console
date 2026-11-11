import { instancesApi, type HealthResult, type Instance } from "$lib/api/instances";
import { setStoredActiveInstance } from "$lib/api/runtime-url";

class InstanceRegistry {
  items = $state<Instance[]>([]);
  loading = $state(false);
  activeId = $state<string | null>(null);
  checkingIds = $state<string[]>([]);
  private healthChecks = new Map<string, Promise<HealthResult>>();
  error = $state("");

  get active(): Instance | undefined {
    return this.items.find((item) => item.id === this.activeId);
  }

  async load() {
    this.loading = true;
    this.error = "";
    try {
      this.items = (await instancesApi.list()).instances;
      const saved = this.activeId ?? this.readStoredId();
      const next = saved && this.items.some((item) => item.id === saved)
        ? saved
        : this.items[0]?.id ?? null;
      this.setActive(next);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to load instances";
    } finally {
      this.loading = false;
    }
  }
  async checkHealth(id: string): Promise<HealthResult> {
    const pending = this.healthChecks.get(id);
    if (pending) return pending;

    this.checkingIds = [...this.checkingIds, id];
    const request = instancesApi.health(id)
      .then((result) => {
        this.items = this.items.map((item) => item.id === id
          ? {
              ...item,
              status: result.status,
              ...(result.status === "online" ? { lastSeenAt: result.checkedAt } : {}),
              updatedAt: result.checkedAt,
            }
          : item);
        return result;
      })
      .catch((error) => {
        this.items = this.items.map((item) => item.id === id ? { ...item, status: "unknown" } : item);
        throw error;
      })
      .finally(() => {
        this.healthChecks.delete(id);
        this.checkingIds = this.checkingIds.filter((checkingId) => checkingId !== id);
      });
    this.healthChecks.set(id, request);
    return request;
  }

  async checkAllHealth(): Promise<void> {
    await Promise.allSettled(this.items.map((item) => this.checkHealth(item.id)));
  }

  setActive(id: string | null) {
    const next = id && this.items.some((item) => item.id === id) ? id : null;
    const changed = next !== this.activeId;
    this.activeId = next;
    setStoredActiveInstance(this.activeId);
    if (changed && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("toolsmith-console:instance-change", { detail: { id: this.activeId } }));
  }

  private readStoredId(): string | null {
    try { return localStorage.getItem("toolsmith-console-active-instance"); } catch { return null; }
  }
}

export const instanceRegistry = new InstanceRegistry();
