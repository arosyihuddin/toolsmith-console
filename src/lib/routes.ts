import {
  Activity,
  Code2,
  Folder,
  LayoutDashboard,
  Network,
  ScrollText,
  ShieldCheck,
  Star,
  Terminal as TerminalIcon,
  Wrench,
  type LucideIcon,
} from '@lucide/svelte';

export type RouteId =
  | 'overview' | 'tools' | 'approvals'
  | 'terminal' | 'logs' | 'tunnels' | 'processes'
  | 'workspace-favorites' | 'workspace-files' | 'workspace-editor';

export interface RouteDef {
  id: RouteId;
  path: string;
  title: string;
  icon: LucideIcon;
}

/** Single source of truth for URLs, titles and navigation icons. */
export const routes: Record<RouteId, RouteDef> = {
  overview: { id: 'overview', path: '/overview', title: 'Overview', icon: LayoutDashboard },
  tools: { id: 'tools', path: '/tools', title: 'Tools', icon: Wrench },
  approvals: { id: 'approvals', path: '/approvals', title: 'Approvals', icon: ShieldCheck },
  terminal: { id: 'terminal', path: '/terminal', title: 'Terminal', icon: TerminalIcon },
  logs: { id: 'logs', path: '/logs', title: 'Logs', icon: ScrollText },
  tunnels: { id: 'tunnels', path: '/tunnels', title: 'Tunnels', icon: Network },
  processes: { id: 'processes', path: '/processes', title: 'Processes', icon: Activity },
  'workspace-favorites': { id: 'workspace-favorites', path: '/workspace/favorites', title: 'Favorites', icon: Star },
  'workspace-files': { id: 'workspace-files', path: '/workspace/files', title: 'Files', icon: Folder },
  'workspace-editor': { id: 'workspace-editor', path: '/workspace/editor', title: 'Editor', icon: Code2 },
};

export const mainNav: RouteId[] = ['overview', 'tools', 'approvals', 'terminal', 'processes', 'logs', 'tunnels'];
export const workspaceNav: RouteId[] = ['workspace-favorites', 'workspace-files', 'workspace-editor'];

const byPath = new Map<string, RouteId>(Object.values(routes).map((route) => [route.path, route.id]));
byPath.set('/workspace', 'workspace-files');

export function resolveRoute(pathname: string): RouteId {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return byPath.get(normalized) ?? 'overview';
}

export const isWorkspaceRoute = (id: RouteId) => id.startsWith('workspace-');
