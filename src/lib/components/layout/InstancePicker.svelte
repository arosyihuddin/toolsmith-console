<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, ArrowLeft, ArrowRight, Check, CircleAlert, EllipsisVertical, Eye, EyeOff, LogOut, Pencil, Plus, Server, Settings2, Trash2 } from '@lucide/svelte';
  import { Avatar, Modal, ConfirmDialog, Skeleton } from '$lib/components/ui';
  import { profile } from '$lib/stores/profile.svelte';
  import { authUser } from '$lib/stores/auth.svelte';
  import ProfileModal from './ProfileModal.svelte';
  import { instanceRegistry } from '$lib/stores/instances.svelte';
  import { instancesApi } from '$lib/api/instances';
  import type { Instance } from '$lib/api/instances';
  import { toast } from '$lib/stores/toast.svelte';

  interface Props { onenter: () => void; onback?: () => void; }
  let { onenter, onback }: Props = $props();
  let settingsOpen = $state(false);
  let accountOpen = $state(false);
  let openMenuId = $state<string | null>(null);
  let editing = $state<Instance | null>(null);
  let editName = $state('');
  let editUrl = $state('');
  let editCredential = $state('');
  let editCredentialVisible = $state(false);
  let saving = $state(false);
  let actionError = $state('');
  let refreshing = $state(false);
  let checkingHealth = $state<string | null>(null);
  function handleDocumentPointerDown(event: PointerEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('[data-instance-actions]')) openMenuId = null;
    if (!target.closest('[data-account-menu]')) accountOpen = false;
  }
  let error = $state('');
  let creating = $state(false);
  let createName = $state('');
  let createUrl = $state('http://127.0.0.1:48766');
  let createCredential = $state('');
  let createCredentialVisible = $state(false);
  let createSaving = $state(false);
  let createError = $state('');
  let pendingDelete = $state<Instance | null>(null);

  onMount(async () => {
    refreshing = true;
    await instanceRegistry.load();
    await instanceRegistry.checkAllHealth();
    error = instanceRegistry.error;
    refreshing = false;
  });

  function select(instance: Instance) {
    instanceRegistry.setActive(instance.id);
    onenter();
  }

  function openEdit(instance: Instance) {
    openMenuId = null;
    editing = instance;
    editName = instance.name;
    editUrl = instance.baseUrl;
    editCredential = '';
    actionError = '';
  }

  async function saveEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!editing || saving || !editName.trim() || !editUrl.trim()) return;
    saving = true;
    actionError = '';
    try {
      await instancesApi.update(editing.id, { name: editName.trim(), baseUrl: editUrl.trim(), ...(editCredential.trim() ? { credential: editCredential.trim() } : {}) });
      editing = null;
      await instanceRegistry.load();
      toast.success('Instance updated', 'Connection details saved.');
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Unable to update instance';
    } finally {
      saving = false;
    }
  }

  function removeInstance(instance: Instance) {
    openMenuId = null;
    pendingDelete = instance;
  }

  async function confirmRemoveInstance() {
    const instance = pendingDelete;
    if (!instance) return;
    pendingDelete = null;
    try {
      await instancesApi.remove(instance.id);
      await instanceRegistry.load();
      toast.success('Instance removed', instance.name + ' was removed from this control plane.');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to remove instance';
      toast.error('Could not remove instance', error);
    }
  }

  async function checkHealth(instance: Instance) {
    openMenuId = null;
    checkingHealth = instance.id;
    try {
      const result = await instanceRegistry.checkHealth(instance.id);
      if (result.status === 'online') toast.success(instance.name + ' is online', result.latencyMs + ' ms');
      else toast.info(instance.name + ' health check', result.error ?? 'Status: ' + result.status);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Health check failed';
      toast.error('Health check failed', message);
    } finally {
      checkingHealth = null;
    }
  }

  function openCreate() {
    openMenuId = null;
    createName = '';
    createUrl = 'http://127.0.0.1:48766';
    createCredential = '';
    createError = '';
    creating = true;
  }

  async function saveCreate(event: SubmitEvent) {
    event.preventDefault();
    if (createSaving || !createName.trim() || !createUrl.trim() || !createCredential.trim()) return;
    const hadActiveInstance = Boolean(instanceRegistry.activeId);
    createSaving = true;
    createError = '';
    try {
      await instancesApi.create({ name: createName.trim(), baseUrl: createUrl.trim(), credential: createCredential.trim() });
      creating = false;
      await instanceRegistry.load();
      toast.success('Instance added', createName.trim() + ' connected successfully.');
      if (!hadActiveInstance && instanceRegistry.active) onenter();
    } catch (e) {
      createError = e instanceof Error ? e.message : 'Connection test failed. Instance was not added.';
    } finally {
      createSaving = false;
    }
  }
</script>

<svelte:window onpointerdown={handleDocumentPointerDown} />

<div class="relative flex h-full min-h-screen flex-col overflow-y-auto bg-canvas text-fg">
  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(225,220,201,0.08),transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(225,220,201,0.10),transparent_45%),linear-gradient(180deg,rgba(0,0,0,0.08),#0b0b0b_72%)]"></div>
  <header class="relative flex items-center justify-between px-6 py-5 sm:px-10 lg:px-16">
    <div class="flex items-center gap-3">
      {#if instanceRegistry.active && onback}
        <button type="button" class="mr-1 flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg" aria-label="Back" title="Back" onclick={onback}>
          <ArrowLeft size={18} />
        </button>
      {/if}
      <div class="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface"><Server size={18} class="text-fg"/></div>
      <span class="text-sm font-semibold tracking-[0.18em]">TOOLSMITH CONSOLE</span>
    </div>
    <div class="relative" data-account-menu>
      <div class="flex items-center gap-1">
      <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface-hover" aria-label="Account" title="Account" aria-expanded={accountOpen} onclick={() => (accountOpen = !accountOpen)}>
        <Avatar name={authUser.username ?? 'User'} color={profile.data?.avatarColor} class="ring-2 ring-accent/70 ring-offset-1 ring-offset-canvas" />
      </button>
      </div>
      {#if accountOpen}
        <div class="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-line bg-surface-raised p-1.5 shadow-pop">
          <button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-fg-subtle transition hover:bg-surface-hover hover:text-fg" onclick={() => { accountOpen = false; settingsOpen = true; }}>
            <Settings2 size={15}/> Settings
          </button>
          <button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-danger transition hover:bg-danger/10" onclick={() => { accountOpen = false; window.dispatchEvent(new CustomEvent('toolsmith-console:logout')); }}>
            <LogOut size={15}/> Log out
          </button>
        </div>
      {/if}
    </div>
  </header>

  <main class="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-12 pt-8 sm:px-10 lg:px-16">
    <div class="mb-9 max-w-2xl">
      <p class="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-accent">Choose your workspace</p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-5xl">Which server are we using?</h1>
      <p class="mt-4 max-w-xl text-sm leading-6 text-fg-subtle sm:text-base">Pilih instance Toolsmith untuk membuka workspace. Hubungkan server terlebih dahulu jika ini pertama kalinya.</p>
    </div>

    {#if error}
      <div role="alert" class="mb-5 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-500 dark:text-red-200"><CircleAlert size={16}/>{error}<button class="ml-auto underline" onclick={async () => { await instanceRegistry.load(); error = instanceRegistry.error; }}>Coba lagi</button></div>
    {/if}

    {#if refreshing || instanceRegistry.loading}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{#each [1,2,3] as item (item)}<div class="h-44 animate-pulse rounded-2xl border border-line bg-surface"></div>{/each}</div>
    {:else if instanceRegistry.items.length === 0}
      <div class="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
        <div class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface-hover"><Server size={28} class="text-accent"/></div>
        <h2 class="text-xl font-semibold text-fg">No servers yet</h2>
        <p class="mt-2 max-w-md text-sm leading-6 text-fg-subtle">Tambahkan instance Toolsmith untuk mulai. Setelah terhubung, server akan muncul di sini seperti pilihan profil.</p>
        <button type="button" class="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-canvas transition hover:bg-accent-hover" onclick={openCreate}><Plus size={16}/> Add your first instance</button>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each instanceRegistry.items as instance (instance.id)}
          <div role="button" tabindex="0" aria-label={'Open ' + instance.name} class="group isolate relative flex min-h-44 cursor-pointer flex-col overflow-visible rounded-2xl border border-line bg-surface p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onclick={() => select(instance)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(instance); } }}>
            <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl opacity-60 transition group-hover:opacity-100"><div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#412d15] via-[#e1dcc9]/80 to-transparent"></div></div>
            <div class="relative z-[80] flex items-start justify-between gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-hover"><Server size={21} class="text-accent"/></div>
              <div class="flex items-center gap-2">
                {#if instanceRegistry.activeId === instance.id}<span class="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-300"><Check size={12}/> Active</span>{/if}
                <div class="relative z-[60]" data-instance-actions>
                   <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition hover:bg-surface-hover hover:text-fg" aria-label={'Actions for ' + instance.name} title="Instance actions" aria-expanded={openMenuId === instance.id} onclick={(event) => { event.stopPropagation(); openMenuId = openMenuId === instance.id ? null : instance.id; }}><EllipsisVertical size={17}/></button>
                   {#if openMenuId === instance.id}
                    <div class="absolute right-0 top-full z-[90] mt-1 w-44 rounded-xl border border-line bg-surface-raised p-1.5 shadow-pop" style="background-color: rgb(var(--c-surface-raised) / 1);">
                      <button type="button" disabled={checkingHealth === instance.id} class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-fg-subtle transition hover:bg-surface-hover hover:text-fg disabled:opacity-50" onclick={(event) => { event.stopPropagation(); void checkHealth(instance); }}><Activity size={15}/>{checkingHealth === instance.id ? 'Checking health…' : 'Check health'}</button>
                      <button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-fg-subtle transition hover:bg-surface-hover hover:text-fg" onclick={(event) => { event.stopPropagation(); openEdit(instance); }}><Pencil size={15}/> Edit instance</button>
                      <button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-danger transition hover:bg-danger/10" onclick={(event) => { event.stopPropagation(); void removeInstance(instance); }}><Trash2 size={15}/> Remove instance</button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
            <div class="pointer-events-none relative z-10 mt-5 min-w-0">
              <h2 class="truncate text-lg font-semibold">{instance.name}</h2>
              <p class="mt-1 truncate text-xs text-fg-faint">{instance.baseUrl}</p>
            </div>
            <div class="pointer-events-none relative z-10 mt-auto flex items-center justify-between pt-5">
              <span class="flex items-center gap-1.5 text-xs capitalize text-fg-subtle"><span class={['h-1.5 w-1.5 rounded-full', instance.status === 'online' ? 'bg-emerald-400' : instance.status === 'offline' ? 'bg-red-400' : 'bg-fg-faint']}></span>{instance.status}</span>
              <span class="flex items-center gap-1 text-xs font-medium text-accent opacity-80 transition group-hover:translate-x-0.5 group-hover:opacity-100">Open <ArrowRight size={14}/></span>
            </div>
          </div>
        {/each}
        <button type="button" class="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-transparent p-5 text-center transition hover:border-accent/50 hover:bg-surface-hover" onclick={openCreate}>
          <span class="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-hover"><Plus size={22} class="text-fg-subtle"/></span>
          <span class="mt-4 text-sm font-semibold">Add another server</span>
          <span class="mt-1 text-xs text-fg-faint">Connect an Toolsmith instance</span>
        </button>
      </div>
    {/if}

    <div class="mt-10 border-t border-line pt-5 text-xs text-fg-faint">
      <span>Instance selection · Toolsmith Console</span>
    </div>
  </main>
</div>

<ProfileModal open={settingsOpen} initialSection="profile" onclose={() => (settingsOpen = false)} />

<Modal open={Boolean(editing)} title="Edit Toolsmith instance" description="Update this server connection" width="max-w-lg" onclose={() => { if (!saving) editing = null; }}>
  <form id="picker-instance-edit" class="space-y-4 px-4 py-4" onsubmit={saveEdit}>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Display name</span><input required maxlength="80" bind:value={editName} class="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-fg outline-none focus:border-accent"/></label>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Base URL</span><input required type="url" bind:value={editUrl} class="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-fg outline-none focus:border-accent"/><span class="block text-xs text-fg-faint">Use HTTPS except for localhost development instances.</span></label>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Bearer token</span><div class="relative"><input type={editCredentialVisible ? 'text' : 'password'} autocomplete="new-password" bind:value={editCredential} placeholder="Leave blank to keep current token" class="h-10 w-full rounded-lg border border-line bg-canvas px-3 pr-10 text-fg outline-none focus:border-accent"/><button type="button" class="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-fg-subtle hover:text-fg" aria-label={editCredentialVisible ? 'Hide bearer token' : 'Show bearer token'} title={editCredentialVisible ? 'Hide token' : 'Show token'} onclick={() => (editCredentialVisible = !editCredentialVisible)}>{#if editCredentialVisible}<EyeOff size={16}/>{:else}<Eye size={16}/>{/if}</button></div><span class="block text-xs text-fg-faint">Leave blank to keep the current token.</span></label>
    {#if actionError}<div role="alert" class="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-500 dark:text-red-200"><CircleAlert size={16}/>{actionError}</div>{/if}
  </form>
  {#snippet footer()}
    <button type="button" class="h-9 rounded-lg px-3 text-sm text-fg-subtle hover:bg-surface-hover disabled:opacity-50" onclick={() => { if (!saving) editing = null; }} disabled={saving}>Cancel</button>
    <button type="submit" form="picker-instance-edit" disabled={saving || !editName.trim() || !editUrl.trim()} class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-canvas hover:bg-accent-hover disabled:opacity-50">{#if saving}<Skeleton class="size-4 rounded-full" />{:else}<Check size={15}/>{/if} Save changes</button>
  {/snippet}
</Modal>

<Modal open={creating} title="Add Toolsmith instance" description="Register a server in this control plane" width="max-w-lg" onclose={() => { if (!createSaving) creating = false; }} autofocus>
  <form id="picker-instance-create" class="space-y-4 px-4 py-4" onsubmit={saveCreate}>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Display name</span><input required maxlength="80" bind:value={createName} class="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-fg outline-none focus:border-accent" placeholder="My Toolsmith server"/></label>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Base URL</span><input required type="url" bind:value={createUrl} class="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-fg outline-none focus:border-accent"/><span class="block text-xs text-fg-faint">Use HTTPS except for localhost development instances.</span></label>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Bearer token</span><div class="relative"><input required type={createCredentialVisible ? 'text' : 'password'} autocomplete="new-password" bind:value={createCredential} placeholder="Paste TOOLSMITH_API_TOKEN from server setup" class="h-10 w-full rounded-lg border border-line bg-canvas px-3 pr-10 text-fg outline-none focus:border-accent"/><button type="button" class="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-fg-subtle hover:text-fg" aria-label={createCredentialVisible ? 'Hide bearer token' : 'Show bearer token'} title={createCredentialVisible ? 'Hide token' : 'Show token'} onclick={() => (createCredentialVisible = !createCredentialVisible)}>{#if createCredentialVisible}<EyeOff size={16}/>{:else}<Eye size={16}/>{/if}</button></div><span class="block text-xs text-fg-faint">Required. Use the token generated during Toolsmith setup.</span></label>
    {#if createError}<div role="alert" class="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-500 dark:text-red-200"><CircleAlert size={16}/>{createError}</div>{/if}
  </form>
  {#snippet footer()}
    <button type="button" class="h-9 rounded-lg px-3 text-sm text-fg-subtle hover:bg-surface-hover disabled:opacity-50" onclick={() => { if (!createSaving) creating = false; }} disabled={createSaving}>Cancel</button>
    <button type="submit" form="picker-instance-create" disabled={createSaving || !createName.trim() || !createUrl.trim() || !createCredential.trim()} class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-canvas hover:bg-accent-hover disabled:opacity-50">{#if createSaving}<Skeleton class="size-4 rounded-full" />Testing connection…{:else}<Plus size={15}/>Add server{/if}</button>
  {/snippet}
</Modal>
<ConfirmDialog open={Boolean(pendingDelete)} title="Remove instance?" description={pendingDelete ? 'Remove "' + pendingDelete.name + '" from this control plane? The remote server will not be changed.' : 'This instance will be removed from this control plane.'} confirmLabel="Remove instance" destructive onconfirm={confirmRemoveInstance} oncancel={() => (pendingDelete = null)} />
