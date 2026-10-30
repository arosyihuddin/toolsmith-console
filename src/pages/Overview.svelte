<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { StatCard, StatusDot } from '$lib/components/ui';
  import { dashboard } from '$lib/stores/dashboard.svelte';
  import { approvals } from '$features/approvals/approvals.svelte';
  import OverviewSkeleton from '$features/overview/OverviewSkeleton.svelte';
  import RiskPanel from '$features/overview/RiskPanel.svelte';
  import RuntimePanel from '$features/overview/RuntimePanel.svelte';
  import StoragePanel from '$features/overview/StoragePanel.svelte';
  import SystemPanel from '$features/overview/SystemPanel.svelte';

  type ResourceSample = { time: string; cpu: number | null; memoryGiB: number | null; gpu: number | null };
  const system = $derived(dashboard.host.system ?? {});
  const service = $derived(dashboard.host.service ?? {});
  const memoryUsedGiB = $derived(system.memory?.used_bytes == null ? null : system.memory.used_bytes / 1024 ** 3);
  const memoryTotalGiB = $derived(system.memory?.total_bytes == null ? null : system.memory.total_bytes / 1024 ** 3);
  const gpu = $derived(system.gpu?.devices?.[0]);
  let resourceHistory = $state<ResourceSample[]>([]);
  onMount(() => {
    const onInstanceChange = () => { resourceHistory = []; };
    window.addEventListener('omp-control:instance-change', onInstanceChange);
    return () => window.removeEventListener('omp-control:instance-change', onInstanceChange);
  });
  $effect(() => {
    const sample: ResourceSample = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      cpu: system.cpu?.usage_percent == null ? null : Math.max(0, Math.min(100, system.cpu.usage_percent)),
      memoryGiB: memoryUsedGiB,
      gpu: gpu?.utilization_gpu_percent == null ? null : Math.max(0, Math.min(100, gpu.utilization_gpu_percent)),
    };
    resourceHistory = [...untrack(() => resourceHistory).slice(-59), sample];
  });
  const timeAt = (position: number) => resourceHistory[Math.round((resourceHistory.length - 1) * position)]?.time ?? '—';
  const linePoints = (key: 'cpu' | 'memoryGiB' | 'gpu', max = 100) => resourceHistory
    .map((sample, index) => sample[key] == null ? null : `${24 + (resourceHistory.length < 2 ? 0 : index / (resourceHistory.length - 1) * 294)},${10 + (1 - Math.max(0, Math.min(max, sample[key] ?? 0)) / max) * 140}`)
    .filter((point): point is string => point !== null).join(' ');
  const latest = (key: 'cpu' | 'memoryGiB' | 'gpu') => resourceHistory.at(-1)?.[key] ?? null;
</script>

{#if dashboard.loading}
  <OverviewSkeleton />
{:else}
  <div class="space-y-5 sm:space-y-6">
    <section class="rounded-xl border border-line bg-surface-raised p-4 shadow-card sm:p-5 lg:p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <p class="eyebrow">OPERATIONS CENTER</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Overview</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-fg-subtle">Ringkasan kondisi server, resource host, dan approval yang membutuhkan perhatian.</p>
          <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span class="inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg-muted"><span class="h-1.5 w-1.5 shrink-0 rounded-full" class:bg-emerald-400={dashboard.connected} class:bg-fg-faint={!dashboard.connected}></span><span class="truncate">{system.os?.hostname ?? 'Toolsmith server'}</span></span>
            <span class="text-fg-faint">{system.os?.pretty_name ?? system.os?.platform ?? 'Host telemetry'}</span>
          </div>
        </div>
        <div class="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
          <span class={['inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm font-medium lg:self-end', dashboard.connected ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500' : 'border-line bg-surface text-fg-subtle']}>
            <StatusDot tone={dashboard.connected ? 'success' : 'muted'} pulse={dashboard.connected} />
            {dashboard.connected ? 'Telemetry connected' : 'Connection unavailable'}
          </span>
          <span class="text-xs text-fg-faint">Live updates via server events</span>
        </div>
      </div>
    </section>

    <section aria-label="Key metrics" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <a href="/tools" class="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"><StatCard label="Registered tools" value={dashboard.toolCount} hint="Available system capabilities" /></a>
      <StatCard label="Tool calls today" value={dashboard.toolCallsToday.toLocaleString()} hint="Since 00:00 WIB" />
      <a href="/approvals" class="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"><StatCard label="Pending approvals" value={approvals.pending.length} hint={approvals.pending.length ? 'Action required · review requests' : 'No requests waiting'} /></a>
      <StatCard label="Server status" hint="Remote telemetry connection">
        {#snippet valueSlot()}
          <span class="flex items-center gap-2 text-xl sm:text-2xl"><StatusDot tone={dashboard.connected ? 'success' : 'muted'} pulse={dashboard.connected} />{dashboard.connected ? 'Connected' : 'Offline'}</span>
        {/snippet}
      </StatCard>
    </section>
    <section class="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3" aria-label="Resource visualizations">
      <div class="min-w-0 rounded-xl border border-line bg-surface-raised p-2 shadow-card sm:p-3">
        <div class="flex items-start justify-between gap-3"><div><h2 class="text-sm font-semibold text-fg">CPU utilization</h2><p class="mt-1 text-xs text-fg-subtle">Recent host CPU usage</p></div><span class="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-faint">{system.cpu?.logical_cores ?? '—'} cores</span></div>
        <div class="mt-3">
          <svg viewBox="0 0 320 170" preserveAspectRatio="none" class="block h-56 w-full sm:h-64" role="img" aria-label="CPU utilization line chart, percentage over time">
            {#each [100, 75, 50, 25, 0] as tick, i}<line x1="24" x2="318" y1={10 + i * 35} y2={10 + i * 35} stroke="currentColor" stroke-opacity="0.12" stroke-width="1" /><text x="18" y={14 + i * 35} text-anchor="end" font-size="7" fill="currentColor" opacity="0.7">{tick}%</text>{/each}
            <line x1="24" x2="24" y1="10" y2="150" stroke="currentColor" stroke-opacity="0.3" /><line x1="24" x2="318" y1="150" y2="150" stroke="currentColor" stroke-opacity="0.3" />
            <text x="24" y="163" text-anchor="start" font-size="8" fill="currentColor" opacity="0.65">{timeAt(0)}</text><text x="175" y="163" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.65">{timeAt(0.5)}</text><text x="318" y="163" text-anchor="end" font-size="8" fill="currentColor" opacity="0.65">{timeAt(1)}</text>
            {#if resourceHistory.length > 1}<polyline points={resourceHistory.map((sample, index) => sample.cpu == null ? null : `${24 + (resourceHistory.length < 2 ? 0 : index / (resourceHistory.length - 1) * 294)},${10 + (1 - Math.max(0, Math.min(100, sample.cpu)) / 100) * 140}`).filter((point): point is string => point !== null).join(' ')} fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />{/if}
          </svg>
        </div>
        <div class="mt-3 flex items-baseline justify-between"><span class="text-sm text-fg-subtle">Current CPU</span><span class="text-lg font-semibold tabular-nums text-fg">{latest('cpu') == null ? '—' : `${latest('cpu')!.toFixed(1)}%`}</span></div>
      </div>
      <div class="min-w-0 rounded-xl border border-line bg-surface-raised p-2 shadow-card sm:p-3">
        <div class="flex items-start justify-between gap-3"><div><h2 class="text-sm font-semibold text-fg">Memory (RAM)</h2><p class="mt-1 text-xs text-fg-subtle">Used memory over time</p></div><span class="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-faint">{memoryTotalGiB == null ? '—' : `${memoryTotalGiB.toFixed(1)} GiB total`}</span></div>
        <div class="mt-3">
          <svg viewBox="0 0 320 170" preserveAspectRatio="none" class="block h-56 w-full sm:h-64" role="img" aria-label="RAM usage line chart, GiB over time">
            {#each [100, 75, 50, 25, 0] as tick, i}<line x1="24" x2="318" y1={10 + i * 35} y2={10 + i * 35} stroke="currentColor" stroke-opacity="0.12" stroke-width="1" /><text x="18" y={14 + i * 35} text-anchor="end" font-size="7" fill="currentColor" opacity="0.7">{memoryTotalGiB == null ? '—' : (memoryTotalGiB * tick / 100).toFixed(0)}</text>{/each}
            <text x="17" y="7" font-size="8" fill="currentColor" opacity="0.65">GiB</text>
            <line x1="24" x2="24" y1="10" y2="150" stroke="currentColor" stroke-opacity="0.3" /><line x1="24" x2="318" y1="150" y2="150" stroke="currentColor" stroke-opacity="0.3" />
            <text x="24" y="163" text-anchor="start" font-size="8" fill="currentColor" opacity="0.65">{timeAt(0)}</text><text x="175" y="163" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.65">{timeAt(0.5)}</text><text x="318" y="163" text-anchor="end" font-size="8" fill="currentColor" opacity="0.65">{timeAt(1)}</text>
            {#if resourceHistory.length > 1 && memoryTotalGiB != null}<polyline points={resourceHistory.map((sample, index) => sample.memoryGiB == null ? null : `${24 + index / (resourceHistory.length - 1) * 294},${10 + (1 - Math.max(0, Math.min(memoryTotalGiB, sample.memoryGiB)) / memoryTotalGiB) * 140}`).filter((point): point is string => point !== null).join(' ')} fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />{/if}
          </svg>
        </div>
        <div class="mt-3 flex items-baseline justify-between"><span class="text-sm text-fg-subtle">RAM used</span><span class="text-lg font-semibold tabular-nums text-fg">{latest('memoryGiB') == null ? '—' : `${latest('memoryGiB')!.toFixed(1)} GiB`}</span></div>
      </div>
      <div class="min-w-0 rounded-xl border border-line bg-surface-raised p-2 shadow-card sm:p-3">
        <div class="flex items-start justify-between gap-3"><div><h2 class="text-sm font-semibold text-fg">GPU utilization</h2><p class="mt-1 text-xs text-fg-subtle">Recent GPU compute usage</p></div><span class="max-w-36 truncate rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-faint">{gpu?.name ?? (gpu ? 'GPU detected' : 'Unavailable')}</span></div>
        <div class="mt-3">
          <svg viewBox="0 0 320 170" preserveAspectRatio="none" class="block h-56 w-full sm:h-64" role="img" aria-label="GPU utilization line chart, percentage over time">
            {#each [100, 75, 50, 25, 0] as tick, i}<line x1="24" x2="318" y1={10 + i * 35} y2={10 + i * 35} stroke="currentColor" stroke-opacity="0.12" stroke-width="1" /><text x="18" y={14 + i * 35} text-anchor="end" font-size="7" fill="currentColor" opacity="0.7">{tick}%</text>{/each}
            <line x1="24" x2="24" y1="10" y2="150" stroke="currentColor" stroke-opacity="0.3" /><line x1="24" x2="318" y1="150" y2="150" stroke="currentColor" stroke-opacity="0.3" />
            <text x="24" y="163" text-anchor="start" font-size="8" fill="currentColor" opacity="0.65">{timeAt(0)}</text><text x="175" y="163" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.65">{timeAt(0.5)}</text><text x="318" y="163" text-anchor="end" font-size="8" fill="currentColor" opacity="0.65">{timeAt(1)}</text>
            {#if resourceHistory.length > 1 && gpu}<polyline points={linePoints('gpu')} fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />{/if}
          </svg>
        </div>
        <div class="mt-3 flex items-baseline justify-between"><span class="text-sm text-fg-subtle">Current GPU</span><span class="text-lg font-semibold tabular-nums text-fg">{latest('gpu') == null ? '—' : `${latest('gpu')!.toFixed(1)}%`}</span></div>
      </div>
    </section>
    <section>
      <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 class="text-base font-semibold text-fg">Host health</h2><p class="mt-0.5 text-sm text-fg-subtle">Resource usage and system environment</p></div>
        <span class="text-xs text-fg-faint">{system.cpu?.logical_cores ?? '—'} logical CPU cores</span>
      </div>
      <div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <SystemPanel {system} {service} />
        <StoragePanel {system} />
      </div>
    </section>

    <section class="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
      <RuntimePanel {system} />
      <RiskPanel counts={dashboard.toolRiskCounts} total={dashboard.toolCount} />
    </section>


  </div>
{/if}
