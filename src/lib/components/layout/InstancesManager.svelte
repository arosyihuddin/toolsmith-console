<script lang="ts">
  import { Activity, Check, CircleAlert, EllipsisVertical, Eye, EyeOff, Pencil, Plus, Server, Trash2, X, ArrowLeftRight } from "@lucide/svelte";
  import { ConfirmDialog, Menu, MenuItem, Modal, Skeleton } from "$lib/components/ui";
  import { instancesApi, type Instance, type InstanceStatus } from "$lib/api/instances";
  import { instanceRegistry } from "$lib/stores/instances.svelte";
  import { toast } from "$lib/stores/toast.svelte";

  interface Props { onenter: () => void; }
  let { onenter }: Props = $props();
  const instances = $derived(instanceRegistry.items);
  let loading = $state(true), saving = $state(false), showForm = $state(false);
  let editing = $state<Instance | null>(null);
  let error = $state("");
  let name = $state(""), baseUrl = $state("http://127.0.0.1:48766"), credential = $state("");
  let credentialVisible = $state(false);
  let checking = $state<string | null>(null), deleting = $state<string | null>(null);
  let pendingDelete = $state<Instance | null>(null);

  $effect(() => { void load(); });
  async function load() {
    loading = true; error = "";
    try {
      await instanceRegistry.load();
      await instanceRegistry.checkAllHealth();
    } catch (e) { error = e instanceof Error ? e.message : "Unable to load instances"; }
    finally { loading = false; }
  }
  function openCreate() {
    editing = null; name = ""; baseUrl = "http://127.0.0.1:48766"; credential = "";
    error = ""; showForm = true;
  }
  function openEdit(instance: Instance) {
    editing = instance; name = instance.name; baseUrl = instance.baseUrl; credential = "";
    error = ""; showForm = true;
  }
  function closeForm() {
    if (saving) return;
    showForm = false; editing = null; error = "";
  }
  async function saveInstance() {
    if (saving || !name.trim() || !baseUrl.trim() || (!editing && !credential.trim())) return;
    const wasEditing = Boolean(editing);
    const instanceName = name.trim();
    const hadActiveInstance = Boolean(instanceRegistry.activeId);
    saving = true; error = "";
    try {
      if (editing) {
        await instancesApi.update(editing.id, {
          name: instanceName,
          baseUrl: baseUrl.trim(),
          ...(credential.trim() ? { credential: credential.trim() } : {}),
        });
      } else {
        await instancesApi.create({ name: instanceName, baseUrl: baseUrl.trim(), credential: credential.trim() });
      }
      showForm = false; editing = null;
      name = ""; baseUrl = "http://127.0.0.1:48766"; credential = "";
      await load();
      toast.success(wasEditing ? "Instance updated" : "Instance registered", wasEditing ? instanceName : instanceName + " connected successfully.");
      if (!hadActiveInstance && instanceRegistry.active) onenter();
    } catch (e) {
      error = e instanceof Error ? e.message : (wasEditing ? "Unable to update instance" : "Connection test failed. Instance was not added.");
      toast.error(wasEditing ? "Instance save failed" : "Connection test failed", error);
    } finally { saving = false; }
  }
  async function check(instance: Instance) {
    checking = instance.id; error = "";
    try {
      const result = await instanceRegistry.checkHealth(instance.id);
      if (result.status === "online") toast.success(instance.name + " is online", result.latencyMs + " ms");
      else toast.info(instance.name + " is offline", result.error ?? "Health check failed");
    } catch (e) {
      error = e instanceof Error ? e.message : "Health check failed";
      toast.error("Health check failed", error);
    } finally { checking = null; }
  }
  function remove(instance: Instance) {
    pendingDelete = instance;
  }
  async function confirmRemove() {
    const instance = pendingDelete;
    if (!instance) return;
    pendingDelete = null;
    deleting = instance.id; error = "";
    try {
      await instancesApi.remove(instance.id);
      await load();
      toast.success("Instance removed", instance.name + " was removed from this control plane.");
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to remove instance";
      toast.error("Could not remove instance", error);
    } finally { deleting = null; }
  }
  function statusClass(status: InstanceStatus) {
    if (status === "online") return "bg-emerald-500";
    if (status === "offline") return "bg-red-500";
    if (status === "degraded") return "bg-amber-500";
    return "bg-fg-faint";
  }
  function enter(instance: Instance) {
    instanceRegistry.setActive(instance.id);
    onenter();
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between gap-3">
    <div><h4 class="text-sm font-semibold">Instances</h4><p class="mt-1 text-xs text-fg-subtle">Pilih server aktif atau kelola daftar server.</p></div>
    <button type="button" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90" onclick={openCreate}><Plus size={13}/> Add</button>
  </div>

  {#if error && !showForm}<div role="alert" class="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-500"><CircleAlert size={14} class="mt-0.5 shrink-0"/><span class="min-w-0 flex-1">{error}</span><button aria-label="Dismiss error" onclick={() => (error = "")}><X size={13}/></button></div>{/if}

  <div class="divide-y divide-line rounded-lg border border-line">
    {#if loading && instances.length === 0}
      <div class="space-y-2 p-3">{#each [1,2,3] as n (n)}<div class="h-12 animate-pulse rounded-md bg-surface-hover"></div>{/each}</div>
    {:else if instances.length === 0}
      <div class="px-4 py-8 text-center"><Server size={21} class="mx-auto mb-2 text-fg-faint"/><p class="text-sm font-medium">Belum ada instance</p><p class="mt-1 text-xs text-fg-subtle">Tambahkan server Toolsmith untuk mulai.</p><button type="button" class="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs hover:bg-surface-hover" onclick={openCreate}><Plus size={13}/> Add instance</button></div>
    {:else}
      {#each instances as instance (instance.id)}
        <article class="flex items-center gap-2.5 p-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-hover"><Server size={15} class="text-fg-subtle"/></span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5"><p class="truncate text-sm font-medium">{instance.name}</p><span class="inline-flex items-center gap-1 text-[11px] capitalize text-fg-subtle"><span class={["h-1.5 w-1.5 rounded-full", statusClass(instance.status)]}></span>{instance.status}</span></div>
            <p class="mt-0.5 truncate text-xs text-fg-faint">{instance.baseUrl}</p>
            <p class="mt-0.5 text-[11px] text-fg-faint">{instance.lastSeenAt ? "Last checked " + new Date(instance.lastSeenAt).toLocaleString() : "Not checked yet"}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            {#if instanceRegistry.activeId === instance.id}
              <span class="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface-hover px-2 text-xs font-medium text-accent"><Check size={12}/> Active</span>
            {/if}
            <Menu align="right" placement="bottom" width="w-44">
              {#snippet trigger({ toggle, open })}
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md border border-line text-fg-subtle hover:bg-surface-hover" onclick={toggle} aria-label={"Actions for " + instance.name} title="Instance actions" aria-expanded={open}><EllipsisVertical size={16}/></button>
              {/snippet}
              {#snippet children({ close })}
                {#if instanceRegistry.activeId !== instance.id}
                  <MenuItem onclick={() => { close(); enter(instance); }}><ArrowLeftRight size={14}/> Use instance</MenuItem>
                {/if}
                <MenuItem onclick={() => { close(); openEdit(instance); }}><Pencil size={14}/> Edit instance</MenuItem>
                <MenuItem onclick={() => { close(); void check(instance); }} disabled={checking === instance.id}><Activity size={14}/>{checking === instance.id ? "Checking health…" : "Check health"}</MenuItem>
                <MenuItem tone="danger" onclick={() => { close(); void remove(instance); }} disabled={deleting === instance.id}><Trash2 size={14}/>{deleting === instance.id ? "Removing…" : "Remove instance"}</MenuItem>
              {/snippet}
            </Menu>
          </div>
        </article>
      {/each}
    {/if}
  </div>
  <p class="text-[11px] leading-relaxed text-fg-faint">Health checks menguji endpoint runtime. Token disimpan di server dan tidak ditampilkan kembali.</p>
</div>

<Modal open={showForm} title={editing ? "Edit Toolsmith instance" : "Add Toolsmith instance"} description={editing ? "Update this server connection" : "Register a server in this control plane"} width="max-w-lg" onclose={closeForm} autofocus>
  <form id="settings-instance-form" class="space-y-4 px-4 py-4" onsubmit={(event) => { event.preventDefault(); void saveInstance(); }}>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Display name</span><input required maxlength="80" bind:value={name} placeholder="Production server" class="h-10 w-full rounded-lg border border-line bg-canvas px-3 outline-none focus:border-accent"/></label>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Base URL</span><input required type="url" bind:value={baseUrl} placeholder="https://toolsmith.example.com" class="h-10 w-full rounded-lg border border-line bg-canvas px-3 outline-none focus:border-accent"/><span class="block text-xs text-fg-faint">Use HTTPS except for localhost development instances.</span></label>
    <label class="block space-y-1.5 text-sm"><span class="text-fg-subtle">Bearer token{editing ? "" : ""}</span><div class="relative"><input type={credentialVisible ? "text" : "password"} autocomplete="new-password" required={!editing} bind:value={credential} placeholder={editing ? "Leave blank to keep current token" : "Paste TOOLSMITH_API_TOKEN from server setup"} class="h-10 w-full rounded-lg border border-line bg-canvas px-3 pr-10 outline-none focus:border-accent"/><button type="button" class="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-fg-subtle hover:text-fg" aria-label={credentialVisible ? "Hide bearer token" : "Show bearer token"} title={credentialVisible ? "Hide token" : "Show token"} onclick={() => (credentialVisible = !credentialVisible)}>{#if credentialVisible}<EyeOff size={16}/>{:else}<Eye size={16}/>{/if}</button></div><span class="block text-xs text-fg-faint">{editing ? "Leave blank to keep the current token." : "Required. Use the token generated during Toolsmith setup."}</span></label>
    {#if error}<div role="alert" class="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500"><CircleAlert size={16} class="mt-0.5 shrink-0"/><span>{error}</span></div>{/if}
  </form>
  {#snippet footer()}
    <button type="button" class="h-9 rounded-lg px-3 text-sm hover:bg-surface-hover disabled:opacity-50" onclick={closeForm} disabled={saving}>Cancel</button>
    <button type="submit" form="settings-instance-form" disabled={saving || !name.trim() || !baseUrl.trim() || (!editing && !credential.trim())} class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-50">{#if saving}<Skeleton class="size-4 rounded-full" />{saving && !editing ? "Testing connection…" : "Saving changes…"}{:else if editing}<Check size={15}/>Save changes{:else}<Plus size={15}/>Add server{/if}</button>
  {/snippet}
</Modal>
<ConfirmDialog open={Boolean(pendingDelete)} title="Remove instance?" description={pendingDelete ? 'Remove "' + pendingDelete.name + '" from this control plane? The remote server will not be changed.' : 'This instance will be removed from this control plane.'} confirmLabel="Remove instance" destructive onconfirm={confirmRemove} oncancel={() => (pendingDelete = null)} />
