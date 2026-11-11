<script lang="ts">
  import { ArrowLeftRight, LogOut, Server, Settings } from '@lucide/svelte';
  import { Avatar, Menu, MenuItem } from '$lib/components/ui';
  import { profile } from '$lib/stores/profile.svelte';
  import { authUser } from '$lib/stores/auth.svelte';
  import { instanceRegistry } from '$lib/stores/instances.svelte';
  import ProfileModal from './ProfileModal.svelte';

  interface Props {
    collapsed?: boolean;
    placement?: 'top' | 'bottom';
    compact?: boolean;
  }

  let { collapsed = false, placement = 'top', compact = false }: Props = $props();

  let settingsOpen = $state(false);
  let settingsSection = $state<'profile' | 'general' | 'editor' | 'instances' | 'sudo'>('profile');

  const name = $derived(profile.data?.displayName ?? 'User');
  const username = $derived(authUser.username ?? 'User');
  const instanceName = $derived(instanceRegistry.active?.name ?? 'No instance selected');
  const instanceStatus = $derived(instanceRegistry.active?.status ?? 'unknown');
  const isChecking = $derived(instanceRegistry.checkingIds.includes(instanceRegistry.activeId ?? ''));
  const status = $derived(isChecking ? 'Checking…' : instanceStatus === 'online' ? 'Online' : instanceStatus === 'offline' ? 'Offline' : instanceStatus === 'degraded' ? 'Degraded' : 'Unknown');
</script>

<Menu align="right" {placement} width="w-56">
  {#snippet trigger({ toggle, open })}
    <button
      type="button"
      title={status}
      aria-label="Profile menu: {name}, {instanceName}, {status}"
      aria-expanded={open}
      class={[
        'flex items-center gap-2.5 rounded-md text-left transition-colors hover:bg-surface-hover hover:text-fg',
        compact ? 'h-8 w-8 justify-center p-0' : 'w-full px-2.5 py-2',
        !compact && open && 'bg-surface-hover',
        collapsed && 'md:justify-center md:px-0',
      ]}
      onclick={toggle}
    >
      <span class="relative shrink-0">
        <Avatar {name} color={profile.data?.avatarColor} class="ring-2 ring-accent/70 ring-offset-1 ring-offset-surface" />
      </span>
      {#if !compact}
        <span class={['min-w-0', collapsed && 'md:hidden']}>
          <span class="block truncate text-sm font-medium text-fg-muted">{name}</span>
          <span class="block truncate text-xs text-fg-faint">{instanceName} · {status}</span>
        </span>
      {/if}
    </button>
  {/snippet}
  {#snippet children({ close })}
    <div class="mb-1 border-b border-line px-3 pb-3 pt-2" role="presentation">
      <div class="flex min-w-0 items-center gap-2.5">
        <Avatar {name} color={profile.data?.avatarColor} class="ring-2 ring-accent/70 ring-offset-1 ring-offset-surface" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-fg">{name}</div>
          <div class="truncate text-xs text-fg-subtle">@{username}</div>
        </div>
      </div>
      <button type="button" class="mt-3 flex w-full items-center gap-2.5 rounded-md border border-line px-2.5 py-2 text-left text-sm text-fg-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg" title="Switch instance" onclick={() => { close(); window.dispatchEvent(new CustomEvent('toolsmith-console:show-instance-picker')); }}>
        <Server size={14} class={['shrink-0', isChecking ? 'text-fg-faint' : instanceStatus === 'online' ? 'text-success' : instanceStatus === 'offline' ? 'text-danger' : instanceStatus === 'degraded' ? 'text-warning' : 'text-fg-faint']} />
        <span class="min-w-0 flex-1 truncate">{instanceName}</span>
        <ArrowLeftRight size={14} class="shrink-0 text-fg-subtle" />
      </button>
    </div>
    <MenuItem onclick={() => { close(); settingsOpen = true; }}><Settings size={13} /> Settings</MenuItem>
    <MenuItem tone="danger" onclick={() => { close(); window.dispatchEvent(new CustomEvent('toolsmith-console:logout')); }}><LogOut size={13} /> Logout</MenuItem>
  {/snippet}
</Menu>

<ProfileModal open={settingsOpen} initialSection={settingsSection} onclose={() => (settingsOpen = false)} />
