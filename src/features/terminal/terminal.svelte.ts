import { errorMessage, terminalsApi } from '$lib/api';
import type { TerminalScope } from '$lib/api';
import type { TerminalInfo } from '$lib/types';
import { readString, storageKeys, writeString } from '$lib/utils/storage';

export type SocketState = 'connecting' | 'connected' | 'closed';

/** The imperative surface of TerminalViewport that the controller needs. */
export interface TerminalViewHandle {
  write(data: string): void;
  restore(data: string): void;
  reset(): void;
  focus(): void;
  refit(): void;
}

interface ServerMessage {
  type: string;
  data?: string;
  output?: string;
  terminal?: TerminalInfo;
  exitCode?: number;
  message?: string;
}

interface TerminalControllerOptions {
  scope?: TerminalScope;
  getWorkspaceRoot?: () => string;
}

/** Owns one logical terminal group and its WebSocket bridge to the active PTY session. */
export class TerminalController {
  terminals = $state<TerminalInfo[]>([]);
  activeId = $state('');
  socketState = $state<SocketState>('closed');
  loading = $state(true);
  creating = $state(false);
  error = $state('');
  fullscreen = $state(false);
  active = $derived(this.terminals.find((item) => item.id === this.activeId));

  private socket: WebSocket | null = null;
  private view: TerminalViewHandle | null = null;
  private lastResize = '';
  private readonly scope: TerminalScope;
  private readonly getWorkspaceRoot: () => string;
  private currentWorkspaceRoot = '';
  private currentInstanceId = this.readInstanceId();
  private readonly onInstanceChange = () => { void this.handleInstanceChange(); };
  private loadGeneration = 0;
  private reconnectTimer: number | undefined;
  private heartbeatTimer: number | undefined;
  private reconnectAttempts = 0;
  private lastPongAt = 0;

  constructor(options: TerminalControllerOptions = {}) {
    this.scope = options.scope ?? 'general';
    this.getWorkspaceRoot = options.getWorkspaceRoot ?? (() => '');
    this.currentWorkspaceRoot = this.getWorkspaceRoot();
    if (typeof window !== 'undefined') window.addEventListener('toolsmith-console:instance-change', this.onInstanceChange);
  }

  private readInstanceId() {
    try { return localStorage.getItem('toolsmith-console-active-instance') ?? 'none'; } catch { return 'none'; }
  }

  private get storageKey() {
    const instanceKey = `${storageKeys.terminalActiveId}:instance:${this.currentInstanceId}`;
    return this.scope === 'general'
      ? instanceKey
      : `${instanceKey}:project:${this.currentWorkspaceRoot}`;
  }

  private async handleInstanceChange() {
    const nextInstanceId = this.readInstanceId();
    if (nextInstanceId === this.currentInstanceId) return;
    this.currentInstanceId = nextInstanceId;
    this.loadGeneration++;
    this.disconnect();
    this.view?.reset();
    this.terminals = [];
    this.activeId = '';
    this.error = '';
    this.loading = true;
    this.lastResize = '';
    await this.init();
  }

  attach(view: TerminalViewHandle) {
    this.view = view;
  }

  async init() {
    this.currentWorkspaceRoot = this.getWorkspaceRoot();
    if (this.scope === 'project' && !this.currentWorkspaceRoot) {
      this.terminals = [];
      this.activeId = '';
      this.loading = false;
      return;
    }
    const generation = ++this.loadGeneration;
    this.loading = true;
    try {
      this.terminals = await terminalsApi.list(this.scope, this.scope === 'project' ? this.currentWorkspaceRoot : undefined);
      if (generation !== this.loadGeneration) return;
      const savedActiveId = readString(this.storageKey);
      this.activeId = this.terminals.some((item) => item.id === savedActiveId)
        ? savedActiveId!
        : (this.terminals[0]?.id ?? '');
      writeString(this.storageKey, this.activeId);
    } catch (error) {
      if (generation === this.loadGeneration) this.error = errorMessage(error, 'Unable to load terminals');
    } finally {
      if (generation === this.loadGeneration) this.loading = false;
    }
    if (generation === this.loadGeneration && this.activeId) this.connect(this.activeId);
  }

  async setWorkspaceRoot(root: string) {
    if (this.scope !== 'project' || root === this.currentWorkspaceRoot) return;
    this.loadGeneration++;
    this.disconnect();
    this.view?.reset();
    this.currentWorkspaceRoot = root;
    this.terminals = [];
    this.activeId = '';
    this.loading = true;
    await this.init();
  }

  async create() {
    this.error = '';
    const workspaceRoot = this.scope === 'project' ? this.currentWorkspaceRoot : undefined;
    if (this.scope === 'project' && !workspaceRoot) {
      this.error = 'Open a project before creating a project terminal';
      return;
    }
    this.creating = true;
    try {
      const terminal = await terminalsApi.create({
        scope: this.scope,
        ...(workspaceRoot ? { cwd: workspaceRoot, workspaceRoot, title: `${workspaceRoot.split('/').filter(Boolean).at(-1) || 'Project'} Terminal ${this.terminals.length + 1}` } : {}),
      });
      this.terminals = [terminal, ...this.terminals];
      this.activeId = terminal.id;
      writeString(this.storageKey, terminal.id);
      this.connect(terminal.id);
    } catch (error) {
      this.error = errorMessage(error, 'Unable to create terminal');
    } finally {
      this.creating = false;
    }
  }

  async close(id: string) {
    try {
      await terminalsApi.close(id);
      this.terminals = this.terminals.filter((item) => item.id !== id);
      if (this.activeId !== id) return;
      this.activeId = this.terminals[0]?.id ?? '';
      writeString(this.storageKey, this.activeId);
      if (this.activeId) {
        this.view?.reset();
        this.connect(this.activeId);
      } else {
        this.disconnect();
        this.view?.reset();
      }
    } catch (error) {
      this.error = errorMessage(error, 'Unable to close terminal');
    }
  }

  open(id: string) {
    if (id === this.activeId && this.socketState !== 'closed') return;
    this.activeId = id;
    writeString(this.storageKey, id);
    this.view?.reset();
    this.connect(id);
  }

  sendInput = (data: string) => {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'input', data }));
  };

  sendResize = (cols: number, rows: number) => {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const size = `${cols}x${rows}`;
    if (size === this.lastResize) return;
    this.lastResize = size;
    this.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  };

  dispose() {
    this.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('toolsmith-console:instance-change', this.onInstanceChange);
    this.view = null;
  }

  private disconnect() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
    this.reconnectTimer = undefined;
    this.heartbeatTimer = undefined;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.socketState = 'closed';
  }

  private connect(id: string) {
    this.disconnect();
    this.lastResize = '';
    this.socketState = 'connecting';

    const socket = new WebSocket(terminalsApi.socketUrl(id));
    this.socket = socket;
    // Handlers of a superseded socket must not touch shared state.
    const current = () => this.socket === socket;
    const settle = () =>
      requestAnimationFrame(() => {
        this.view?.refit();
        this.view?.focus();
      });

    socket.onopen = () => {
      if (!current()) return;
      this.socketState = 'connected';
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();
      this.heartbeatTimer = window.setInterval(() => {
        if (!current() || socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastPongAt > 45_000) {
          socket.close(4000, 'Terminal heartbeat timeout');
          return;
        }
        socket.send(JSON.stringify({ type: 'ping', time: Date.now() }));
      }, 15_000);
      settle();
    };

    socket.onmessage = (event) => {
      if (!current()) return;
      let payload: ServerMessage;
      try {
        payload = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }

      switch (payload.type) {
        case 'pong':
          this.lastPongAt = Date.now();
          break;
        case 'snapshot':
          if (payload.terminal) {
            const info = payload.terminal;
            this.terminals = this.terminals.map((item) => (item.id === id ? info : item));
          }
          this.view?.restore(payload.output ?? '');
          settle();
          break;
        case 'output':
          if (payload.data) this.view?.write(payload.data);
          break;
        case 'exit':
          this.terminals = this.terminals.map((item) =>
            item.id === id ? { ...item, status: 'exited', exitCode: payload.exitCode } : item,
          );
          break;
        case 'error':
          this.error = payload.message ?? payload.data ?? 'Terminal connection error';
          break;
      }
    };

    socket.onclose = () => {
      if (!current()) return;
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
      this.socketState = 'closed';
      this.scheduleReconnect(id);
    };

    socket.onerror = () => {
      if (!current()) return;
      this.socketState = 'closed';
      this.error = 'Terminal connection interrupted; reconnecting…';
      socket.close();
    };
  }

  private scheduleReconnect(id: string) {
    if (id !== this.activeId || this.reconnectTimer !== undefined) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (id === this.activeId && this.socketState === 'closed') this.connect(id);
    }, delay);
  }
}

/** Shared controller so the app top bar can switch terminal sessions. */
export const terminalController = new TerminalController();
