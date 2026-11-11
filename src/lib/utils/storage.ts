/** Safe, typed wrappers around localStorage (private mode / quota safe). */
export const storageKeys = {
  theme: 'toolsmith-theme',
  sidebarCollapsed: 'toolsmith-sidebar-collapsed',
  terminalSessionsOpen: 'toolsmith-terminal-sessions-open',
  terminalActiveId: 'toolsmith-terminal-active-id',
  editorLastRoot: 'toolsmith-editor-last-root',
  workspaceFavorites: 'toolsmith-workspace-favorites',
  workspaceRecents: 'toolsmith-workspace-recents',
  workspaceView: 'toolsmith-workspace-view',
  workspaceHidden: 'toolsmith-workspace-hidden',
} as const;

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — preference simply won't persist */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}
