<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, RefreshCw, Square, Terminal, Clock3, MemoryStick, Cpu, CircleCheck, CircleAlert, LoaderCircle } from '@lucide/svelte';
  import { errorMessage, processesApi, type ManagedProcess } from '$lib/api';
  import { onServerConnection, onServerEvent } from '$lib/api/events';
  import { Button, EmptyState, Panel, Badge } from '$lib/components/ui';
  import { formatDateTime, formatSize } from '$lib/utils/format';

  let processes = $state<ManagedProcess[]>([]);
  let loading = $state(true);
  let error = $state('');
  let stoppingId = $state('');
  let clock = $state(Date.now());
  let filter = $state<'all' | 'active' | 'finished'>('all');
  const active = $derived(processes.filter((item) => item.status === 'running' || item.status === 'stopping'));
  const finished = $derived(processes.filter((item) => item.status === 'stopped' || item.status === 'exited' || item.status === 'failed'));
  const visible = $derived(filter === 'active' ? active : filter === 'finished' ? finished : processes);

  function runtime(item: ManagedProcess) {
    const end = item.endedAt ? new Date(item.endedAt).getTime() : clock;
    const seconds = Math.max(0, Math.floor((end - new Date(item.startedAt).getTime()) / 1000));
    if (seconds < 60) return String(seconds) + 's';
    if (seconds < 3600) return String(Math.floor(seconds / 60)) + 'm ' + String(seconds % 60) + 's';
    return String(Math.floor(seconds / 3600)) + 'h ' + String(Math.floor((seconds % 3600) / 60)) + 'm';
  }
  function tone(status: ManagedProcess['status']) {
    if (status === 'running') return 'success';
    if (status === 'stopping') return 'warning';
    if (status === 'failed') return 'danger';
    return 'neutral';
  }
  async function load() {
    try { processes = await processesApi.list(); error = ''; }
    catch (err) { error = errorMessage(err, 'Unable to load managed processes'); }
    finally { loading = false; }
  }
  async function stop(item: ManagedProcess) {
    if (!item.stoppable || stoppingId) return;
    stoppingId = item.id; error = '';
    try { await processesApi.stop(item.id); await load(); }
    catch (err) { error = errorMessage(err, 'Unable to stop process'); }
    finally { stoppingId = ''; }
  }
  onMount(() => {
    void load();
    const unsubscribeEvent = onServerEvent('process.updated', () => { void load(); });
    const unsubscribeMetrics = onServerEvent('process.metrics', (event) => {
      try {
        const payload = JSON.parse(event.data) as { processes?: ManagedProcess[] };
        if (!Array.isArray(payload.processes)) return;
        const metrics = new Map(payload.processes.map((item) => [item.id, item]));
        processes = processes.map((item) => metrics.has(item.id) ? { ...item, ...metrics.get(item.id) } : item);
      } catch { /* Ignore malformed telemetry events. */ }
    });
    const clockTimer = window.setInterval(() => { clock = Date.now(); }, 1_000);
    let wasConnected = false;
    const unsubscribeConnection = onServerConnection((connected) => {
      if (connected && wasConnected) void load();
      if (connected) wasConnected = true;
    });
    return () => {
      unsubscribeEvent();
      unsubscribeMetrics();
      unsubscribeConnection();
      window.clearInterval(clockTimer);
    };
  });
</script>

<div class="flex w-full min-w-0 flex-col gap-4">
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <div class="rounded-xl border border-line bg-surface-raised p-4">
      <div class="flex items-center gap-2 text-sm text-fg-muted"><Activity size={15} /> Managed processes</div>
      <p class="mt-2 text-2xl font-semibold tabular-nums text-fg">{processes.length}</p>
    </div>
    <div class="rounded-xl border border-line bg-surface-raised p-4">
      <div class="flex items-center gap-2 text-sm text-fg-muted"><LoaderCircle size={15} /> Running now</div>
      <p class="mt-2 text-2xl font-semibold tabular-nums text-fg">{active.length}</p>
    </div>
    <div class="rounded-xl border border-line bg-surface-raised p-4">
      <div class="flex items-center gap-2 text-sm text-fg-muted"><CircleCheck size={15} /> Finished</div>
      <p class="mt-2 text-2xl font-semibold tabular-nums text-fg">{finished.length}</p>
    </div>
  </div>

  <Panel title="Process Monitor" description="Processes started and managed by this Toolsmith instance." tag="Host scoped">
    {#snippet actions()}
      <Button size="sm" onclick={() => { loading = true; void load(); }} disabled={loading}>
        <RefreshCw size={14} class={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    {/snippet}
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div class="flex items-center gap-1 rounded-lg bg-surface p-1">
        {#each [{value:'all',label:'All'},{value:'active',label:'Running'},{value:'finished',label:'Finished'}] as option}
          <button type="button" class={['rounded-md px-3 py-1.5 text-xs font-medium transition-colors', filter === option.value ? 'bg-surface-raised text-fg shadow-sm' : 'text-fg-muted hover:text-fg']} onclick={() => filter = option.value as typeof filter}>{option.label}</button>
        {/each}
      </div>
    </div>
    {#if error}
      <div class="m-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger"><CircleAlert size={16} class="mt-0.5 shrink-0" />{error}</div>
    {/if}
    {#if loading && processes.length === 0}
      <div class="space-y-3 p-4" aria-busy="true"><div class="h-4 w-40 animate-pulse rounded bg-surface-active"></div><div class="h-16 rounded-lg bg-surface-active"></div><div class="h-16 rounded-lg bg-surface-active"></div></div>
    {:else if visible.length === 0}
      <EmptyState icon={Activity} title="No processes found" description={filter === 'active' ? 'There are no active processes managed by this instance.' : 'Processes launched by Toolsmith will appear here.'} />
    {:else}
      <div class="divide-y divide-line">
        {#each visible as item (item.id)}
          <div class="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-fg">{item.label}</span>
                <Badge tone={tone(item.status)}>{item.status}</Badge>
                <Badge tone="neutral">{item.source}</Badge>
                <span class="text-xs text-fg-faint">PID {item.pid}</span>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span class="inline-flex items-center gap-1"><Clock3 size={13} /> {runtime(item)}</span>
                <span class="inline-flex items-center gap-1"><MemoryStick size={13} /> {formatSize(item.memoryRssBytes ?? null)}</span>
                <span class="inline-flex items-center gap-1"><Cpu size={13} /> {item.cpuPercent === undefined ? "—" : item.cpuPercent.toFixed(1) + "%"}</span>
                <span class="inline-flex items-center gap-1"><Terminal size={13} /> {item.processName ?? item.kind}</span>
                <span>Started {formatDateTime(item.startedAt)}</span>
              </div>
              {#if item.cwd}<p class="truncate font-mono text-xs text-fg-faint" title={item.cwd}>{item.cwd}</p>{/if}
              {#if item.exitCode !== undefined}<p class="text-xs text-fg-faint">Exit code: {item.exitCode}</p>{/if}
            </div>
            {#if item.stoppable && (item.status === 'running' || item.status === 'stopping')}
              <Button variant="danger" size="sm" disabled={!!stoppingId || item.status === 'stopping'} onclick={() => void stop(item)}>
                {#if stoppingId === item.id || item.status === 'stopping'}<LoaderCircle size={14} class="animate-spin" /> Stopping…{:else}<Square size={13} /> Stop process{/if}
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </Panel>
  <p class="px-1 text-xs text-fg-faint">This view only includes processes launched and registered by Toolsmith. It is not a complete list of every process on the operating system. Memory figures are per-process RSS; unavailable metrics are shown as a dash.</p>
</div>
