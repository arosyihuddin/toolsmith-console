<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import InstancePicker from '$lib/components/layout/InstancePicker.svelte';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Topbar from '$lib/components/layout/Topbar.svelte';
  import { dashboard } from '$lib/stores/dashboard.svelte';
  import { instanceRegistry } from '$lib/stores/instances.svelte';
  import { profile } from '$lib/stores/profile.svelte';
  import { authUser } from '$lib/stores/auth.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Overview from './pages/Overview.svelte';
  import Logs from './pages/Logs.svelte';
  import Tunnels from './pages/Tunnels.svelte';
  import Processes from './pages/Processes.svelte';
  import { browser } from './features/workspace/browser.svelte';
  import FavoritesView from './features/workspace/FavoritesView.svelte';
  import FilesView from './features/workspace/FilesView.svelte';
  import { prefs } from './features/workspace/preferences.svelte';
  import EditorView from './features/workspace/EditorView.svelte';
  import TerminalPage from './pages/Terminal.svelte';
  import Tools from './pages/Tools.svelte';
  import Approvals from './pages/Approvals.svelte';
  import GlobalApprovalNotifications from './features/approvals/GlobalApprovalNotifications.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import WorkspaceOverlays from './features/workspace/WorkspaceOverlays.svelte';


  import AuthPage from './pages/AuthPage.svelte';
  let appReady = $state(false);
  let authenticated = $state(false);
  let showInstancePicker = $state(false);
  let stopDashboardEvents: (() => void) | undefined;
  let loadingInstanceData = false;

  onMount(() => {
    ui.init();
    const stopRouter = router.init();
    theme.init();
    const onLogout = async () => {
      try {
        await fetch('/control/v1/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error('Logout request failed:', error);
      }
      authenticated = false;
      authUser.clear();
      showInstancePicker = false;
      stopDashboardEvents?.();
      stopDashboardEvents = undefined;
    };
    const onAuthRequired = () => {
      authenticated = false;
      authUser.clear();
      showInstancePicker = false;
      stopDashboardEvents?.();
      stopDashboardEvents = undefined;
    };
    const onShowInstancePicker = () => { showInstancePicker = true; };
    const onInstanceChange = () => {
      if (loadingInstanceData) return;
      if (router.current === 'overview') void dashboard.refresh();
      if (router.inWorkspace) void prefs.reload();
      void profile.load();
    };
    window.addEventListener('omp-control:instance-change', onInstanceChange);
    window.addEventListener('omp-control:show-instance-picker', onShowInstancePicker);
    window.addEventListener('omp-control:auth-required', onAuthRequired);
    window.addEventListener('omp-control:logout', onLogout);
    void fetch('/control/v1/auth/status')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to check login status')))
      .then(async (status: { authenticated: boolean; username?: string | null }) => {
        authenticated = status.authenticated;
        authUser.setUsername(status.username);
        if (authenticated) {
          loadingInstanceData = true;
          await instanceRegistry.load();
          loadingInstanceData = false;
          if (!instanceRegistry.active) showInstancePicker = true;
          await profile.load();
        }
      })
      .catch((error) => console.error('Authentication status check failed:', error))
      .finally(() => { appReady = true; });
    return () => {
      stopRouter();
      stopDashboardEvents?.();
      window.removeEventListener('omp-control:instance-change', onInstanceChange);
      window.removeEventListener('omp-control:show-instance-picker', onShowInstancePicker);
      window.removeEventListener('omp-control:logout', onLogout);
      window.removeEventListener('omp-control:auth-required', onAuthRequired);
    };
  });

  // Overview consumes live dashboard events; other pages avoid a background SSE stream.
  $effect(() => {
    const activeInstance = instanceRegistry.active;
    if (!authenticated || !activeInstance || router.current !== 'overview') return;
    const stop = dashboard.connect();
    stopDashboardEvents = stop;
    void dashboard.refresh();
    return () => {
      stop();
      if (stopDashboardEvents === stop) stopDashboardEvents = undefined;
    };
  });

  // Keep the selected runtime's health current whenever the user enters or changes pages.
  // The registry is the single source of truth for instance status across the UI.
  $effect(() => {
    const activeId = instanceRegistry.activeId;
    const currentRoute = router.current;
    if (!authenticated || !activeId || !currentRoute) return;
    void instanceRegistry.checkHealth(activeId).catch(() => {});
  });

  // Workspace preferences are loaded only when entering a workspace route.
  $effect(() => {
    if (authenticated && instanceRegistry.active && router.inWorkspace) void prefs.init();
  });

  // The Files view owns its listing (browser store); reload whenever it is shown.
  $effect(() => {
    if (router.current === 'workspace-files') void browser.refresh();
  });

  async function handleAuthenticated() {
    const response = await fetch('/control/v1/auth/status');
    if (response.ok) {
      const status = await response.json() as { username?: string | null };
      authUser.setUsername(status.username);
    }
    authenticated = true;
    loadingInstanceData = true;
    await instanceRegistry.load();
    loadingInstanceData = false;
    if (!instanceRegistry.active) showInstancePicker = true;
    await profile.load();
  }
</script>

{#if !appReady}
  <div class="flex h-full min-h-screen items-center justify-center bg-canvas p-6"><div class="w-full max-w-3xl space-y-4" aria-label="Loading application" aria-busy="true"><div class="h-8 w-48 animate-pulse rounded bg-surface-active/70"></div><div class="grid grid-cols-1 gap-3 sm:grid-cols-3"><div class="h-24 animate-pulse rounded-xl bg-surface-active/70"></div><div class="h-24 animate-pulse rounded-xl bg-surface-active/70"></div><div class="h-24 animate-pulse rounded-xl bg-surface-active/70"></div></div><div class="h-56 animate-pulse rounded-xl bg-surface-active/70"></div></div></div>
{:else if !authenticated}
  <AuthPage onAuthenticated={handleAuthenticated} />
{:else if showInstancePicker || !instanceRegistry.active}
  <InstancePicker onback={() => { showInstancePicker = false; }} onenter={() => { showInstancePicker = false; if (router.current === 'overview') void dashboard.refresh(); if (router.inWorkspace) void prefs.reload(); void profile.load(); }} />
{:else}
{#snippet sidebar()}
  <Sidebar />
{/snippet}

{#snippet header()}
  <Topbar />
{/snippet}

<AppShell
    fill={router.current === 'terminal' || router.current === 'workspace-files' || router.current === 'workspace-editor'}
    compactFill={router.current === 'terminal'}
    {sidebar}
    {header}
  >
    {#if router.current === 'overview'}
      <Overview />
    {:else if router.current === 'tools'}
      <Tools />
    {:else if router.current === 'approvals'}
      <Approvals />
  {:else if router.current === 'terminal'}
    <TerminalPage />
  {:else if router.current === 'logs'}
    <Logs />
  {:else if router.current === 'tunnels'}
    <Tunnels />
  {:else if router.current === 'processes'}
    <Processes />
  {:else if router.current === 'workspace-files'}
    <FilesView />
  {:else if router.current === 'workspace-favorites'}
    <FavoritesView />
  {:else if router.inWorkspace}
    <EditorView />
    {/if}
  </AppShell>
{/if}
{#if authenticated && instanceRegistry.active}
  <GlobalApprovalNotifications />
{/if}
<ToastViewport />
<WorkspaceOverlays />
