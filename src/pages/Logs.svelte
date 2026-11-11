<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, ChevronDown, RefreshCw, ScrollText } from '@lucide/svelte';
  import { errorMessage, logsApi } from '$lib/api';
  import { onServerEvents } from '$lib/api/events';
  import { EmptyState, IconButton, Menu, MenuItem, Panel, SearchInput, Skeleton } from '$lib/components/ui';
  import type { ToolCallLog } from '$lib/types';
  import { LogRow } from '$features/logs';

  type StatusFilter = 'all' | 'waiting_approval' | 'running' | 'success' | 'error';
  const statusOptions = (['all', 'waiting_approval', 'running', 'success', 'error'] as const).map((value) => ({ value, label: value === 'waiting_approval' ? 'waiting approval' : value }));
  let liveLogUpdates = new Map<string, ToolCallLog>();
  let loadGeneration = 0;

  let logs = $state<ToolCallLog[]>([]);
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let status = $state<StatusFilter>('all');
  let expandedId = $state('');
  let loadMoreSentinel = $state<HTMLDivElement>();
  let loadingMore = $state(false);
  let hasMore = $state(true);
  let limit = $state(200);

  const filtered = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return logs.filter(
      (log) =>
        (status === 'all' || log.status === status) &&
        (!query || `${log.toolName} ${log.sessionId ?? ''} ${log.requestId ?? ''}`.toLowerCase().includes(query)),
    );
  });

  const groupedLogs = $derived.by(() => {
    const groups: { date: string; label: string; logs: ToolCallLog[] }[] = [];
    const byDate = new Map<string, { date: string; label: string; logs: ToolCallLog[] }>();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const todayKey = dateKey(today);
    const yesterdayKey = dateKey(yesterday);
    for (const log of filtered) {
      const date = new Date(log.timestamp);
      if (Number.isNaN(date.getTime())) continue;
      const key = dateKey(date);
      let group = byDate.get(key);
      if (!group) {
        const label = key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        group = { date: key, label, logs: [] };
        byDate.set(key, group);
        groups.push(group);
      }
      group.logs.push(log);
    }
    return groups;
  });

  async function load() {
    const generation = ++loadGeneration;
    loading = true;
    error = '';
    try {
      const fetched = await logsApi.list(limit);
      if (generation !== loadGeneration) return;
      const merged = new Map(fetched.map((log) => [log.id, log]));
      for (const live of liveLogUpdates.values()) merged.set(live.id, live);
      logs = [...merged.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
      hasMore = fetched.length >= limit;
    } catch (err) {
      if (generation === loadGeneration) error = errorMessage(err, 'Unable to load logs');
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  async function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    loadingMore = true;
    const nextLimit = limit + 100;
    try {
      const fetched = await logsApi.list(nextLimit);
      const merged = new Map(fetched.map((log) => [log.id, log]));
      for (const live of liveLogUpdates.values()) merged.set(live.id, live);
      const nextLogs = [...merged.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, nextLimit);
      if (nextLogs.length <= logs.length) {
        hasMore = false;
      } else {
        logs = nextLogs;
        limit = nextLimit;
        hasMore = fetched.length >= nextLimit;
      }
    } catch (err) {
      error = errorMessage(err, 'Unable to load more logs');
    } finally {
      loadingMore = false;
    }
  }

  onMount(() => {
    void load();
    const onInstanceChange = () => {
      loadGeneration++;
      logs = [];
      liveLogUpdates = new Map();
      expandedId = '';
      limit = 200;
      hasMore = true;
      void load();
    };
    window.addEventListener('toolsmith-console:instance-change', onInstanceChange);
    const stopEvents = onServerEvents(['tool_call.created', 'tool_call.updated'], (event) => {
      try {
        const log = JSON.parse(event.data) as ToolCallLog;
        if (!log?.id) return;
        liveLogUpdates.set(log.id, log);
        while (liveLogUpdates.size > limit * 2) {
          const oldest = liveLogUpdates.keys().next().value;
          if (oldest === undefined) break;
          liveLogUpdates.delete(oldest);
        }
        const next = new Map(logs.map((item) => [item.id, item]));
        next.set(log.id, log);
        logs = [...next.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
      } catch {
        // Ignore malformed live events; manual refresh can recover the persisted state.
      }
    });
    return () => { stopEvents(); window.removeEventListener('toolsmith-console:instance-change', onInstanceChange); };
  });

  $effect(() => {
    const sentinel = loadMoreSentinel;
    if (!sentinel || !hasMore || loadingMore) return;
    const root = sentinel.closest('.overflow-y-auto');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { root, rootMargin: '300px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

<Panel title="Tool call logs" description="Persistent MCP tool-call history stored in SQLite.">
  <div class="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
    <SearchInput class="flex-1" bind:value={search} placeholder="Search tool calls…" label="Search tool calls" />
    <div class="flex items-center gap-2">
      <Menu width="w-48">
        {#snippet trigger({ toggle, open })}
          <button
            type="button"
            aria-label="Filter by status"
            aria-haspopup="menu"
            aria-expanded={open}
            onclick={toggle}
            class="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <span class="text-fg-faint">Status</span>
            <span class="capitalize">{status === 'all' ? 'All statuses' : status === 'waiting_approval' ? 'Waiting approval' : status}</span>
            <ChevronDown size={14} class="text-fg-faint" />
          </button>
        {/snippet}
        {#snippet children({ close })}
          {#each statusOptions as option (option.value)}
            <MenuItem
              class="justify-between capitalize"
              aria-checked={status === option.value}
              role="menuitemradio"
              onclick={() => {
                status = option.value;
                close();
              }}
            >
              <span>{option.value === 'all' ? 'All statuses' : option.label}</span>
              {#if status === option.value}<Check size={14} class="text-accent-hover" />{/if}
            </MenuItem>
          {/each}
        {/snippet}
      </Menu>
      <IconButton label="Refresh logs" variant="outline" disabled={loading} onclick={load}>
        {#if loading}<Skeleton class="size-3.5" />{:else}<RefreshCw size={14} />{/if}
      </IconButton>
    </div>
  </div>

  {#if error}
    <p class="px-4 py-4 text-sm text-danger" role="alert">{error}</p>
  {:else if loading && logs.length === 0}
    <div class="divide-y divide-line" aria-busy="true" aria-label="Loading logs">
      {#each Array(8) as _, index (index)}
        <div class="flex items-center gap-3 px-4 py-3.5"><Skeleton class="h-3 w-16" /><Skeleton class="h-3 w-48" /><Skeleton class="ml-auto h-4 w-14" /></div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <EmptyState icon={ScrollText} title="No tool calls found" description="Tool calls made through the MCP server will appear here." />
  {:else}
    <div>
      {#each groupedLogs as group (group.date)}
        <section aria-label={group.label}>
          <div class="sticky top-0 z-10 flex items-center gap-3 border-y border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
            <span class="text-xs font-semibold text-fg">{group.label}</span>
            <span class="text-xs text-fg-faint">{group.logs[0] ? new Date(group.logs[0].timestamp).toLocaleDateString() : group.date}</span>
            <span class="ml-auto text-xs tabular-nums text-fg-faint">{group.logs.length} {group.logs.length === 1 ? 'tool call' : 'tool calls'}</span>
          </div>
          <div class="divide-y divide-line">
            {#each group.logs as log (log.id)}
              <LogRow {log} expanded={expandedId === log.id} ontoggle={() => (expandedId = expandedId === log.id ? '' : log.id)} />
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
  {#if !loading && hasMore}
    <div bind:this={loadMoreSentinel} class="flex min-h-12 items-center justify-center border-t border-line px-4 py-3 text-xs text-fg-muted" aria-live="polite">
      {#if loadingMore}Loading more tool calls…{:else}Scroll for more{/if}
    </div>
  {:else if !hasMore && logs.length > 0}
    <p class="border-t border-line px-4 py-3 text-center text-xs text-fg-faint">All available tool calls loaded</p>
  {/if}
</Panel>
