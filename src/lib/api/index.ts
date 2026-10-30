import type {
  Approval,
  EditorSession,
  FavoriteEntry,
  PinEntry,
  Profile,
  RecentEntry,
  WorkspaceState,
  WorkspaceStat,
  ApprovalDecision,
  DashboardSnapshot,
  TerminalInfo,
  Tool,
  ToolCustomRule,
  ToolCallLog,
  WorkspaceItem,
} from '$lib/types';
import { postJson, request } from './http';
import { runtimeUrl } from './runtime-url';

export { errorMessage } from './http';

const enc = encodeURIComponent;


type TunnelStatus = 'starting' | 'active' | 'stopping' | 'stopped' | 'error';
export interface TunnelInfo {
  id: string;
  targetUrl: string;
  status: TunnelStatus;
  publicUrl: string | null;
  createdAt: string;
  logs: string[];
  error: string | null;
}
export interface CloudflaredStatus { installed: boolean; path: string | null; version: string | null; available?: boolean; reason?: string; }
interface RuntimeTunnel {
  id: string;
  target: string;
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  publicUrl?: string;
  createdAt: string;
  logs: string[];
  error?: string;
}
export function normalizeTunnelInfo(tunnel: RuntimeTunnel): TunnelInfo {
  return {
    id: tunnel.id,
    targetUrl: tunnel.target,
    status: tunnel.state === 'running' ? 'active' : tunnel.state,
    publicUrl: tunnel.publicUrl ?? null,
    createdAt: tunnel.createdAt,
    logs: tunnel.logs ?? [],
    error: tunnel.error ?? null,
  };
}
export const tunnelsApi = {
  list: async () => (await request<{ tunnels: RuntimeTunnel[] }>('/api/tunnels')).tunnels.map(normalizeTunnelInfo),
  status: () => request<CloudflaredStatus>('/api/tunnels/status'),
  eventsUrl: () => runtimeUrl('/api/tunnels/events'),
  start: async (targetUrl: string) => normalizeTunnelInfo((await postJson<{ tunnel: RuntimeTunnel }>('/api/tunnels', { target: targetUrl })).tunnel),
  stop: async (id: string) => normalizeTunnelInfo((await postJson<{ tunnel: RuntimeTunnel }>('/api/tunnels/' + enc(id) + '/stop')).tunnel),
};


export type ManagedProcessStatus = 'running' | 'stopping' | 'stopped' | 'exited' | 'failed';
export interface ManagedProcess {
  id: string; pid: number; source: 'bash' | 'eval' | 'sudo' | 'terminal' | 'tunnel';
  kind: 'command' | 'terminal' | 'service'; label: string; cwd?: string;
  status: ManagedProcessStatus; startedAt: string; endedAt?: string; exitCode?: number;
  memoryRssBytes?: number; cpuPercent?: number; cpuTimeSeconds?: number; processName?: string; stoppable: boolean;
}
export const processesApi = {
  list: async () => (await request<{ processes: ManagedProcess[]; scope: string }>('/api/processes')).processes ?? [],
  stop: (id: string) => request<{ stopped: boolean }>('/api/processes/' + enc(id), { method: 'DELETE' }),
};

export const dashboardApi = {
  snapshot: () => request<DashboardSnapshot>('/api/dashboard'),
};

export const toolsApi = {
  list: async () => (await request<{ tools: Tool[] }>('/api/tools')).tools ?? [],
  setExposed: async (name: string, exposed: boolean) =>
    (await request<{ tool: Tool }>(`/api/tools/${enc(name)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exposed }),
    })).tool,
  setPermission: async (name: string, permission: Tool['permission'] | null, customRule?: ToolCustomRule) =>
    (await request<{ tool: Tool }>(`/api/tools/${enc(name)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ permission, ...(customRule ? { customRule } : {}) }),
    })).tool,
  setSectionPermission: async (section: Tool['section'], permission: Tool['permission'], customRule?: ToolCustomRule) =>
    request<{ tools: Tool[]; sectionPermissions: Record<Tool['section'], Tool['permission']>; sectionCustomRules: Record<Tool['section'], ToolCustomRule> }>(`/api/tools/sections/${section}/permission`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ permission, ...(customRule ? { customRule } : {}) }),
    }),
};

export interface RootCommandRule { command: string; args: string[]; enabled: boolean; }
export interface RootCommandConfig { rules: RootCommandRule[]; passwordConfigured: boolean; encryptionConfigured: boolean; }
export const rootCommandsApi = {
  get: () => request<RootCommandConfig>("/api/root-commands"),
  save: (body: { rules: RootCommandRule[]; password?: string; clearPassword?: boolean }) =>
    request<RootCommandConfig>("/api/root-commands", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  savePassword: (body: { password?: string; clearPassword?: boolean }) =>
    request<RootCommandConfig>("/api/root-commands/password", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
};

export const approvalsApi = {
  list: async () => (await request<{ approvals: Approval[] }>('/api/approvals')).approvals ?? [],
  decide: (id: string, decision: ApprovalDecision) => postJson(`/api/approvals/${enc(id)}/${decision}`),
  clear: () => postJson('/api/approvals/clear'),
};

export const logsApi = {
  list: async (limit = 200) => (await request<{ logs: ToolCallLog[] }>(`/api/logs?limit=${limit}`)).logs ?? [],
};

export type TerminalScope = 'general' | 'project';

export const terminalsApi = {
  list: async (scope: TerminalScope, workspaceRoot?: string) => {
    const params = new URLSearchParams({ scope });
    if (workspaceRoot) params.set('workspaceRoot', workspaceRoot);
    return (await request<{ terminals: TerminalInfo[] }>(`/api/terminals?${params.toString()}`)).terminals ?? [];
  },
  create: async (input: { scope: TerminalScope; cwd?: string; title?: string; workspaceRoot?: string }) =>
    (await postJson<{ terminal: TerminalInfo }>('/api/terminals', input)).terminal,
  close: (id: string) => request(`/api/terminals/${enc(id)}`, { method: 'DELETE' }),
  socketUrl: (id: string) => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + runtimeUrl('/api/terminal/socket?id=' + enc(id)),
};

export interface GitChangeFile { path: string; name: string; status: string; kind: 'modified' | 'added' | 'deleted' | 'untracked'; }
export interface GitFileDiff { path: string; before: string; after: string; }

export const workspaceApi = {
  list: (path: string) => request<{ path: string; items: WorkspaceItem[] }>(`/api/workspace?path=${enc(path)}`),
  gitStatus: (path: string) => request<{ repo: string; files: GitChangeFile[] }>(`/api/workspace/git-status?path=${enc(path)}`),
  gitDiff: (path: string) => request<GitFileDiff>(`/api/workspace/git-diff?path=${enc(path)}`),
  remove: (path: string) => request(`/api/workspace?path=${enc(path)}`, { method: 'DELETE' }),
  readFile: async (path: string) =>
    (await request<{ content?: string }>(`/api/workspace/file?path=${enc(path)}`)).content ?? '',
  writeFile: (path: string, content: string) =>
    request(`/api/workspace/file?path=${enc(path)}`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: content,
    }),
  previewUrl: (path: string) => runtimeUrl('/api/workspace/preview?path=' + enc(path)),
  create: (path: string, type: 'file' | 'directory') => postJson<{ path: string }>('/api/workspace/create', { path, type }),
  rename: (path: string, newName: string) => postJson<{ path: string; name: string }>('/api/workspace/rename', { path, newName }),
  duplicate: (path: string) => postJson<{ path: string; name: string }>('/api/workspace/duplicate', { path }),
  move: (path: string, destDir: string) => postJson<{ path: string }>('/api/workspace/move', { path, destDir }),
  stat: (path: string) => request<WorkspaceStat>(`/api/workspace/stat?path=${enc(path)}`),
  downloadUrl: (path: string) => runtimeUrl('/api/workspace/download?path=' + enc(path)),
};

export const profileApi = {
  get: () => request<Profile>('/api/profile'),
  update: (input: Partial<Pick<Profile, 'displayName' | 'avatarColor'>>) =>
    request<Profile>('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
};

export const accountApi = {
  verifyRecoveryToken: (token: string) =>
    postJson<{ verified: boolean; challenge: string; expiresIn: number }>('/control/v1/auth/recovery/verify', { token }),
  changePasswordWithRecovery: (input: { challenge: string; currentPassword: string; newPassword: string }) =>
    postJson<{ changed: boolean; message: string }>('/control/v1/account/password/recovery', input),
  changePassword: (input: { currentPassword: string; newPassword: string }) => postJson<{ changed: boolean; message: string }>('/control/v1/account/password', input),
};

const put = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const workspaceStateApi = {
  state: () => request<WorkspaceState>('/api/workspace/state'),
  addPin: (path: string, name: string) => postJson<{ pins: PinEntry[] }>('/api/workspace/pins', { path, name }),
  removePin: (path: string) => request<{ pins: PinEntry[] }>(`/api/workspace/pins?path=${enc(path)}`, { method: 'DELETE' }),
  reorderPins: (paths: string[]) => put<{ pins: PinEntry[] }>('/api/workspace/pins/order', { paths }),
  addFavorite: (path: string, name: string, type: 'file' | 'directory') =>
    postJson<{ favorites: FavoriteEntry[] }>('/api/workspace/favorites', { path, name, type }),
  removeFavorite: (path: string) =>
    request<{ favorites: FavoriteEntry[] }>(`/api/workspace/favorites?path=${enc(path)}`, { method: 'DELETE' }),
  touchRecent: (path: string, name: string) => postJson<{ recents: RecentEntry[] }>('/api/workspace/recents', { path, name }),
  clearRecents: () => request<{ recents: RecentEntry[] }>('/api/workspace/recents', { method: 'DELETE' }),
  setPref: (key: string, value: string) => put<{ prefs: Record<string, string> }>('/api/workspace/prefs', { key, value }),
  getEditorSession: async (root: string) =>
    (await request<{ session: EditorSession | null }>(`/api/workspace/editor-session?root=${enc(root)}`)).session,
  saveEditorSession: (root: string, tabs: string[], activePath: string | null) =>
    put<{ session: EditorSession | null }>('/api/workspace/editor-session', { root, tabs, activePath }),
};
