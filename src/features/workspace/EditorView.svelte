<script lang="ts">
  import { Code2, FilePlus2, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Save, X, Circle, File, PanelLeft, Check, AlertCircle, Home, HardDrive, Maximize2, Minimize2, Search, Command, FolderX, Terminal as TerminalIcon, Plus, GitBranch } from '@lucide/svelte';
  import { Button, IconButton, Modal, EmptyState, ContextMenu, MenuItem } from '$lib/components/ui';
  import { basename, displayPath, joinPath, isHidden } from '$lib/utils/workspace';
  import EditorTreeItem from './EditorTreeItem.svelte';
  import PathPicker from '$lib/components/workspace/PathPicker.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import GlobalSearch from './GlobalSearch.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import DiffCodeLine from './DiffCodeLine.svelte';
  import { editor } from './editor.svelte';
  import { prefs } from './preferences.svelte';
  import { onMount } from 'svelte';
  import { TerminalController, TerminalSessions, TerminalViewport } from '$features/terminal';

  let pickerOpen = $state(false);
  let commandOpen = $state(false);
  let pickerMode = $state<'file' | 'directory'>('file');
  let closeTarget = $state<string | null>(null);
  let tabMenu = $state<{ x: number; y: number; path: string } | null>(null);
  let bulkCloseMode = $state<'others' | 'all' | null>(null);
  let bulkCloseKeepPath = $state<string | null>(null);
  let closeProjectOpen = $state(false);
  let projectMenuOpen = $state(false);
  let projectSwitchOpen = $state(false);
  let pendingProject = $state<{ path: string; name: string } | null>(null);
  let showTree = $state(true);
  let fullscreen = $state(false);
  let sidebarWidth = $state(224);
  let resizingSidebar = $state(false);
  let resizeStartX = 0;
  let resizeStartWidth = 224;
  let showHidden = $state(true);
  let filter = $state('');
  let sidebarTab = $state<'files' | 'changes'>('files');
  let gitChanges = $state<{ path: string; name: string; status: string; kind: string }[]>([]);
  let gitRepoPath = $state('');
  let gitLoading = $state(false);
  let gitError = $state('');
  let diffTabs = $state<{ path: string; before: string; after: string }[]>([]);
  let activeDiffPath = $state<string | null>(null);
  let restoredDiffRoot = '';
  let restoringDiffTabs = false;
  let diffRestoreRequestId = 0;
  const selectedDiff = $derived(activeDiffPath ? diffTabs.find((tab) => tab.path === activeDiffPath) ?? null : null);
  let diffLoading = $state(false);
  let globalSearchOpen = $state(false);
  let editorContentSection = $state<HTMLElement>();
  type DiffLine = { type: 'context' | 'added' | 'removed'; content: string; oldNumber: number | null; newNumber: number | null };
  function makeUnifiedDiff(before: string, after: string): DiffLine[] {
    const oldLines = before === '' ? [] : before.replace(/\n$/, '').split('\n');
    const newLines = after === '' ? [] : after.replace(/\n$/, '').split('\n');
    const n = oldLines.length;
    const m = newLines.length;
    const rows: DiffLine[] = [];
    let oldNumber = 1;
    let newNumber = 1;
    const push = (type: DiffLine['type'], content: string) => {
      rows.push({ type, content, oldNumber: type === 'added' ? null : oldNumber, newNumber: type === 'removed' ? null : newNumber });
      if (type !== 'added') oldNumber++;
      if (type !== 'removed') newNumber++;
    };
    if (n * m <= 1_000_000) {
      const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (oldLines[i] === newLines[j]) { push('context', oldLines[i]); i++; j++; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push('removed', oldLines[i++]); }
        else { push('added', newLines[j++]); }
      }
      while (i < n) push('removed', oldLines[i++]);
      while (j < m) push('added', newLines[j++]);
      return rows;
    }
    let prefix = 0;
    while (prefix < n && prefix < m && oldLines[prefix] === newLines[prefix]) prefix++;
    let suffix = 0;
    while (suffix < n - prefix && suffix < m - prefix && oldLines[n - 1 - suffix] === newLines[m - 1 - suffix]) suffix++;
    for (let i = 0; i < prefix; i++) push('context', oldLines[i]);
    for (let i = prefix; i < n - suffix; i++) push('removed', oldLines[i]);
    for (let i = prefix; i < m - suffix; i++) push('added', newLines[i]);
    for (let i = n - suffix; i < n; i++) push('context', oldLines[i]);
    return rows;
  }
  const unifiedDiffLines = $derived(selectedDiff ? makeUnifiedDiff(selectedDiff.before, selectedDiff.after) : []);
  async function refreshGitChanges() {
    if (!editor.root) { gitChanges = []; gitRepoPath = ''; return; }
    gitLoading = true;
    gitError = '';
    try {
      const result = await (await import('$lib/api')).workspaceApi.gitStatus(editor.root);
      gitChanges = result.files;
      gitRepoPath = result.repo;
    } catch (error) {
      gitChanges = [];
      gitRepoPath = '';
      gitError = error instanceof Error ? error.message : 'Unable to read Git status';
    } finally { gitLoading = false; }
  }

  async function openGitDiff(path: string) {
    diffLoading = true;
    gitError = '';
    try {
      const diff = await (await import('$lib/api')).workspaceApi.gitDiff(path);
      const existing = diffTabs.findIndex((tab) => tab.path === path);
      if (existing >= 0) diffTabs[existing] = diff;
      else diffTabs = [...diffTabs, diff];
      activeDiffPath = path;
      sidebarTab = 'changes';
      showTree = true;
    } catch (error) {
      gitError = error instanceof Error ? error.message : 'Unable to load diff';
    } finally { diffLoading = false; }
  }

  async function restoreDiffSession(root: string) {
    if (restoredDiffRoot === root) return;
    const restoreId = ++diffRestoreRequestId;
    restoredDiffRoot = root;
    let session: { paths: string[]; activePath: string | null } | null = null;
    let savedFileTabs: string[] = [];
    try {
      session = JSON.parse(localStorage.getItem(editor.storageKey('toolsmith-editor-git-diffs:', root)) ?? 'null');
      const fileSession = JSON.parse(localStorage.getItem(editor.storageKey('toolsmith-editor-session:', root)) ?? 'null');
      savedFileTabs = Array.isArray(fileSession?.tabs) ? fileSession.tabs : [];
    } catch {
      session = null;
      savedFileTabs = [];
    }
    restoringDiffTabs = true;
    diffTabs = [];
    activeDiffPath = null;
    if (session?.paths?.length) {
      for (const path of session.paths) {
        try {
          const diff = await (await import('$lib/api')).workspaceApi.gitDiff(path);
          if (restoreId !== diffRestoreRequestId || editor.root !== root) return;
          diffTabs = [...diffTabs, diff];
        } catch {
          // A file may no longer be changed or may have been removed since the last session.
        }
      }
      activeDiffPath = session.activePath && diffTabs.some((tab) => tab.path === session.activePath)
        ? session.activePath
        : null;
      // Restore the editor surface that was active before refresh. If no Explorer
      // file is open, fall back to the last available Git diff tab.
      if (!activeDiffPath && savedFileTabs.length === 0 && editor.tabs.length === 0 && diffTabs.length > 0) {
        activeDiffPath = diffTabs[diffTabs.length - 1].path;
      }
    }
    if (restoreId !== diffRestoreRequestId || editor.root !== root) return;
    if (activeDiffPath) {
      sidebarTab = 'changes';
      showTree = true;
    } else if (editor.activeTab) {
      sidebarTab = 'files';
      showTree = true;
    }
    restoringDiffTabs = false;
  }

  $effect(() => {
    const root = editor.root;
    if (root) void restoreDiffSession(root);
  });

  $effect(() => {
    const root = editor.root;
    const paths = diffTabs.map((tab) => tab.path);
    const activePath = activeDiffPath;
    if (!root || restoringDiffTabs || restoredDiffRoot !== root) return;
    try {
      localStorage.setItem('toolsmith-editor-git-diffs:' + root, JSON.stringify({ paths, activePath }));
    } catch {
      // Keep Git diff tabs usable if browser storage is unavailable.
    }
  });

  function activateFileTab(path: string) {
    activeDiffPath = null;
    sidebarTab = 'files';
    showTree = true;
    editor.activePath = path;
  }

  function closeDiffTab(path: string) {
    diffTabs = diffTabs.filter((tab) => tab.path !== path);
    if (activeDiffPath === path) {
      activeDiffPath = null;
      if (editor.activeTab) {
        sidebarTab = 'files';
        showTree = true;
      }
    }
  }

  function closeAllDiffTabs() {
    diffTabs = [];
    activeDiffPath = null;
  }

  $effect(() => { const root = editor.root; if (root) void refreshGitChanges(); });

  let terminalOpen = $state(false);
  let terminalHeight = $state(320);
  let resizingTerminal = $state(false);
  let terminalResizeStartY = 0;
  let terminalResizeStartHeight = 320;
  const terminalController = new TerminalController({ scope: 'project', getWorkspaceRoot: () => editor.root });
  let terminalViewport = $state<ReturnType<typeof TerminalViewport>>();
  let terminalInitPromise: Promise<void> | undefined;

  async function showTerminal(createNew = false) {
    terminalOpen = true;
    if (terminalInitPromise) await terminalInitPromise;
    if (createNew || terminalController.terminals.length === 0) {
      if (!terminalController.creating) await terminalController.create();
    }
    requestAnimationFrame(() => terminalViewport?.focus());
  }

  async function closeTerminal(id: string) {
    await terminalController.close(id);
    if (terminalController.terminals.length === 0) terminalOpen = false;
  }

  const visibleItems = $derived(editor.items
    .filter((item) => showHidden || !isHidden(item.name))
    .toSorted((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
  const activeLineCount = $derived((editor.activeTab?.content ?? '').split('\n').length);

  onMount(() => {
    try {
      fullscreen = localStorage.getItem('toolsmith-editor-fullscreen') === 'true';
    } catch {
      fullscreen = false;
    }
  });
  onMount(() => {
    terminalController.attach({ write: (data) => terminalViewport?.write(data), restore: (data) => terminalViewport?.restore(data), reset: () => terminalViewport?.reset(), focus: () => terminalViewport?.focus(), refit: () => terminalViewport?.refit() });
    terminalInitPromise = terminalController.init();
    void terminalInitPromise;
    return () => terminalController.dispose();
  });

  $effect(() => {
    void terminalController.setWorkspaceRoot(editor.root);
  });

  onMount(() => {
    // Restore the project and its open tabs after a page refresh.
    if (!editor.root && editor.tabs.length === 0) void editor.restoreLastSession();

    const onInstanceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string | null }>).detail;
      diffRestoreRequestId++;
      restoringDiffTabs = false;
      restoredDiffRoot = '';
      diffTabs = [];
      activeDiffPath = null;
      gitChanges = [];
      gitRepoPath = '';
      gitError = '';
      terminalOpen = false;
      filter = '';
      sidebarTab = 'files';
      showTree = true;
      void editor.switchInstance(detail?.id ?? null);
    };
    window.addEventListener('toolsmith-console:instance-change', onInstanceChange);
    return () => window.removeEventListener('toolsmith-console:instance-change', onInstanceChange);
  });

  onMount(() => {
    // Capture Escape before the embedded CodeMirror editor can consume it.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (commandOpen) {
        event.preventDefault();
        event.stopPropagation();
        commandOpen = false;
      } else if (pickerOpen) {
        event.preventDefault();
        event.stopPropagation();
        pickerOpen = false;
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  });
  function toggleSidebar(tab: 'files' | 'changes') {
    if (showTree && sidebarTab === tab) {
      showTree = false;
      return;
    }
    sidebarTab = tab;
    showTree = true;
    if (tab === 'changes') void refreshGitChanges();
  }
  function startSidebarResize(event: PointerEvent) {
    if (!showTree || event.button !== 0) return;
    event.preventDefault();
    resizingSidebar = true;
    resizeStartX = event.clientX;
    resizeStartWidth = sidebarWidth;
    window.addEventListener('pointermove', resizeSidebar);
    window.addEventListener('pointerup', stopSidebarResize, { once: true });
  }

  function resizeSidebar(event: PointerEvent) {
    if (!resizingSidebar) return;
    sidebarWidth = Math.min(520, Math.max(160, resizeStartWidth + event.clientX - resizeStartX));
  }

  function stopSidebarResize() {
    resizingSidebar = false;
    window.removeEventListener('pointermove', resizeSidebar);
  }

  function startTerminalResize(event: PointerEvent) {
    if (!terminalOpen || event.button !== 0) return;
    event.preventDefault();
    resizingTerminal = true;
    terminalResizeStartY = event.clientY;
    terminalResizeStartHeight = terminalHeight;
    window.addEventListener('pointermove', resizeTerminal);
    window.addEventListener('pointerup', stopTerminalResize, { once: true });
  }

  function resizeTerminal(event: PointerEvent) {
    if (!resizingTerminal) return;
    const availableHeight = (editorContentSection?.clientHeight ?? window.innerHeight) - 80;
    const maxHeight = Math.max(176, Math.min(Math.floor(window.innerHeight * 0.75), availableHeight));
    terminalHeight = Math.min(maxHeight, Math.max(176, terminalResizeStartHeight + terminalResizeStartY - event.clientY));
    requestAnimationFrame(() => terminalViewport?.refit());
  }

  function stopTerminalResize() {
    resizingTerminal = false;
    window.removeEventListener('pointermove', resizeTerminal);
    requestAnimationFrame(() => terminalViewport?.refit());
  }

  function toggleFullscreen() {
    fullscreen = !fullscreen;
    try {
      localStorage.setItem('toolsmith-editor-fullscreen', String(fullscreen));
    } catch {
      // Keep fullscreen usable when localStorage is unavailable.
    }
  }

  function openPicker(mode: 'file' | 'directory') {
    pickerMode = mode;
    pickerOpen = true;
  }

  async function pickPath(path: string) {
    pickerOpen = false;
    if (pickerMode === 'directory') {
      await requestSwitchProject(path, path === '.' ? 'Home' : basename(path));
    } else await editor.openFile(path);
  }

  async function requestSwitchProject(path: string, name = path === '.' ? 'Home' : basename(path)) {
    projectMenuOpen = false;
    if (path === editor.root) return;
    if (editor.dirty) {
      pendingProject = { path, name };
      projectSwitchOpen = true;
      return;
    }
    const opening = editor.openFolder(path, name);
    filter = '';
    showTree = true;
    sidebarTab = 'files';
    activeDiffPath = null;
    terminalOpen = false;
    await opening;
  }

  async function confirmSwitchProject(choice: 'save' | 'discard' | 'cancel') {
    const target = pendingProject;
    projectSwitchOpen = false;
    pendingProject = null;
    if (!target || choice === 'cancel') return;
    if (choice === 'save') {
      await editor.saveAll();
      if (editor.dirty) return;
    }
    const opening = editor.openFolder(target.path, target.name);
    filter = '';
    showTree = true;
    sidebarTab = 'files';
    activeDiffPath = null;
    terminalOpen = false;
    await opening;
  }

  function finishCloseProject() {
    diffRestoreRequestId++;
    restoringDiffTabs = false;
    editor.closeProject();
    filter = '';
    showTree = true;
    sidebarTab = 'files';
    diffTabs = [];
    activeDiffPath = null;
    restoredDiffRoot = '';
    gitChanges = [];
    gitRepoPath = '';
    gitError = '';
    terminalOpen = false;
  }

  function requestCloseProject() {
    if (editor.dirty) {
      closeProjectOpen = true;
      return;
    }
    finishCloseProject();
  }

  async function confirmCloseProject(choice: 'save' | 'discard' | 'cancel') {
    closeProjectOpen = false;
    if (choice === 'cancel') return;
    if (choice === 'save') {
      await editor.saveAll();
      if (editor.dirty) return;
    }
    finishCloseProject();
  }

  function closeRequest(path: string) {
    const tab = editor.tabs.find((item) => item.path === path);
    if (tab && tab.content !== tab.saved) {
      closeTarget = path;
      return;
    }
    editor.closeTab(path);
  }

  function openTabMenu(event: MouseEvent, path: string) {
    event.preventDefault();
    tabMenu = { x: event.clientX, y: event.clientY, path };
  }

  async function requestBulkClose(mode: 'others' | 'all', keepPath: string | null = null) {
    const targets = editor.tabs.filter((tab) => mode === 'all' || tab.path !== keepPath);
    if (targets.some((tab) => tab.content !== tab.saved)) {
      bulkCloseMode = mode;
      bulkCloseKeepPath = keepPath;
      tabMenu = null;
      return;
    }
    if (mode === 'all') editor.closeAll();
    else if (keepPath) editor.closeOthers(keepPath);
    tabMenu = null;
  }

  async function confirmBulkClose(choice: 'save' | 'discard' | 'cancel') {
    const mode = bulkCloseMode;
    const keepPath = bulkCloseKeepPath;
    bulkCloseMode = null;
    bulkCloseKeepPath = null;
    if (!mode || choice === 'cancel') return;
    if (choice === 'save') {
      await editor.saveAll();
      if (editor.tabs.some((tab) => tab.content !== tab.saved && (mode === 'all' || tab.path !== keepPath))) return;
    }
    if (mode === 'all') editor.closeAll();
    else if (keepPath) editor.closeOthers(keepPath);
  }

  async function copyTabPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      editor.error = 'Unable to copy path to clipboard';
    }
    tabMenu = null;
  }

  async function confirmClose(discard: boolean) {
    const path = closeTarget;
    closeTarget = null;
    if (!path) return;
    if (!discard) await editor.save(path);
    const tab = editor.tabs.find((item) => item.path === path);
    if (!tab || tab.content === tab.saved || discard) editor.closeTab(path);
  }


  function keydown(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.code === 'Backquote' && !event.shiftKey) {
      event.preventDefault();
      if (terminalOpen) terminalOpen = false;
      else void showTerminal();
    } else if (mod && event.shiftKey && event.code === 'Backquote') {
      event.preventDefault();
      void showTerminal(true);
    } else if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (event.shiftKey) void editor.saveAll();
      else void editor.save();
    } else if (mod && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      if (editor.activePath) closeRequest(editor.activePath);
    } else if (mod && event.key === 'Tab' && editor.tabs.length > 1) {
      event.preventDefault();
      const index = editor.tabs.findIndex((tab) => tab.path === editor.activePath);
      const step = event.shiftKey ? -1 : 1;
      editor.activePath = editor.tabs[(index + step + editor.tabs.length) % editor.tabs.length].path;
    } else if (event.key === 'Escape' && commandOpen) {
      commandOpen = false;
    } else if (mod && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      commandOpen = true;
    } else if (event.key === 'Escape' && pickerOpen) {
      pickerOpen = false;
    }
   }
</script>

<svelte:window onkeydown={keydown} />

<div class={["flex h-full min-h-0 flex-col overflow-hidden bg-surface-raised", fullscreen ? "fixed inset-0 z-50 rounded-none" : "rounded-lg border border-line shadow-card"]}>
  <div class="relative flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-2.5">
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <div class="relative min-w-0 shrink-0">
        <button type="button" aria-haspopup="menu" aria-expanded={projectMenuOpen} class="flex h-8 max-w-[min(42vw,240px)] items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-hover" onclick={() => (projectMenuOpen = !projectMenuOpen)}>
          <Code2 size={16} class="shrink-0 text-accent" />
          <span class="truncate">{editor.projectLabel || 'Open a project'}</span>
          <ChevronDown size={14} class={['shrink-0 text-fg-subtle transition-transform', projectMenuOpen && 'rotate-180']} />
        </button>
        {#if projectMenuOpen}
          <button type="button" class="fixed inset-0 z-30 cursor-default" aria-label="Close project menu" onclick={() => (projectMenuOpen = false)}></button>
          <div role="menu" class="absolute left-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-surface-raised p-1.5 shadow-pop">
            <p class="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Projects</p>
            {#if prefs.recents.length}
              <div class="max-h-64 overflow-y-auto">
                {#each prefs.recents as project (project.path)}
                  <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-hover" onclick={() => void requestSwitchProject(project.path, project.name)}>
                    <FolderOpen size={15} class="shrink-0 text-fg-subtle" />
                    <span class="min-w-0 flex-1"><span class="block truncate text-sm text-fg">{project.name}</span><span class="block truncate text-[10px] text-fg-faint" title={displayPath(project.path)}>{displayPath(project.path)}</span></span>
                    {#if editor.root === project.path}<Check size={14} class="shrink-0 text-accent" />{/if}
                  </button>
                {/each}
              </div>
            {:else}
              <p class="px-2.5 py-3 text-xs text-fg-subtle">No recent projects yet.</p>
            {/if}
            <div class="my-1 border-t border-line"></div>
            <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-fg hover:bg-surface-hover" onclick={() => { projectMenuOpen = false; openPicker('directory'); }}><Plus size={15} /> Add project…</button>
          </div>
        {/if}
      </div>
      <div class="mx-0.5 h-5 w-px shrink-0 bg-line"></div>
      {#if editor.root}
        <IconButton label="Open file" size="sm" onclick={() => openPicker('file')}><FilePlus2 size={15} /></IconButton>
        <IconButton label="Close project" size="sm" onclick={requestCloseProject}><FolderX size={15} /></IconButton>
        <IconButton label="Refresh project files" size="sm" disabled={editor.treeLoading} onclick={() => void editor.loadDir(editor.dir)}><RefreshCw size={14} /></IconButton>
        <IconButton label={editor.saving ? 'Saving…' : 'Save'} size="sm" disabled={!editor.activeDirty || editor.saving} onclick={() => void editor.save()}><Save size={15} /></IconButton>
      {:else}
        <Button size="sm" variant="secondary" onclick={() => openPicker('directory')}><FolderOpen size={14} /> Add project</Button>
      {/if}
      <div class="mx-1 h-5 w-px shrink-0 bg-line"></div>
      <IconButton label={terminalOpen ? 'Hide terminal' : 'Show terminal'} size="sm" onclick={() => { if (terminalOpen) terminalOpen = false; else void showTerminal(); }}><TerminalIcon size={15} /></IconButton>
    </div>
    <button type="button" aria-label="Search files" title="Search files" onclick={() => (commandOpen = true)} class="absolute left-1/2 top-1/2 hidden h-7 w-[min(28%,360px)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-xs text-fg-subtle transition-colors hover:border-fg-faint hover:bg-surface-hover xl:flex">
      <Search size={14} class="shrink-0 text-fg-faint" />
      <span class="flex-1 truncate">Search files…</span>
      <span class="flex items-center gap-0.5 text-[10px] text-fg-faint"><Command size={10} /> P</span>
    </button>
    <div class="flex shrink-0 items-center">
      <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} size="sm" onclick={toggleFullscreen}>{#if fullscreen}<Minimize2 size={15} />{:else}<Maximize2 size={15} />{/if}</IconButton>
    </div>
  </div>
  <div class={["flex min-h-0 flex-1", resizingSidebar ? "select-none cursor-col-resize" : ""]}>
    {#if editor.root}
      <nav aria-label="Editor activity bar" class="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2">
        <IconButton label="Files" size="md" active={showTree && sidebarTab === 'files'} onclick={() => toggleSidebar('files')}><FolderOpen size={18} /></IconButton>
        <IconButton label="Git Changes" size="md" active={showTree && sidebarTab === 'changes'} onclick={() => toggleSidebar('changes')}><GitBranch size={18} /></IconButton>
        <IconButton label="Search in files" size="md" active={globalSearchOpen} onclick={() => (globalSearchOpen = true)}><Search size={18} /></IconButton>
      </nav>
      {#if showTree}
        <aside class="flex shrink-0 flex-col border-r border-line bg-surface text-sm" style={"width: " + sidebarWidth + "px; min-width: 160px; max-width: min(520px, 70vw)"}>
          <div class="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
            <span class="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-fg-muted">{sidebarTab === 'files' ? 'Explorer' : 'Changes'}</span>
            {#if sidebarTab === 'changes'}
              <div class="flex items-center gap-0.5">
                <span class="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">{gitChanges.length}</span>
                <IconButton label="Refresh changes" size="sm" onclick={() => void refreshGitChanges()}><RefreshCw size={13} /></IconButton>
              </div>
            {:else}
              <IconButton label="Collapse sidebar" size="sm" onclick={() => (showTree = false)}><PanelLeft size={14} /></IconButton>
            {/if}
          </div>
          {#if sidebarTab === 'files'}
            <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
              {#if editor.treeLoading}
                <p class="px-2 py-3 text-xs text-fg-faint">Loading files…</p>
              {:else if visibleItems.length === 0}
                <p class="px-2 py-3 text-xs text-fg-faint">{filter ? 'No matching files' : 'This folder is empty'}</p>
              {:else}
                {#each visibleItems as item (item.name)}
                  <EditorTreeItem
                    {item}
                    path={joinPath(editor.dir, item.name)}
                    depth={0}
                    activePath={editor.activePath}
                    onOpen={(path, permanent) => { activeDiffPath = null; void editor.openFile(path, undefined, !permanent); }}
                  />
                {/each}
              {/if}
            </div>
          {:else}
            <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
              {#if gitLoading}
                <p class="px-2 py-3 text-xs text-fg-faint">Loading Git changes…</p>
              {:else if gitError}
                <p class="px-2 py-3 text-xs text-danger">{gitError}</p>
              {:else if gitChanges.length === 0}
                <p class="px-2 py-3 text-xs text-fg-faint">No uncommitted changes</p>
              {:else}
                {#if gitRepoPath}<p class="truncate px-2 pb-2 text-[10px] text-fg-faint" title={gitRepoPath}>Repository: {gitRepoPath}</p>{/if}
                {#each gitChanges as change (change.path)}
                  <button type="button" class={['flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-hover', selectedDiff?.path === change.path ? 'bg-surface-hover text-fg' : 'text-fg-muted']} title={change.path} onclick={() => void openGitDiff(change.path)}>
                    <File size={14} class="shrink-0 text-fg-faint" />
                    <span class="min-w-0 flex-1 truncate">{basename(change.path)}</span>
                    <span class={['shrink-0 font-mono font-semibold', change.kind === 'added' || change.kind === 'untracked' ? 'text-success' : change.kind === 'deleted' ? 'text-danger' : 'text-warning']}>{change.status.trim() || 'M'}</span>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </aside>
        <div role="separator" aria-orientation="vertical" aria-label="Resize explorer sidebar" title="Drag to resize sidebar (double-click to reset)" class="group relative z-10 -ml-px w-1 shrink-0 cursor-col-resize touch-none bg-transparent hover:bg-accent/50 active:bg-accent/70" onpointerdown={startSidebarResize} ondblclick={() => (sidebarWidth = 224)}><span class="absolute inset-y-0 -left-1 -right-1"></span></div>
      {/if}
    {/if}

    <section bind:this={editorContentSection} class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <section class={['absolute inset-x-0 bottom-0 z-20 flex-col overflow-hidden border-t border-line bg-surface-raised shadow-card', terminalOpen ? 'flex' : 'hidden']} style={terminalOpen ? `height: ${terminalHeight}px` : undefined}>
        <div role="separator" aria-orientation="horizontal" aria-label="Resize terminal panel" title="Drag to resize terminal" class="group relative z-10 h-1 shrink-0 cursor-row-resize touch-none bg-transparent hover:bg-accent/40 active:bg-accent/60" onpointerdown={startTerminalResize}><span class="absolute inset-x-0 -top-1 -bottom-1"></span></div>
        <header class="flex h-9 shrink-0 items-center justify-between border-b border-line px-2.5">
          <div class="flex items-center gap-2 text-xs font-medium text-fg-muted"><TerminalIcon size={14} /> Terminal <span class="text-fg-faint">({terminalController.terminals.length})</span></div>
          <div class="flex items-center gap-1">
            <IconButton label="New terminal" size="sm" disabled={terminalController.creating} onclick={() => void terminalController.create()}><Plus size={14} /></IconButton>
            <IconButton label="Hide terminal" size="sm" onclick={() => (terminalOpen = false)}><X size={14} /></IconButton>
          </div>
        </header>
        <div class="flex min-h-0 flex-1"><div class="relative min-w-0 flex-1"><TerminalViewport bind:this={terminalViewport} ondata={terminalController.sendInput} onresize={terminalController.sendResize} />{#if !terminalController.active && !terminalController.loading}<div class="absolute inset-0 flex items-center justify-center bg-surface text-sm text-fg-subtle">No active terminal</div>{/if}{#if terminalController.error}<button type="button" class="absolute inset-x-3 bottom-3 rounded-md border border-line bg-surface-raised px-3 py-2 text-left text-xs text-danger shadow-card" onclick={() => (terminalController.error = '')}>{terminalController.error}</button>{/if}</div><TerminalSessions terminals={terminalController.terminals} activeId={terminalController.activeId} loading={terminalController.loading} onopen={(id) => terminalController.open(id)} onclose={(id) => void closeTerminal(id)} /></div>
      </section>
      {#if editor.tabs.length > 0 || diffTabs.length > 0}
        <div class="flex h-10 min-w-0 items-stretch overflow-x-auto border-b border-line bg-surface">
          {#each editor.tabs as tab (tab.path)}
            <div class={['group flex min-w-0 max-w-52 shrink-0 items-center border-r border-line', !activeDiffPath && editor.activePath === tab.path ? 'border-b-2 border-b-accent bg-surface-raised' : 'border-b-2 border-b-transparent']} role="group" oncontextmenu={(event) => openTabMenu(event, tab.path)}>
              <button class={['flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-sm', !activeDiffPath && editor.activePath === tab.path ? 'text-fg' : 'text-fg-muted hover:text-fg']} title={tab.path} onclick={() => activateFileTab(tab.path)} onauxclick={(event) => { if (event.button === 1) { event.preventDefault(); closeRequest(tab.path); } }} ondblclick={() => editor.makePermanent(tab.path)}>
                <File size={14} class="shrink-0 text-fg-subtle" />
                <span class="truncate" class:italic={tab.preview}>{tab.name}</span>
                {#if tab.content !== tab.saved}<Circle size={7} fill="currentColor" class="shrink-0 text-accent" />{/if}
              </button>
              <button class="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-fg-faint opacity-0 hover:bg-surface-hover hover:text-fg group-hover:opacity-100 focus:opacity-100" aria-label={'Close ' + tab.name} title="Close tab" onclick={() => closeRequest(tab.path)}><X size={13} /></button>
            </div>
          {/each}
          {#each diffTabs as tab (tab.path)}
            <div class={['group flex min-w-0 max-w-52 shrink-0 items-center border-r border-line', activeDiffPath === tab.path ? 'border-b-2 border-b-accent bg-surface-raised' : 'border-b-2 border-b-transparent']} role="group">
              <button class={['flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-sm', activeDiffPath === tab.path ? 'text-fg' : 'text-fg-muted hover:text-fg']} title={tab.path} onclick={() => { activeDiffPath = tab.path; sidebarTab = 'changes'; showTree = true; }}>
                <GitBranch size={14} class="shrink-0 text-fg-subtle" />
                <span class="truncate">{basename(tab.path)}</span>
              </button>
              <button class="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-fg-faint opacity-0 hover:bg-surface-hover hover:text-fg group-hover:opacity-100 focus:opacity-100" aria-label={'Close diff ' + tab.path} title="Close tab" onclick={() => closeDiffTab(tab.path)}><X size={13} /></button>
            </div>
          {/each}
        </div>
      {/if}
      {#if selectedDiff}
        <div class="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2 text-xs text-fg-faint">
          <HardDrive size={13} class="shrink-0" />
          {#each selectedDiff.path.split('/').filter(Boolean) as crumb, index (index)}
            <ChevronRight size={12} class="shrink-0" />
            <span class={index === selectedDiff.path.split('/').filter(Boolean).length - 1 ? 'truncate text-fg-muted' : 'shrink-0'}>{crumb}</span>
          {/each}
        </div>
        {#if diffLoading}
          <div class="p-4 text-sm text-fg-subtle">Loading diff…</div>
        {:else}
          <div class="min-h-0 flex-1 overflow-auto bg-surface-raised font-mono text-xs leading-5">
            {#if unifiedDiffLines.length === 0}
              <div class="p-4 text-fg-faint">No textual changes</div>
            {:else}
              {#each unifiedDiffLines as line, index (`${selectedDiff.path}:${index}:${line.type}:${line.oldNumber}:${line.newNumber}`)}
                <div class={['flex min-w-max border-l-2', line.type === 'added' ? 'border-success bg-success/10 text-fg' : line.type === 'removed' ? 'border-danger bg-danger/10 text-fg' : 'border-transparent text-fg-muted']}>
                  <span class="sticky left-0 w-12 shrink-0 select-none border-r border-line/70 bg-surface px-2 text-right text-fg-faint">{line.newNumber ?? line.oldNumber ?? ''}</span>
                  <span class={['w-7 shrink-0 select-none text-center font-semibold', line.type === 'added' ? 'text-success' : line.type === 'removed' ? 'text-danger' : 'text-fg-faint']}>{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span>
                  <DiffCodeLine content={line.content} filename={selectedDiff.path} />
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      {:else if editor.tabs.length > 0}
        <div class="flex min-h-0 flex-1 flex-col">
          {#if editor.error}
            <div class="flex items-center gap-2 border-b border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert"><AlertCircle size={15} />{editor.error}</div>
          {/if}
          {#if editor.loading}
            <div class="p-4 text-sm text-fg-subtle">Opening file…</div>
          {:else if editor.activeTab}
            <div class="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2 text-xs text-fg-faint">
              <HardDrive size={13} class="shrink-0" />
              {#each editor.activeTab.path.split('/').filter(Boolean) as crumb, index (index)}
                <ChevronRight size={12} class="shrink-0" />
                <span class={index === editor.activeTab.path.split('/').filter(Boolean).length - 1 ? 'truncate text-fg-muted' : 'shrink-0'}>{crumb}</span>
              {/each}
            </div>
            <div class="flex min-h-0 flex-1 overflow-hidden bg-surface-raised">
              {#key editor.activeTab.path}
                <CodeEditor content={editor.activeTab.content} filename={editor.activeTab.name} onChange={(value) => editor.editActive(value)} />
              {/key}
            </div>
          {/if}
          <footer class="flex h-8 items-center justify-between gap-3 border-t border-line bg-surface px-3 text-xs text-fg-faint">
            <span class="truncate">{editor.activeTab ? displayPath(editor.activeTab.path) : 'No file selected'}</span>
            <span class="shrink-0">{editor.activeDirty ? 'Unsaved changes' : 'UTF-8'} · {activeLineCount} lines</span>
          </footer>
        </div>
      {:else}
        <div class="flex min-h-0 flex-1 items-center justify-center p-6">
          <EmptyState icon={Code2} title={editor.root ? 'No files open' : 'No project open'} description={editor.root ? 'Choose a file from the project explorer to start editing.' : 'Open a project folder to show its files and start editing.'}>
            <div class="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onclick={() => openPicker('directory')}><FolderOpen size={15} /> Open Project</Button>
              {#if editor.root}
                <Button variant="secondary" onclick={() => openPicker('file')}><FilePlus2 size={15} /> Open File</Button>
              {/if}
            </div>
            {#if prefs.recents.length}
              <div class="mt-6 w-full max-w-lg text-left">
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">Recent folders</p>
                <div class="space-y-1">
                  {#each prefs.recents.slice(0, 5) as recent (recent.path)}
                    <button type="button" class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-hover" onclick={() => void editor.openFolder(recent.path, recent.name)}>
                      <FolderOpen size={15} class="shrink-0 text-fg-subtle" />
                      <span class="min-w-0 flex-1"><span class="block truncate text-sm text-fg">{recent.name}</span><span class="block truncate font-mono text-xs text-fg-faint">{displayPath(recent.path)}</span></span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </EmptyState>
        </div>
      {/if}

    </section>
  </div>
</div>

<CommandPalette open={commandOpen} root={editor.root || '.'} onclose={() => (commandOpen = false)} onselectfile={(path) => { commandOpen = false; void editor.openFile(path); }} onaction={(action) => { commandOpen = false; if (action === 'open-file') openPicker('file'); else if (action === 'open-folder') openPicker('directory'); else if (action === 'save') void editor.save(); else if (action === 'save-all') void editor.saveAll(); else if (action === 'toggle-explorer') showTree = !showTree; else if (action === 'fullscreen') toggleFullscreen(); else if (action === 'refresh') void editor.loadDir(editor.dir); else if (action === 'toggle-terminal') { if (terminalOpen) terminalOpen = false; else void showTerminal(); } else if (action === 'new-terminal') { void showTerminal(true); } }} />
<GlobalSearch open={globalSearchOpen} root={editor.root || '.'} onclose={() => (globalSearchOpen = false)} onselect={(path) => { globalSearchOpen = false; void editor.openFile(path); }} />
<PathPicker open={pickerOpen} mode={pickerMode} initialPath={editor.root || '.'} onselect={pickPath} oncancel={() => (pickerOpen = false)} />

<Modal open={projectSwitchOpen} title="Switch project?" width="max-w-md" onclose={() => void confirmSwitchProject('cancel')}>
  <p class="px-4 py-4 text-sm text-fg-muted">This project has unsaved changes. Save them before switching to <strong class="text-fg">{pendingProject?.name ?? 'the selected project'}</strong>?</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => void confirmSwitchProject('cancel')}>Cancel</Button>
    <Button variant="secondary" onclick={() => void confirmSwitchProject('discard')}>Don't Save</Button>
    <Button variant="primary" onclick={() => void confirmSwitchProject('save')}>Save & Switch</Button>
  {/snippet}
</Modal>

<Modal open={closeProjectOpen} title="Close project?" width="max-w-md" onclose={() => (closeProjectOpen = false)}>
  <p class="px-4 py-4 text-sm text-fg-muted">This project has unsaved changes. Save them before closing the project?</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => void confirmCloseProject('cancel')}>Cancel</Button>
    <Button variant="secondary" onclick={() => void confirmCloseProject('discard')}>Don't Save</Button>
    <Button variant="primary" onclick={() => void confirmCloseProject('save')}>Save & Close</Button>
  {/snippet}
</Modal>

<Modal open={closeTarget !== null} title="Unsaved changes" width="max-w-md" onclose={() => (closeTarget = null)}>
  <p class="px-4 py-4 text-sm text-fg-muted">Save changes to {editor.tabs.find((tab) => tab.path === closeTarget)?.name ?? 'this file'} before closing?</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (closeTarget = null)}>Cancel</Button>
    <Button variant="secondary" onclick={() => void confirmClose(true)}>Don't Save</Button>
    <Button variant="primary" onclick={() => void confirmClose(false)}>Save</Button>
  {/snippet}
</Modal>

{#if tabMenu}
  <ContextMenu x={tabMenu.x} y={tabMenu.y} onclose={() => (tabMenu = null)}>
    {#snippet children({ close })}
      <MenuItem onclick={() => { const path = tabMenu?.path; close(); tabMenu = null; if (path) closeRequest(path); }}>Close</MenuItem>
      <MenuItem onclick={() => { const path = tabMenu?.path; if (path) void requestBulkClose('others', path); }}>Close Others</MenuItem>
      <MenuItem onclick={() => { editor.closeSaved(); close(); tabMenu = null; }}>Close Saved</MenuItem>
      <MenuItem onclick={() => { close(); void requestBulkClose('all'); }}>Close All</MenuItem>
      <div class="my-1 border-t border-line"></div>
      <MenuItem onclick={() => { const path = tabMenu?.path; close(); if (path) void copyTabPath(path); }}>Copy Path</MenuItem>
    {/snippet}
  </ContextMenu>
{/if}

<Modal open={bulkCloseMode !== null} title={bulkCloseMode === 'all' ? 'Close all tabs?' : 'Close other tabs?'} width="max-w-md" onclose={() => void confirmBulkClose('cancel')}>
  <p class="px-4 py-4 text-sm text-fg-muted">Some tabs have unsaved changes. Save them before closing?</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => void confirmBulkClose('cancel')}>Cancel</Button>
    <Button variant="secondary" onclick={() => void confirmBulkClose('discard')}>Don't Save</Button>
    <Button variant="primary" onclick={() => void confirmBulkClose('save')}>Save & Close</Button>
  {/snippet}
</Modal>
