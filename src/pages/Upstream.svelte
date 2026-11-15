<script lang="ts">
  import { onMount } from 'svelte';
  import { Info, Pencil, Plug, RefreshCw, RotateCw, Trash2 } from '@lucide/svelte';
  import {
    Badge,
    Button,
    ConfirmDialog,
    EmptyState,
    IconButton,
    Modal,
    OptionDropdown,
    Panel,
    SearchInput,
    StatusDot,
    Switch,
  } from '$lib/components/ui';
  import { upstream } from '$lib/stores/upstream.svelte';
  import type { ToolPermission, UpstreamServer, UpstreamServerInput, UpstreamServerStatus } from '$lib/types';
  import { permissionOptions } from '$lib/data/tools';
  import { UpstreamForm } from '$features/upstream';

  let search = $state('');
  let formOpen = $state(false);
  let editingServer = $state<UpstreamServer | null>(null);
  let formSaving = $state(false);
  let detailServer = $state<UpstreamServer | null>(null);
  let deleteTarget = $state<UpstreamServer | null>(null);

  const filtered = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return upstream.items;
    return upstream.items.filter((server) =>
      (server.id + ' ' + server.name + ' ' + server.transport).toLowerCase().includes(query),
    );
  });

  const detailTools = $derived(
    detailServer ? (upstream.toolsByServer[detailServer.id] ?? []) : [],
  );

  const statusMeta: Record<UpstreamServerStatus, { tone: 'success' | 'warning' | 'danger' | 'muted'; label: string }> = {
    connected: { tone: 'success', label: 'Terhubung' },
    down: { tone: 'danger', label: 'Down' },
    disabled: { tone: 'muted', label: 'Nonaktif' },
    error: { tone: 'warning', label: 'Error' },
  };

  function openAdd() {
    editingServer = null;
    formOpen = true;
  }

  function openEdit(server: UpstreamServer) {
    editingServer = server;
    formOpen = true;
  }

  function openDetail(server: UpstreamServer) {
    detailServer = server;
    void upstream.loadDetail(server.id);
  }

  async function saveForm(payload: UpstreamServerInput | Partial<UpstreamServerInput>): Promise<boolean> {
    formSaving = true;
    try {
      if (editingServer) {
        const updated = await upstream.update(editingServer, payload);
        if (updated) {
          formOpen = false;
          return true;
        }
        return false;
      }
      const created = await upstream.create(payload as UpstreamServerInput);
      if (created) {
        formOpen = false;
        return true;
      }
      return false;
    } finally {
      formSaving = false;
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    const ok = await upstream.remove(target);
    if (ok) deleteTarget = null;
  }

  onMount(() => {
    void upstream.load();
    const onInstanceChange = () => {
      detailServer = null;
      deleteTarget = null;
      formOpen = false;
      void upstream.load();
    };
    window.addEventListener('toolsmith-console:instance-change', onInstanceChange);
    return () =>
      window.removeEventListener('toolsmith-console:instance-change', onInstanceChange);
  });
</script>

<Panel title="Upstream MCP" description="Server MCP eksternal yang tool-nya diteruskan lewat Toolsmith.">
  {#snippet actions()}
    <Button variant="secondary" size="sm" disabled={upstream.loading} onclick={() => void upstream.load()}>
      <RefreshCw size={14} />
      Muat ulang
    </Button>
    <Button variant="primary" size="sm" onclick={openAdd}>+ Tambah server</Button>
  {/snippet}

  <div class="flex flex-col gap-3 bg-surface-raised px-4 py-4 sm:flex-row sm:items-center">
    <SearchInput
      class="flex-1"
      bind:value={search}
      placeholder="Cari ID atau nama server…"
      label="Cari server upstream"
    />
  </div>

  {#if upstream.loading}
    <p class="px-4 py-6 text-sm text-fg-subtle">Memuat server upstream…</p>
  {:else}
    {#if upstream.error}
      <p class="border-b border-line px-4 py-2 text-sm text-danger" role="alert">{upstream.error}</p>
    {/if}
    {#if filtered.length}
      <ul class="divide-y divide-line px-2 py-1 sm:px-3">
        {#each filtered as server (server.id)}
          {@const meta = statusMeta[server.status]}
          <li class="flex min-h-12 flex-wrap items-center gap-3 px-2 py-2.5 hover:bg-surface-hover/60 sm:px-3">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 text-left"
              onclick={() => openDetail(server)}
              aria-label={'Detail server ' + server.name}
            >
              <StatusDot tone={meta.tone} pulse={server.status === 'connected'} />
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="truncate text-sm font-medium text-fg">{server.name}</span>
                  <span class="shrink-0 font-mono text-xs text-fg-subtle">{server.id}</span>
                  <Badge tone={meta.tone === 'success' ? 'success' : meta.tone === 'danger' ? 'danger' : meta.tone === 'warning' ? 'warning' : 'neutral'}>
                    {meta.label}
                  </Badge>
                  <Badge tone="neutral">{server.transport}</Badge>
                  <span class="shrink-0 text-xs text-fg-subtle">{server.toolCount} tool</span>
                </span>
                {#if server.lastError}
                  <span class="mt-0.5 block truncate text-xs text-danger" title={server.lastError}>
                    {server.lastError}
                  </span>
                {:else if server.transport === 'stdio' && server.command}
                  <span class="mt-0.5 block truncate font-mono text-xs text-fg-faint" title={server.command}>
                    {server.command}
                  </span>
                {:else if server.transport === 'streamable-http' && server.url}
                  <span class="mt-0.5 block truncate font-mono text-xs text-fg-faint" title={server.url}>
                    {server.url}
                  </span>
                {/if}
              </span>
            </button>
            <span class="flex shrink-0 items-center gap-1">
              <span class="flex items-center gap-2 pr-1 text-xs text-fg-subtle">
                {server.enabled ? 'Aktif' : 'Nonaktif'}
                <Switch
                  checked={server.enabled}
                  disabled={upstream.updating.has(server.id)}
                  label={server.enabled ? 'Nonaktifkan ' + server.name : 'Aktifkan ' + server.name}
                  onchange={() => void upstream.toggleEnabled(server)}
                />
              </span>
              <IconButton
                label={'Detail ' + server.name}
                size="sm"
                onclick={() => openDetail(server)}
              >
                <Info size={15} strokeWidth={1.8} />
              </IconButton>
              <IconButton
                label={'Reconnect ' + server.name}
                size="sm"
                disabled={!server.enabled || upstream.updating.has(server.id)}
                onclick={() => void upstream.reconnect(server)}
              >
                <RotateCw size={15} strokeWidth={1.8} />
              </IconButton>
              <IconButton
                label={'Ubah ' + server.name}
                size="sm"
                disabled={upstream.updating.has(server.id)}
                onclick={() => openEdit(server)}
              >
                <Pencil size={15} strokeWidth={1.8} />
              </IconButton>
              <IconButton
                label={'Hapus ' + server.name}
                size="sm"
                disabled={upstream.updating.has(server.id)}
                onclick={() => (deleteTarget = server)}
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </IconButton>
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <EmptyState
        icon={Plug}
        title={search ? 'Tidak ada server yang cocok' : 'Belum ada server upstream'}
        description={search
          ? 'Coba kata kunci lain.'
          : 'Tambahkan server MCP eksternal supaya tool-nya bisa dipanggil lewat Toolsmith.'}
      >
        {#if !search}
          <Button variant="primary" size="sm" onclick={openAdd}>+ Tambah server</Button>
        {/if}
      </EmptyState>
    {/if}
  {/if}
</Panel>

<UpstreamForm
  open={formOpen}
  server={editingServer}
  saving={formSaving}
  oncancel={() => (formOpen = false)}
  onsave={saveForm}
/>

<Modal
  open={detailServer !== null}
  title={detailServer ? `Tool: ${detailServer.name}` : 'Detail server'}
  description={detailServer?.id ?? ''}
  onclose={() => (detailServer = null)}
  width="max-w-3xl"
>
  {#if detailServer}
    {@const server = detailServer}
    {@const meta = statusMeta[server.status]}
    <div class="space-y-4 p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone === 'success' ? 'success' : meta.tone === 'danger' ? 'danger' : meta.tone === 'warning' ? 'warning' : 'neutral'}>
          {meta.label}
        </Badge>
        <Badge tone="neutral">{server.transport}</Badge>
        <span class="text-xs text-fg-subtle">{server.toolCount} tool</span>
        {#if server.hasAuthSecret}<span class="text-xs text-fg-subtle">Secret tersimpan</span>{/if}
        {#if server.hasEnvSecrets}<span class="text-xs text-fg-subtle">Env tersimpan</span>{/if}
      </div>
      {#if server.lastError}
        <p class="text-sm text-danger" role="alert">{server.lastError}</p>
      {/if}
      {#if upstream.toolsLoading.has(server.id)}
        <p class="text-sm text-fg-subtle">Memuat daftar tool…</p>
      {:else if detailTools.length}
        <ul class="divide-y divide-line rounded-lg border border-line">
          {#each detailTools as tool (tool.name)}
            <li class="flex min-h-12 flex-wrap items-center gap-3 px-3 py-2">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-mono text-sm text-fg" title={tool.exposedName}>
                  {tool.exposedName}
                </span>
                <span class="block truncate text-xs text-fg-subtle">
                  {tool.description ?? 'Tidak ada deskripsi.'}
                </span>
              </span>
              <OptionDropdown
                label={'Izin tool ' + tool.exposedName}
                value={tool.permissionOverride ?? tool.permission}
                disabled={upstream.updating.has(tool.exposedName)}
                options={permissionOptions}
                onchange={(value) => void upstream.setToolPermission(server.id, tool, value as ToolPermission)}
              />
              <Switch
                checked={tool.exposed}
                disabled={upstream.updating.has(tool.exposedName)}
                label={tool.exposed ? 'Sembunyikan ' + tool.exposedName : 'Tampilkan ' + tool.exposedName}
                onchange={(value) => void upstream.setToolExposed(server.id, tool, value)}
              />
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-fg-subtle">
          {server.enabled
            ? 'Server ini belum melaporkan tool apa pun. Coba reconnect.'
            : 'Server nonaktif — aktifkan dulu untuk melihat tool-nya.'}
        </p>
      {/if}
    </div>
  {/if}
</Modal>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Hapus server upstream?"
  description={deleteTarget
    ? `Server ${deleteTarget.name} (${deleteTarget.id}) akan dihapus dan diputus. Tool-nya tidak lagi tersedia lewat Toolsmith.`
    : ''}
  confirmLabel="Hapus"
  destructive
  onconfirm={() => void confirmDelete()}
  oncancel={() => (deleteTarget = null)}
/>

