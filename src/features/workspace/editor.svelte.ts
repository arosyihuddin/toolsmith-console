import { errorMessage, workspaceApi, workspaceStateApi } from '$lib/api';
import type { WorkspaceItem } from '$lib/types';
import { basename, dirname } from '$lib/utils/workspace';
import { prefs } from './preferences.svelte';
import { readJson, readString, storageKeys, writeJson, writeString } from '$lib/utils/storage';

interface EditorTab {
  path: string;
  name: string;
  content: string;
  saved: string;
  preview: boolean;
  loading?: boolean;
}

class EditorStore {
  root = $state('');
  dir = $state('.');
  items = $state<WorkspaceItem[]>([]);
  treeLoading = $state(false);
  tabs = $state<EditorTab[]>([]);
  activePath = $state('');
  loading = $state(false);
  saving = $state(false);
  error = $state('');
  private sessionRoot = '';
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  instanceId = $state(readString('omp-control-active-instance') ?? 'none');

  storageKey(prefix: string, root: string) {
    return prefix + encodeURIComponent(this.instanceId || 'none') + ':' + root;
  }

  async switchInstance(id: string | null) {
    const nextId = id ?? 'none';
    if (nextId === this.instanceId) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.instanceId = nextId;
    this.closeProject();
    await this.restoreLastSession();
  }

  activeTab = $derived(this.tabs.find((tab) => tab.path === this.activePath) ?? null);
  path = $derived(this.activeTab?.path ?? '');
  name = $derived(this.activeTab?.name ?? '');
  content = $derived(this.activeTab?.content ?? '');
  saved = $derived(this.activeTab?.saved ?? '');
  dirty = $derived(this.tabs.some((tab) => tab.content !== tab.saved));
  activeDirty = $derived(Boolean(this.activeTab && this.activeTab.content !== this.activeTab.saved));
  projectLabel = $derived(this.root ? (this.root === '.' ? 'Home' : basename(this.root)) : '');

  async loadDir(dir: string) {
    this.treeLoading = true;
    try {
      const data = await workspaceApi.list(dir);
      this.dir = data.path;
      this.items = data.items ?? [];
    } catch (cause) {
      this.error = errorMessage(cause, 'Unable to read folder');
    } finally {
      this.treeLoading = false;
    }
  }

  async restoreLastSession() {
    const root = readString(this.storageKey(storageKeys.editorLastRoot, 'value'));
    if (root) await this.openFolder(root);
  }

  async openFolder(path: string, name?: string) {
    const changingProject = this.root !== path;
    if (changingProject) {
      // Keep the previous project's persisted session intact, but never carry its
      // in-memory tabs into the newly selected project.
      // Let a pending debounced save finish with its captured previous-root data.
      // Detach the timer handle so new-project edits cannot cancel that save.
      this.saveTimer = undefined;
      this.tabs = [];
      this.activePath = '';
      this.sessionRoot = '';
      this.items = [];
    }
    this.root = path;
    writeString(this.storageKey(storageKeys.editorLastRoot, 'value'), path);
    this.dir = path;
    this.error = '';
    prefs.remember(path, name);
    await this.loadDir(path);
    await this.restoreSession(path);
  }

  async restoreSession(root: string) {
    if (this.sessionRoot === root) return;
    this.sessionRoot = root;
    const instanceId = this.instanceId;
    const localSession = readJson<{ tabs: string[]; activePath: string | null } | null>(this.storageKey('omp-editor-session:', root), null);
    try {
      const session = await workspaceStateApi.getEditorSession(root);
      if (instanceId !== this.instanceId || root !== this.root) return;
      const tabs = session?.tabs?.length ? session.tabs : (localSession?.tabs ?? []);
      const activePath = session?.activePath ?? localSession?.activePath ?? null;
      const previewPath = readString(this.storageKey('omp-editor-preview:', root));
      for (const path of tabs) await this.openFile(path, undefined, path === previewPath, false);
      if (activePath && this.tabs.some((tab) => tab.path === activePath)) this.activePath = activePath;
      else if (!this.activePath && this.tabs.length) this.activePath = this.tabs[0].path;
      this.scheduleSessionSave();
    } catch {
      if (instanceId !== this.instanceId || root !== this.root) return;
      // Restore from the local snapshot if server-side session persistence is unavailable.
      const previewPath = readString(this.storageKey('omp-editor-preview:', root));
      for (const path of localSession?.tabs ?? []) await this.openFile(path, undefined, path === previewPath, false);
      if (localSession?.activePath && this.tabs.some((tab) => tab.path === localSession.activePath)) this.activePath = localSession.activePath;
      else if (!this.activePath && this.tabs.length) this.activePath = this.tabs[0].path;
      this.scheduleSessionSave();
    }
  }

  async openFile(path: string, name?: string, preview = false, focus = true) {
    const existing = this.tabs.find((tab) => tab.path === path);
    if (existing) {
      existing.preview = existing.preview && preview;
      if (focus) {
        this.activePath = path;
        this.scheduleSessionSave();
      }
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const content = await workspaceApi.readFile(path);
      const parent = dirname(path);
      if (!this.root) {
        this.root = parent;
        this.sessionRoot = parent;
        await this.loadDir(parent);
      }
      const tab: EditorTab = { path, name: name ?? basename(path), content, saved: content, preview };
      if (preview) {
        const previewIndex = this.tabs.findIndex((item) => item.preview && item.content === item.saved);
        if (previewIndex >= 0) this.tabs.splice(previewIndex, 1, tab);
        else this.tabs.push(tab);
      } else {
        this.tabs.push(tab);
      }
      if (focus) this.activePath = path;
      prefs.remember(parent, parent === '.' ? 'Home' : undefined);
      this.scheduleSessionSave();
    } catch (cause) {
      this.error = errorMessage(cause, 'Unable to open file');
    } finally {
      this.loading = false;
    }
  }

  editActive(content: string) {
    const tab = this.activeTab;
    if (!tab) return;
    tab.content = content;
    tab.preview = false;
    this.scheduleSessionSave();
  }

  makePermanent(path: string) {
    const tab = this.tabs.find((item) => item.path === path);
    if (tab) tab.preview = false;
    this.scheduleSessionSave();
  }

  async save(path = this.activePath) {
    const tab = this.tabs.find((item) => item.path === path);
    if (!tab || tab.content === tab.saved || this.saving) return;
    this.saving = true;
    this.error = '';
    try {
      await workspaceApi.writeFile(tab.path, tab.content);
      tab.saved = tab.content;
    } catch (cause) {
      this.error = errorMessage(cause, 'Unable to save file');
    } finally {
      this.saving = false;
    }
  }

  async saveAll() {
    for (const tab of this.tabs) if (tab.content !== tab.saved) await this.save(tab.path);
  }

  closeTab(path: string) {
    const index = this.tabs.findIndex((tab) => tab.path === path);
    if (index < 0) return;
    const wasActive = this.activePath === path;
    this.tabs.splice(index, 1);
    if (wasActive) this.activePath = this.tabs[Math.min(index, this.tabs.length - 1)]?.path ?? '';
    this.scheduleSessionSave();
  }

  closeOthers(path: string) {
    this.tabs = this.tabs.filter((tab) => tab.path === path);
    this.activePath = path;
    this.scheduleSessionSave();
  }

  closeSaved() {
    this.tabs = this.tabs.filter((tab) => tab.content !== tab.saved);
    if (!this.tabs.some((tab) => tab.path === this.activePath)) this.activePath = this.tabs.at(-1)?.path ?? '';
    this.scheduleSessionSave();
  }

  closeAll() {
    this.tabs = [];
    this.activePath = '';
    this.scheduleSessionSave();
  }

  closeProject() {
    const previousRoot = this.root;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (previousRoot) {
      // Closing a project should remove it from the active editor, not erase its
      // saved tabs or preview state. It remains available from the project menu.
      try {
        localStorage.removeItem(this.storageKey(storageKeys.editorLastRoot, 'value'));
      } catch {
        // Closing the project should still clear the editor if storage is unavailable.
      }
    }
    this.root = '';
    this.dir = '.';
    this.items = [];
    this.treeLoading = false;
    this.tabs = [];
    this.activePath = '';
    this.loading = false;
    this.saving = false;
    this.error = '';
    this.sessionRoot = '';
  }

  private scheduleSessionSave() {
    const root = this.root;
    if (!root) return;
    const tabs = this.tabs.map((tab) => tab.path);
    const activePath = this.activePath || null;
    const previewPath = this.tabs.find((tab) => tab.preview)?.path ?? '';
    const snapshot = { tabs, activePath };
    writeJson(this.storageKey('omp-editor-session:', root), snapshot);
    writeString(this.storageKey('omp-editor-preview:', root), previewPath);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void workspaceStateApi.saveEditorSession(root, tabs, activePath).catch(() => {});
    }, 500);
  }
}

export const editor = new EditorStore();
