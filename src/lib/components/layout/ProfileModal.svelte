<script lang="ts">
  import { Check, Code2, Keyboard, LockKeyhole, Moon, Network, Settings2, Sun, UserRound, KeyRound, Eye, EyeOff, Pencil } from '@lucide/svelte';
  import { Avatar, Button, Modal } from '$lib/components/ui';
  import { profile } from '$lib/stores/profile.svelte';
  import { authUser } from '$lib/stores/auth.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { accountApi, rootCommandsApi, type RootCommandConfig } from '$lib/api';
  import InstancesManager from './InstancesManager.svelte';

  interface Props { open: boolean; onclose: () => void; initialSection?: 'profile' | 'general' | 'editor' | 'instances' | 'sudo'; }
  let { open, onclose, initialSection = 'profile' }: Props = $props();
  type Section = 'profile' | 'general' | 'editor' | 'instances' | 'sudo';
  let section = $state<Section>('profile');
  let editNameOpen = $state(false);
  let displayNameDraft = $state('');
  let displayNameError = $state('');
  let saving = $state(false);
  let sudoConfig = $state<RootCommandConfig | null>(null);
  let sudoPassword = $state('');
  let sudoLoading = $state(false);
  let sudoSaving = $state(false);
  let sudoError = $state('');
  let sudoSaved = $state(false);
  let showSudoPassword = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmNewPassword = $state('');
  let passwordModalOpen = $state(false);
  let passwordStep = $state<'token' | 'password'>('token');
  let recoveryToken = $state('');
  let recoveryChallenge = $state('');
  let passwordSaving = $state(false);
  let showRecoveryToken = $state(false);
  let passwordError = $state('');
  let passwordSaved = $state(false);
  async function loadSudoConfig() {
    sudoLoading = true; sudoError = '';
    try { sudoConfig = await rootCommandsApi.get(); }
    catch (cause) { sudoError = cause instanceof Error ? cause.message : 'Gagal memuat konfigurasi sudo.'; }
    finally { sudoLoading = false; }
  }
  async function saveSudoPassword() {
    if (!sudoPassword || sudoSaving) return;
    sudoSaving = true; sudoError = ''; sudoSaved = false;
    try { sudoConfig = await rootCommandsApi.savePassword({ password: sudoPassword }); sudoPassword = ''; sudoSaved = true; }
    catch (cause) { sudoError = cause instanceof Error ? cause.message : 'Gagal menyimpan password sudo.'; }
    finally { sudoSaving = false; }
  }
  async function clearSudoPassword() {
    if (sudoSaving || !sudoConfig?.passwordConfigured) return;
    sudoSaving = true; sudoError = ''; sudoSaved = false;
    try { sudoConfig = await rootCommandsApi.savePassword({ clearPassword: true }); sudoPassword = ''; sudoSaved = true; }
    catch (cause) { sudoError = cause instanceof Error ? cause.message : 'Gagal menghapus password sudo.'; }
    finally { sudoSaving = false; }
  }
  async function verifyPasswordRecovery() {
    if (passwordSaving || !recoveryToken.trim()) return;
    passwordSaving = true; passwordError = '';
    try {
      const response = await fetch('/control/v1/auth/recovery/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ token: recoveryToken.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'Recovery token tidak valid.');
      recoveryChallenge = result.challenge; recoveryToken = ''; passwordStep = 'password';
      currentPassword = ''; newPassword = ''; confirmNewPassword = '';
    } catch (cause) { passwordError = cause instanceof Error ? cause.message : 'Recovery token tidak valid.'; }
    finally { passwordSaving = false; }
  }
  async function changePassword() {
    if (passwordSaving) return;
    passwordError = ''; passwordSaved = false;
    if (newPassword.length < 8) { passwordError = 'Password baru minimal 8 karakter.'; return; }
    if (newPassword !== confirmNewPassword) { passwordError = 'Konfirmasi password baru tidak cocok.'; return; }
    if (currentPassword === newPassword) { passwordError = 'Password baru harus berbeda dari password saat ini.'; return; }
    passwordSaving = true;
    try {
      await accountApi.changePasswordWithRecovery({ challenge: recoveryChallenge, currentPassword, newPassword });
      currentPassword = ''; newPassword = ''; confirmNewPassword = ''; recoveryChallenge = '';
      passwordModalOpen = false; passwordStep = 'token'; passwordSaved = true;
    } catch (cause) { passwordError = cause instanceof Error ? cause.message : 'Gagal mengubah password.'; }
    finally { passwordSaving = false; }
  }
  function openPasswordModal() {
    passwordError = ''; passwordSaved = false; recoveryToken = ''; recoveryChallenge = '';
    currentPassword = ''; newPassword = ''; confirmNewPassword = ''; passwordStep = 'token'; passwordModalOpen = true;
  }
  $effect(() => {
    if (!open) return;
    section = initialSection;
  });
  function openDisplayNameEditor() {
    displayNameDraft = profile.data?.displayName ?? 'User';
    displayNameError = '';
    editNameOpen = true;
  }
  async function saveDisplayName() {
    const displayName = displayNameDraft.trim();
    if (!displayName) {
      displayNameError = 'Display name tidak boleh kosong.';
      return;
    }
    if (saving) return;
    saving = true;
    displayNameError = '';
    const message = await profile.save({ displayName });
    saving = false;
    if (message) displayNameError = message;
    else editNameOpen = false;
  }
  const sections = [
    { id: 'profile' as const, label: 'Profile', icon: UserRound },
    { id: 'general' as const, label: 'Umum', icon: Settings2 },
    { id: 'editor' as const, label: 'Editor', icon: Code2 },
    { id: 'instances' as const, label: 'Instances', icon: Network },
    { id: 'sudo' as const, label: 'Sudo', icon: KeyRound },
  ];
  $effect(() => { if (open && section === 'sudo') void loadSudoConfig(); });
  const shortcuts = [
    { action: 'Save file', keys: ['Ctrl / ⌘', 'S'] },
    { action: 'Save all files', keys: ['Ctrl / ⌘', 'Shift', 'S'] },
    { action: 'Close active tab', keys: ['Ctrl / ⌘', 'W'] },
    { action: 'Next / previous tab', keys: ['Ctrl / ⌘', 'Tab / Shift+Tab'] },
    { action: 'Search files / commands', keys: ['Ctrl / ⌘', 'P'] },
    { action: 'Rename selected item', keys: ['F2'] },
    { action: 'Delete selected item', keys: ['Delete'] },
    { action: 'Close dialog / picker', keys: ['Esc'] },
  ];
</script>

<Modal {open} title="Settings" width="max-w-3xl" height="h-[min(70vh,600px)]" {onclose}>
  <div class="flex h-full min-h-0 flex-col sm:flex-row">
    <aside class="w-full shrink-0 border-b border-line sm:w-44 sm:border-b-0 sm:border-r">
      <nav class="flex gap-1 overflow-x-auto p-2 sm:flex-col sm:p-2.5" aria-label="Settings sections">
        {#each sections as item (item.id)}
          <button type="button" class={['flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors sm:flex-none', section === item.id ? 'bg-surface-active text-fg font-medium' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg']} aria-current={section === item.id ? 'page' : undefined} onclick={() => (section = item.id)}>
            <item.icon size={15} class="shrink-0" />{item.label}
          </button>
        {/each}
      </nav>
    </aside>

    <section class="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      {#if section === 'profile'}
        <div class="mb-5"><h4 class="text-sm font-semibold">Profile</h4><p class="mt-1 text-xs text-fg-subtle">Informasi profil akun yang sedang login.</p></div>
        <div class="flex items-center gap-3 py-2">
          <Avatar name={profile.data?.displayName ?? 'User'} color={profile.data?.avatarColor} size="lg" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-fg">{profile.data?.displayName ?? 'User'}</p>
            <p class="mt-0.5 truncate text-xs text-fg-subtle">@{authUser.username ?? 'User'}</p>
          </div>
          <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg" aria-label="Edit display name" title="Edit display name" onclick={openDisplayNameEditor}><Pencil size={15}/></button>
        </div>
        <div class="mt-5 border-t border-line pt-4">
          <div class="flex items-center gap-3"><LockKeyhole size={17} class="text-fg-subtle"/><div class="min-w-0 flex-1"><p class="text-sm font-medium">Password</p><p class="mt-0.5 text-xs text-fg-subtle">Verifikasi recovery token sebelum mengganti password.</p></div><Button size="sm" variant="secondary" onclick={openPasswordModal}>Change</Button></div>
          {#if passwordSaved}<p class="mt-3 text-sm text-success" role="status">Password berhasil diubah.</p>{/if}
        </div>
      {:else if section === 'general'}
        <div class="mb-5"><h4 class="text-sm font-semibold">Umum</h4><p class="mt-1 text-xs text-fg-subtle">Pengaturan umum aplikasi.</p></div>
        <div class="border-t border-line pt-4">
          <div class="flex items-center gap-3">
            <Sun size={17} class="shrink-0 text-fg-subtle"/>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">Tema aplikasi</p>
              <p class="mt-0.5 text-xs text-fg-subtle">Pilih tampilan terang atau gelap untuk Toolsmith Console.</p>
            </div>
            <div class="flex shrink-0 gap-1 rounded-lg border border-line p-1">
              <button type="button" aria-pressed={theme.current === 'light'} class={['inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors', theme.current === 'light' ? 'bg-surface-hover text-fg font-medium' : 'text-fg-subtle hover:text-fg']} onclick={(event) => theme.set('light', event.currentTarget)}><Sun size={13}/> Light {#if theme.current === 'light'}<Check size={12}/>{/if}</button>
              <button type="button" aria-pressed={theme.current === 'dark'} class={['inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors', theme.current === 'dark' ? 'bg-surface-hover text-fg font-medium' : 'text-fg-subtle hover:text-fg']} onclick={(event) => theme.set('dark', event.currentTarget)}><Moon size={13}/> Dark {#if theme.current === 'dark'}<Check size={12}/>{/if}</button>
            </div>
          </div>
        </div>
      {:else if section === 'editor'}
        <div class="mb-5"><h4 class="text-sm font-semibold">Editor</h4><p class="mt-1 text-xs text-fg-subtle">Pintasan keyboard editor.</p></div>
        <div>
          <div class="mb-2 flex items-center gap-2"><Keyboard size={15} class="text-fg-subtle"/><h5 class="text-xs font-medium">Keyboard shortcuts</h5></div>
          <div class="divide-y divide-line border-y border-line">
            {#each shortcuts as shortcut (shortcut.action)}
              <div class="flex items-center justify-between gap-3 py-2.5"><span class="text-sm text-fg-subtle">{shortcut.action}</span><span class="flex flex-wrap justify-end gap-1">{#each shortcut.keys as key, i (`${shortcut.action}-${key}-${i}`)}<kbd class="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{key}</kbd>{/each}</span></div>
            {/each}
          </div>
          <p class="mt-2 text-xs text-fg-faint">Some shortcuts work only when the editor or a file item has focus.</p>
        </div>
      {:else if section === 'sudo'}
        <div class="mb-5"><h4 class="text-sm font-semibold">Sudo & akses root</h4><p class="mt-1 text-xs text-fg-subtle">Password disimpan terenkripsi oleh instance Toolsmith yang sedang dipilih. Password tidak pernah ditampilkan kembali.</p></div>
        <div class="space-y-4 border-t border-line pt-4">
          <div class="flex items-start gap-3"><LockKeyhole size={17} class="mt-0.5 shrink-0 text-fg-subtle"/><div class="min-w-0 flex-1"><p class="text-sm font-medium">Password sudo instance</p><p class="mt-1 text-xs leading-5 text-fg-subtle">Konfigurasi ini khusus untuk <strong>{'instance yang sedang aktif'}</strong>. Ganti instance untuk mengelola password server lain.</p></div></div>
          {#if sudoLoading}<p class="text-sm text-fg-subtle">Memuat status sudo…</p>{:else if sudoConfig}
            <div class="rounded-lg border border-line bg-surface px-3 py-3"><div class="flex items-center justify-between gap-3"><span class="text-sm text-fg-muted">Password tersimpan</span><span class={['rounded-md border px-2 py-1 text-xs', sudoConfig.passwordConfigured ? 'border-success/30 bg-success/10 text-success' : 'border-line text-fg-subtle']}>{sudoConfig.passwordConfigured ? 'Terkonfigurasi' : 'Belum diatur'}</span></div><div class="mt-2 flex items-center justify-between gap-3"><span class="text-sm text-fg-muted">Kunci enkripsi backend</span><span class={['rounded-md border px-2 py-1 text-xs', sudoConfig.encryptionConfigured ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning']}>{sudoConfig.encryptionConfigured ? 'Siap' : 'Belum dikonfigurasi'}</span></div></div>
            {#if !sudoConfig.encryptionConfigured}<p class="text-sm text-warning">Atur <code>TOOLSMITH_SUDO_ENCRYPTION_KEY</code> (minimal 32 karakter) di environment instance Toolsmith dan restart servicenya sebelum menyimpan password.</p>{/if}
          {/if}
          <label class="block space-y-1.5 text-sm text-fg"><span class="font-medium">{sudoConfig?.passwordConfigured ? 'Password sudo baru' : 'Password sudo'}</span><div class="relative"><input type={showSudoPassword ? 'text' : 'password'} bind:value={sudoPassword} autocomplete="new-password" placeholder="Masukkan password sudo" class="w-full rounded-md border border-line bg-surface px-3 py-2 pr-10 text-sm text-fg outline-none focus:border-accent" onkeydown={(event) => event.key === 'Enter' && void saveSudoPassword()} /><button type="button" class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-subtle hover:text-fg" aria-label={showSudoPassword ? 'Sembunyikan password' : 'Tampilkan password'} onclick={() => showSudoPassword = !showSudoPassword}>{#if showSudoPassword}<EyeOff size={15}/>{:else}<Eye size={15}/>{/if}</button></div></label>
          {#if sudoError}<p class="text-sm text-danger" role="alert">{sudoError}</p>{/if}{#if sudoSaved}<p class="text-sm text-success" role="status">Konfigurasi password sudo berhasil diperbarui.</p>{/if}
          <div class="flex flex-wrap gap-2"><Button size="sm" variant="primary" disabled={!sudoPassword || sudoSaving || sudoLoading || !sudoConfig?.encryptionConfigured} onclick={() => void saveSudoPassword()}>{sudoSaving ? 'Menyimpan…' : 'Simpan password'}</Button>{#if sudoConfig?.passwordConfigured}<Button size="sm" variant="secondary" disabled={sudoSaving} onclick={() => void clearSudoPassword()}>Hapus password</Button>{/if}<Button size="sm" variant="secondary" disabled={sudoLoading || sudoSaving} onclick={() => void loadSudoConfig()}>Muat ulang</Button></div>
        </div>
      {:else}
        <InstancesManager onenter={onclose} />
      {/if}
    </section>
  </div>
</Modal>
<Modal open={editNameOpen} title="Edit display name" description="Profile" width="max-w-md" onclose={() => (editNameOpen = false)} autofocus>
  <form class="space-y-4 p-4" onsubmit={(event) => { event.preventDefault(); void saveDisplayName(); }}>
    <label class="block space-y-1.5 text-sm text-fg">
      <span class="font-medium">Display name</span>
      <input bind:value={displayNameDraft} maxlength="80" required autocomplete="nickname" placeholder="Masukkan display name" class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
    </label>
    {#if displayNameError}<p class="text-sm text-danger" role="alert">{displayNameError}</p>{/if}
    <div class="flex justify-end gap-2">
      <Button size="sm" variant="secondary" disabled={saving} onclick={() => (editNameOpen = false)}>Batal</Button>
      <Button size="sm" variant="primary" disabled={saving || !displayNameDraft.trim()} onclick={() => void saveDisplayName()}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
    </div>
  </form>
</Modal>
<Modal open={passwordModalOpen} title="Change password" description={passwordStep === 'token' ? 'Verifikasi recovery token untuk melanjutkan.' : 'Token valid. Masukkan password lama dan password baru.'} width="max-w-md" onclose={() => { if (!passwordSaving) passwordModalOpen = false; }} autofocus>
  <form class="space-y-4 p-4" onsubmit={(event) => { event.preventDefault(); if (passwordStep === 'token') void verifyPasswordRecovery(); else void changePassword(); }}>
    {#if passwordStep === 'token'}
      <label class="block space-y-1.5 text-sm"><span class="font-medium">Recovery token</span><div class="relative"><input type={showRecoveryToken ? 'text' : 'password'} bind:value={recoveryToken} required minlength="32" maxlength="4096" autocomplete="off" placeholder="Masukkan recovery token" class="w-full rounded-md border border-line bg-surface px-3 py-2 pr-10 text-sm text-fg outline-none focus:border-accent"/><button type="button" class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-subtle hover:text-fg" aria-label={showRecoveryToken ? 'Sembunyikan token' : 'Tampilkan token'} onclick={() => showRecoveryToken = !showRecoveryToken}>{#if showRecoveryToken}<EyeOff size={16}/>{:else}<Eye size={16}/>{/if}</button></div></label>
    {:else}
      <label class="block space-y-1.5 text-sm"><span class="font-medium">Password lama</span><input type="password" bind:value={currentPassword} required autocomplete="current-password" class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent" /></label>
      <label class="block space-y-1.5 text-sm"><span class="font-medium">Password baru</span><input type="password" bind:value={newPassword} required minlength="8" maxlength="1024" autocomplete="new-password" class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent" /></label>
      <label class="block space-y-1.5 text-sm"><span class="font-medium">Konfirmasi password baru</span><input type="password" bind:value={confirmNewPassword} required minlength="8" maxlength="1024" autocomplete="new-password" class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent" /></label>
    {/if}
    {#if passwordError}<p class="text-sm text-danger" role="alert">{passwordError}</p>{/if}
    <div class="flex justify-end gap-2"><Button size="sm" variant="secondary" disabled={passwordSaving} onclick={() => passwordModalOpen = false}>Batal</Button><Button type="submit" size="sm" variant="primary" disabled={passwordSaving || (passwordStep === 'token' ? !recoveryToken.trim() : !currentPassword || !newPassword || !confirmNewPassword)}>{passwordSaving ? 'Memproses…' : passwordStep === 'token' ? 'Verifikasi token' : 'Ubah password'}</Button></div>
  </form>
</Modal>
