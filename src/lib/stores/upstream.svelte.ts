import { errorMessage, upstreamApi } from '$lib/api';
import type {
  ToolCustomRule,
  ToolPermission,
  UpstreamServer,
  UpstreamServerInput,
  UpstreamTool,
} from '$lib/types';

class UpstreamStore {
  items = $state<UpstreamServer[]>([]);
  loading = $state(true);
  error = $state('');
  updating = $state<ReadonlySet<string>>(new Set());
  /** Tool upstream per server id, diisi oleh loadDetail(). */
  toolsByServer = $state<Record<string, UpstreamTool[]>>({});
  toolsLoading = $state<ReadonlySet<string>>(new Set());
  private loadGeneration = 0;

  async load() {
    const generation = ++this.loadGeneration;
    this.error = '';
    this.loading = true;
    try {
      const items = await upstreamApi.list();
      if (generation === this.loadGeneration) this.items = items;
    } catch (error) {
      if (generation === this.loadGeneration) this.error = errorMessage(error, 'Gagal memuat server upstream');
    } finally {
      if (generation === this.loadGeneration) this.loading = false;
    }
  }

  async loadDetail(serverId: string): Promise<UpstreamTool[]> {
    this.toolsLoading = new Set(this.toolsLoading).add(serverId);
    this.error = '';
    try {
      const { server, tools } = await upstreamApi.get(serverId);
      this.items = this.items.map((item) => (item.id === serverId ? server : item));
      this.toolsByServer = { ...this.toolsByServer, [serverId]: tools };
      return tools;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal memuat detail server');
      return [];
    } finally {
      const next = new Set(this.toolsLoading);
      next.delete(serverId);
      this.toolsLoading = next;
    }
  }

  private track(key: string) {
    this.updating = new Set(this.updating).add(key);
  }

  private untrack(key: string) {
    const next = new Set(this.updating);
    next.delete(key);
    this.updating = next;
  }

  async create(input: UpstreamServerInput): Promise<UpstreamServer | null> {
    // Tambah belum punya id (dibuat backend dari nama); pakai nama sebagai
    // kunci pelacak supaya dua tambah bersamaan tidak saling memblokir.
    const key = input.id ?? input.name;
    if (this.updating.has(key)) return null;
    this.track(key);
    this.error = '';
    try {
      const server = await upstreamApi.create(input);
      this.items = [...this.items, server];
      return server;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal menambah server upstream');
      return null;
    } finally {
      this.untrack(key);
    }
  }

  async update(server: UpstreamServer, patch: Partial<UpstreamServerInput>): Promise<UpstreamServer | null> {
    if (this.updating.has(server.id)) return null;
    this.track(server.id);
    this.error = '';
    try {
      const updated = await upstreamApi.update(server.id, patch);
      this.items = this.items.map((item) => (item.id === server.id ? updated : item));
      return updated;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal mengubah server upstream');
      return null;
    } finally {
      this.untrack(server.id);
    }
  }

  async toggleEnabled(server: UpstreamServer) {
    await this.update(server, { enabled: !server.enabled });
  }

  async remove(server: UpstreamServer): Promise<boolean> {
    if (this.updating.has(server.id)) return false;
    this.track(server.id);
    this.error = '';
    try {
      await upstreamApi.remove(server.id);
      this.items = this.items.filter((item) => item.id !== server.id);
      const { [server.id]: _removed, ...rest } = this.toolsByServer;
      this.toolsByServer = rest;
      return true;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal menghapus server upstream');
      return false;
    } finally {
      this.untrack(server.id);
    }
  }

  async reconnect(server: UpstreamServer): Promise<boolean> {
    if (this.updating.has(server.id)) return false;
    this.track(server.id);
    this.error = '';
    try {
      const updated = await upstreamApi.reconnect(server.id);
      this.items = this.items.map((item) => (item.id === server.id ? updated : item));
      return true;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal reconnect server upstream');
      return false;
    } finally {
      this.untrack(server.id);
    }
  }

  async setToolExposed(serverId: string, tool: UpstreamTool, exposed: boolean): Promise<boolean> {
    const key = tool.exposedName;
    if (this.updating.has(key)) return false;
    this.track(key);
    this.error = '';
    try {
      const updated = await upstreamApi.setToolExposed(serverId, tool.name, exposed);
      this.applyToolUpdate(serverId, updated);
      return true;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal mengubah exposure tool');
      return false;
    } finally {
      this.untrack(key);
    }
  }

  async setToolPermission(
    serverId: string,
    tool: UpstreamTool,
    permission: ToolPermission | null,
    customRule?: ToolCustomRule,
  ): Promise<boolean> {
    const key = tool.exposedName;
    if (this.updating.has(key)) return false;
    this.track(key);
    this.error = '';
    try {
      const updated = await upstreamApi.setToolPermission(serverId, tool.name, permission, customRule);
      this.applyToolUpdate(serverId, updated);
      return true;
    } catch (error) {
      this.error = errorMessage(error, 'Gagal mengubah izin tool');
      return false;
    } finally {
      this.untrack(key);
    }
  }

  private applyToolUpdate(serverId: string, updated: UpstreamTool) {
    const tools = this.toolsByServer[serverId];
    if (!tools) return;
    this.toolsByServer = {
      ...this.toolsByServer,
      [serverId]: tools.map((tool) => (tool.name === updated.name ? updated : tool)),
    };
  }
}

export const upstream = new UpstreamStore();

