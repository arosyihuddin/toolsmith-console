<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle, ArrowUpRight, Check, Copy, Globe, LoaderCircle, Plus, Square } from '@lucide/svelte';
  import { errorMessage, normalizeTunnelInfo, tunnelsApi, type CloudflaredStatus, type TunnelInfo } from '$lib/api';
    import { Panel } from '$lib/components/ui';

  let port = $state('5173');
  let tunnels = $state<TunnelInfo[]>([]);
  let cloudflared = $state<CloudflaredStatus | null>(null);
  let checkingCloudflared = $state(true);
  let loading = $state(true);
  let starting = $state(false);
  let stoppingId = $state('');
  let error = $state('');
  let copiedId = $state('');

  const activeTunnels = $derived(tunnels.filter((tunnel) => ['starting', 'active', 'stopping'].includes(tunnel.status)));
  const busy = $derived(starting);
  const tunnelUnavailable = $derived(!checkingCloudflared && (!cloudflared || cloudflared.available === false || cloudflared.installed === false));
  async function startTunnel(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    starting = true;
    error = '';
    try {
      const parsedPort = Number(port);
      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        error = 'Enter a valid port from 1 to 65535.';
        return;
      }
      await tunnelsApi.start('http://127.0.0.1:' + parsedPort);
    } catch (err) {
      error = errorMessage(err, 'Unable to start Cloudflare Tunnel');
    } finally {
      starting = false;
    }
  }

  async function stopTunnel(tunnel: TunnelInfo) {
    stoppingId = tunnel.id;
    error = '';
    try {
      await tunnelsApi.stop(tunnel.id);
    } catch (err) {
      error = errorMessage(err, 'Unable to stop tunnel');
    } finally {
      stoppingId = '';
    }
  }

  async function copyUrl(tunnel: TunnelInfo) {
    if (!tunnel.publicUrl) return;
    try {
      await navigator.clipboard.writeText(tunnel.publicUrl);
      copiedId = tunnel.id;
      window.setTimeout(() => { if (copiedId === tunnel.id) copiedId = ''; }, 1600);
    } catch {
      error = 'Clipboard access is unavailable. Copy the URL manually.';
    }
  }

  function statusLabel(status: TunnelInfo['status']) {
    return ({ starting: 'Starting', active: 'Active', stopping: 'Stopping', stopped: 'Stopped', error: 'Error' })[status];
  }

  onMount(() => {
    let events: EventSource | undefined;
    let generation = 0;

    const loadInstance = async () => {
      const current = ++generation;
      events?.close();
      events = undefined;
      tunnels = [];
      cloudflared = null;
      checkingCloudflared = true;
      loading = true;
      error = '';
      try {
        const status = await tunnelsApi.status();
        if (current !== generation) return;
        cloudflared = status;
        if (status.available === false) {
          loading = false;
          return;
        }
        const source = new EventSource(tunnelsApi.eventsUrl());
        events = source;
        source.addEventListener('tunnels', (event) => {
          if (current !== generation || events !== source) return;
          try {
            const data = JSON.parse((event as MessageEvent<string>).data) as { tunnels: Parameters<typeof normalizeTunnelInfo>[0][] };
            tunnels = (data.tunnels ?? []).map(normalizeTunnelInfo);
            loading = false;
            error = '';
          } catch {
            error = 'Received an invalid tunnel update from the server.';
          }
        });
        source.onerror = () => {
          // EventSource reconnects automatically; keep the last known tunnel state visible.
        };
      } catch {
        if (current !== generation) return;
        cloudflared = null;
        loading = false;
        error = 'Toolsmith API unavailable. Check the selected instance credential and TOOLSMITH_API_TOKEN on the Toolsmith host.';
      } finally {
        if (current === generation) checkingCloudflared = false;
      }
    };

    const onInstanceChange = () => { void loadInstance(); };
    window.addEventListener('toolsmith-console:instance-change', onInstanceChange);
    void loadInstance();
    return () => {
      generation++;
      events?.close();
      window.removeEventListener('toolsmith-console:instance-change', onInstanceChange);
    };
  });
</script>

<div class="flex w-full min-w-0 flex-col gap-4">
  <Panel title="Cloudflare Tunnel status" description="Checks whether cloudflared is installed on the selected Toolsmith instance.">
    <div class="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 items-start gap-3">
        <span class={[(checkingCloudflared ? 'bg-warning' : cloudflared?.installed ? 'bg-success' : 'bg-danger'), 'mt-1 size-2.5 shrink-0 rounded-full']}></span>
        <div class="min-w-0">
          <p class="text-sm font-medium text-fg">{checkingCloudflared ? 'Checking installation…' : cloudflared === null ? 'Status unavailable' : cloudflared.available === false ? 'Tunnel process management unavailable in Workers' : cloudflared.installed ? 'cloudflared is installed' : 'cloudflared is not installed'}</p>
          {#if cloudflared?.version}<p class="mt-1 break-all text-xs text-fg-muted">{cloudflared.version}</p>{/if}
          {#if cloudflared?.path}<p class="mt-1 break-all font-mono text-xs text-fg-faint">{cloudflared.path}</p>{/if}
          {#if !checkingCloudflared && cloudflared === null}<p class="mt-1 text-xs text-fg-muted">Could not check the API host. Check the connection and try again.</p>{/if}
          {#if !checkingCloudflared && cloudflared?.available === false}<p class="mt-1 text-xs text-fg-muted">{cloudflared.reason ?? "Manage tunnels separately from this Worker deployment."}</p>{:else if !checkingCloudflared && cloudflared && !cloudflared.installed}<p class="mt-1 text-xs text-fg-muted">Install cloudflared on the selected Toolsmith host to create tunnels.</p>{/if}
        </div>
      </div>
      <button type="button" class="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-line px-3 text-xs font-medium text-fg-muted hover:bg-surface-hover" onclick={() => { checkingCloudflared = true; void tunnelsApi.status().then((status) => { cloudflared = status; }).catch(() => { cloudflared = null; }).finally(() => { checkingCloudflared = false; }); }}>Check again</button>
    </div>
  </Panel>

  <Panel title="Create Quick Tunnel" description="Starts a Quick Tunnel on the selected Toolsmith instance.">
    <form class="flex flex-col gap-3 p-4" onsubmit={startTunnel}>
      <label for="tunnel-port" class="text-sm font-medium text-fg">Local service port</label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <div class="relative min-w-0 flex-1">
          <Globe size={15} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input id="tunnel-port" bind:value={port} type="number" min="1" max="65535" step="1" required placeholder="5173" class="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent" disabled={busy || checkingCloudflared || tunnelUnavailable} />
        </div>
        <button type="submit" class="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || checkingCloudflared || tunnelUnavailable}>
          {#if starting}<LoaderCircle size={15} class="animate-spin" /> Starting…{:else}<Plus size={15} /> Start tunnel{/if}
        </button>
      </div>
      <p class="text-xs text-fg-faint">Enter the port of a service running on the selected Toolsmith host, for example 5173, 3000, or 8000. Tunnel creation is available only in self-hosted mode.</p>
      {#if error}<p class="flex items-start gap-2 text-sm text-danger" role="alert"><AlertTriangle size={15} class="mt-0.5 shrink-0" />{error}</p>{/if}
    </form>
  </Panel>

  <div class="grid grid-cols-1 gap-4">
    <Panel title="Active tunnels" description="Each tunnel has its own temporary URL and can be stopped independently.">
      {#if loading && tunnels.length === 0}
        <div class="space-y-3 p-4" aria-busy="true"><div class="h-4 w-32 animate-pulse rounded bg-surface-active"></div><div class="h-8 w-full animate-pulse rounded bg-surface-active"></div></div>
      {:else if activeTunnels.length === 0}
        <div class="flex flex-col items-center px-5 py-10 text-center">
          <div class="flex size-10 items-center justify-center rounded-full bg-surface text-fg-faint"><Globe size={19} /></div>
          <p class="mt-3 text-sm font-medium text-fg">No active tunnels</p>
          <p class="mt-1 max-w-xs text-sm text-fg-muted">Start a tunnel above. Active tunnels and their temporary URLs will appear here.</p>
        </div>
      {:else}
        <div class="divide-y divide-line">
          {#each activeTunnels as tunnel (tunnel.id)}
            <div class="space-y-3 p-4">
              <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <span class={['size-2 shrink-0 rounded-full', tunnel.status === 'active' ? 'bg-success' : 'bg-warning']}></span>
                  <span class="text-sm font-medium text-fg">{statusLabel(tunnel.status)}</span>
                  <span class="truncate text-xs text-fg-faint">{tunnel.targetUrl}</span>
                </div>
                <button type="button" class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-danger/30 px-2.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50" onclick={() => void stopTunnel(tunnel)} disabled={stoppingId === tunnel.id || tunnel.status === 'stopping'}>
                  {#if stoppingId === tunnel.id || tunnel.status === 'stopping'}<LoaderCircle size={13} class="animate-spin" />{:else}<Square size={12} />{/if} Stop
                </button>
              </div>
              {#if tunnel.publicUrl}
                <div class="rounded-lg border border-line bg-surface p-3">
                  <p class="text-xs font-medium text-fg-muted">Public URL</p>
                  <div class="mt-2 flex items-center gap-2">
                    <a href={tunnel.publicUrl} target="_blank" rel="noreferrer" class="min-w-0 flex-1 break-all text-sm font-medium text-accent underline-offset-4 hover:underline">{tunnel.publicUrl}</a>
                    <button type="button" aria-label="Copy tunnel URL" title="Copy URL" class="flex size-8 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-surface-hover" onclick={() => void copyUrl(tunnel)}>{#if copiedId === tunnel.id}<Check size={15} />{:else}<Copy size={15} />{/if}</button>
                    <a href={tunnel.publicUrl} target="_blank" rel="noreferrer" aria-label="Open tunnel URL" title="Open URL" class="flex size-8 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-surface-hover"><ArrowUpRight size={15} /></a>
                  </div>
                </div>
              {:else}
                <div class="flex items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm text-fg-muted"><LoaderCircle size={15} class="animate-spin" />Waiting for Cloudflare to issue a public URL…</div>
              {/if}
              {#if tunnel.error}<p class="text-sm text-danger">{tunnel.error}</p>{/if}
              <div class="flex items-center justify-between text-xs text-fg-faint"><span>Started {new Date(tunnel.createdAt).toLocaleString()}</span><span>{tunnel.logs.length} log lines</span></div>
              <details class="overflow-hidden rounded-lg border border-line">
                <summary class="cursor-pointer select-none bg-surface px-3 py-2 text-xs font-medium text-fg-muted hover:bg-surface-hover">Process logs · {tunnel.logs.length}</summary>
                {#if tunnel.logs.length}
                  <div class="max-h-64 space-y-1 overflow-auto bg-[#111318] p-3 font-mono text-xs leading-relaxed text-slate-300" aria-label={'Process logs for ' + tunnel.targetUrl}>
                    {#each tunnel.logs as line, index (tunnel.id + '-' + index)}
                      <p class="break-words">{line}</p>
                    {/each}
                  </div>
                {:else}
                  <p class="p-3 text-xs text-fg-faint">No process output yet.</p>
                {/if}
              </details>
            </div>
          {/each}
        </div>
      {/if}
    </Panel>

  </div>

</div>
