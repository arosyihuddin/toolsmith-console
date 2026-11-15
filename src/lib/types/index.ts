export type RiskLevel = 'low' | 'medium' | 'high' | 'isolated';

export type ToolPermission = 'always_allow' | 'require_approval' | 'blocked' | 'custom';
export type ToolPermissionSection = 'read_only' | 'edit_delete' | 'other';
export type ToolCategory = 'system_diagnostics' | 'desktop_automation' | 'files_search' | 'code_development' | 'terminal_execution' | 'web_research' | 'network_tunnels' | 'agent_workflow';
export type ToolCustomRuleAction = 'allow' | 'require_approval' | 'block';
export type ToolCustomRuleOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'exists' | 'not_exists' | 'in' | 'not_in';
export interface ToolInputField { path: string; type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'enum' | 'unknown'; required: boolean; description?: string; enum?: string[]; }
export interface ToolCustomRuleCondition {
  field: string;
  operator: ToolCustomRuleOperator;
  value?: string;
}
export interface ToolCustomRule {
  version: 1;
  match: 'all' | 'any';
  conditions: ToolCustomRuleCondition[];
  action: ToolCustomRuleAction;
  fallbackAction: ToolCustomRuleAction;
}

export interface Tool {
  name: string;
  group: string;
  category: ToolCategory;
  risk: RiskLevel;
  description: string;
  exposed: boolean;
  section: ToolPermissionSection;
  permission: ToolPermission;
  permissionOverride: ToolPermission | null;
  sectionPermission: ToolPermission;
  customRule: ToolCustomRule;
  sectionCustomRule: ToolCustomRule;
  inputFields: ToolInputField[];
}

export type UpstreamTransport = 'stdio' | 'streamable-http';
export type UpstreamAuthType = 'none' | 'bearer' | 'api-key';
export type UpstreamServerStatus = 'connected' | 'down' | 'disabled' | 'error';

/** Server upstream seperti yang dikembalikan API (secret tidak pernah disertakan). */
export interface UpstreamServer {
  id: string;
  name: string;
  transport: UpstreamTransport;
  command?: string;
  args: string[];
  cwd?: string;
  url?: string;
  authType: UpstreamAuthType;
  hasAuthSecret: boolean;
  hasEnvSecrets: boolean;
  readRoots: string[];
  writeRoots: string[];
  timeoutMs: number;
  enabled: boolean;
  status: UpstreamServerStatus;
  lastError?: string | null;
  toolCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Tool upstream (cache `tools/list` + exposure/permission efektif). */
export interface UpstreamTool {
  name: string;
  exposedName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  exposed: boolean;
  section: ToolPermissionSection;
  permission: ToolPermission;
  permissionOverride: ToolPermission | null;
  sectionPermission: ToolPermission;
  customRule: ToolCustomRule;
  sectionCustomRule: ToolCustomRule;
}

/** Payload tambah/ubah server. `id` opsional saat tambah — backend
 * membuatnya otomatis dari nama. `authSecret` hanya dikirim bila diisi
 * (edit: kosong = dipertahankan). */
export interface UpstreamServerInput {
  id?: string;
  name: string;
  transport: UpstreamTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  authType?: UpstreamAuthType;
  authSecret?: string | null;
  headers?: Record<string, string>;
  readRoots?: string[];
  writeRoots?: string[];
  timeoutMs?: number;
  enabled?: boolean;
}

/** Satu tool seperti yang dilaporkan upstream saat test connection (tanpa exposure/permission). */
export interface UpstreamTestTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: UpstreamTool['annotations'];
}

export interface UpstreamTestResult {
  serverInfo: { name: string; version?: string };
  tools: UpstreamTestTool[];
}

type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
export type ApprovalDecision = 'approve' | 'deny';

export interface Approval {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  risk: 'medium' | 'high';
  status: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  requestId: string | number;
  reason?: string;
}

export interface ToolCallLog {
  id: string;
  timestamp: string;
  requestId: string | null;
  sessionId: string | null;
  toolName: string;
  status: string;
  approval: string | null;
  durationMs: number | null;
  arguments: string | null;
  result: string | null;
  error: string | null;
}

export interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  scope?: 'general' | 'project';
  workspaceRoot?: string;
  status: 'running' | 'exited';
  createdAt: string;
  updatedAt: string;
  exitCode?: number;
}

export interface WorkspaceItem {
  name: string;
  type: 'directory' | 'file';
  size: number | null;
  modified: string;
  ignored?: boolean;
}

interface GpuDevice {
  name?: string;
  utilization_gpu_percent?: number;
  temperature_c?: number;
  memory_used_mib?: number;
  memory_total_mib?: number;
  power_draw_w?: number;
}

export interface SystemTelemetry {
  os?: { hostname?: string; pretty_name?: string; platform?: string; architecture?: string; kernel?: string };
  desktop?: { environment?: string; display_server?: string };
  cpu?: { logical_cores?: number; usage_percent?: number | null; load_average?: Record<'1m' | '5m' | '15m', number> };
  memory?: { used_bytes?: number; total_bytes?: number; usage_percent?: number };
  disk?: { path?: string; used_bytes?: number; total_bytes?: number; usage_percent?: number };
  gpu?: { devices?: GpuDevice[] };
  uptime_seconds?: number;
  runtime?: Record<string, string | null>;
  network?: {
    interfaces?: { name: string; up: boolean; address_count: number; families?: string[] }[];
  };
}

export interface ServiceTelemetry {
  transport?: string;
  httpPort?: number | string;
}

export interface HostTelemetry {
  system?: SystemTelemetry;
  service?: ServiceTelemetry;
}

export interface DashboardSnapshot {
  host?: HostTelemetry;
  toolCount?: number;
  toolRiskCounts?: Partial<Record<RiskLevel, number>>;
  approvalCount?: number;
  toolCallsToday?: number;
}

export interface Profile {
  id: string;
  displayName: string;
  avatarColor: string | null;
}
export interface PinEntry {
  path: string;
  name: string;
  sortOrder: number;
}
export interface FavoriteEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
}
export interface RecentEntry {
  path: string;
  name: string;
  openedAt: string;
}
export interface WorkspaceStat {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number | null;
  created: string;
  modified: string;
  mode: string;
  children?: number;
}
export interface WorkspaceState {
  pins: PinEntry[];
  favorites: FavoriteEntry[];
  recents: RecentEntry[];
  prefs: Record<string, string>;
}
export interface EditorSession {
  root: string;
  tabs: string[];
  activePath: string | null;
}
