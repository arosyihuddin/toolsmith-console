<script lang="ts">
  import { ChevronDown, PlugZap } from '@lucide/svelte';
  import {
    Button,
    Input,
    Modal,
    OptionDropdown,
    SegmentedControl,
    Switch,
  } from '$lib/components/ui';
  import { upstreamApi } from '$lib/api';
  import { upstream } from '$lib/stores/upstream.svelte';
  import type {
    UpstreamAuthType,
    UpstreamServer,
    UpstreamServerInput,
    UpstreamTestResult,
    UpstreamTransport,
  } from '$lib/types';

  interface Props {
    open: boolean;
    server?: UpstreamServer | null;
    saving?: boolean;
    oncancel: () => void;
    onsave: (payload: UpstreamServerInput | Partial<UpstreamServerInput>) => Promise<boolean>;
  }

  let { open, server = null, saving = false, oncancel, onsave }: Props = $props();

  const transportOptions = [
    { value: 'stdio' as UpstreamTransport, label: 'stdio' },
    { value: 'streamable-http' as UpstreamTransport, label: 'Streamable HTTP' },
  ];
  const authOptions = [
    { value: 'none' as UpstreamAuthType, label: 'Tanpa auth' },
    { value: 'bearer' as UpstreamAuthType, label: 'Bearer token' },
    { value: 'api-key' as UpstreamAuthType, label: 'API key' },
  ];

  let name = $state('');
  let showAdvanced = $state(false);
  let transport = $state<UpstreamTransport>('stdio');
  let enabled = $state(true);
  let timeoutMs = $state(30000);
  let command = $state('');
  let argsText = $state('');
  let envText = $state('');
  let cwd = $state('');
  let url = $state('');
  let authType = $state<UpstreamAuthType>('none');
  let authSecret = $state('');
  let clearSecret = $state(false);
  let headersText = $state('');

  let formError = $state('');
  let testing = $state(false);
  let testError = $state('');
  let testResult = $state<UpstreamTestResult | null>(null);
  let testedSignature = $state('');

  const editing = $derived(server !== null);

  /** Sama dengan slugifyId() di backend toolsmith-mcp. */
  function slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
      .replace(/-+$/, '');
    return slug || 'server';
  }

  /** ID yang akan dibuat backend dari nama (tambah baru). */
  const autoId = $derived(slugify(name));
  const inputClass =
    'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-accent';
  const areaClass =
    'w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg outline-none focus:border-accent';

  /** Tanda tangan isi form; test dianggap berlaku hanya selama form tidak berubah. */
  const signature = $derived(
    JSON.stringify({
      name, transport, enabled, timeoutMs, command, argsText, envText, cwd,
      url, authType, authSecret, clearSecret, headersText,
    }),
  );
  const tested = $derived(testResult !== null && testedSignature === signature);

  function reset() {
    const s = server;
    showAdvanced = false;
    name = s?.name ?? '';
    transport = s?.transport ?? 'stdio';
    enabled = s?.enabled ?? true;
    timeoutMs = s?.timeoutMs ?? 30000;
    command = s?.command ?? '';
    argsText = s?.args.join('\n') ?? '';
    // Secret tidak pernah dikembalikan API: env/header/authSecret selalu
    // mulai kosong saat edit; kosong berarti nilai tersimpan dipertahankan.
    envText = '';
    cwd = s?.cwd ?? '';
    url = s?.url ?? '';
    authType = s?.authType ?? 'none';
    authSecret = '';
    clearSecret = false;
    headersText = '';
    formError = '';
    testing = false;
    testError = '';
    testResult = null;
    testedSignature = '';
  }

  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) reset();
    wasOpen = open;
  });

  function lines(text: string): string[] {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function parseKeyValue(text: string, separator: '=' | ':'): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of lines(text)) {
      const at = line.indexOf(separator);
      if (at <= 0) continue;
      out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    return out;
  }

  /** Konfigurasi lengkap dari form (untuk test connection & tambah server). */
  function buildInput(): UpstreamServerInput {
    const base: UpstreamServerInput = {
      name: name.trim(),
      transport,
      timeoutMs,
      enabled,
    };
    // Edit: id dikirim apa adanya (tidak bisa diubah). Tambah baru: id
    // tidak dikirim — backend membuatnya otomatis dari nama.
    if (editing) base.id = server?.id ?? '';
    if (transport === 'stdio') {
      base.command = command.trim();
      base.args = lines(argsText);
      base.env = parseKeyValue(envText, '=');
      if (cwd.trim()) base.cwd = cwd.trim();
    } else {
      base.url = url.trim();
      base.authType = authType;
      base.headers = parseKeyValue(headersText, ':');
      if (authSecret) base.authSecret = authSecret;
    }
    return base;
  }

  /** Patch untuk edit: field yang tidak dikembalikan API (env/header/secret)
   *  hanya dikirim bila diisi, supaya nilai tersimpan tidak tertimpa kosong. */
  function buildPatch(): Partial<UpstreamServerInput> {
    const input = buildInput();
    const patch: Partial<UpstreamServerInput> = { ...input };
    if (!envText.trim()) delete patch.env;
    if (transport === 'streamable-http') {
      if (!headersText.trim()) delete patch.headers;
      if (clearSecret) patch.authSecret = null;
      else if (!authSecret) delete patch.authSecret;
    }
    return patch;
  }

  function validate(): string {
    if (!name.trim()) return 'Nama server harus diisi.';
    if (!(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 120000))
      return 'Timeout harus bilangan bulat 1000–120000 ms.';
    if (transport === 'stdio' && !command.trim()) return 'Command harus diisi.';
    if (transport === 'streamable-http' && !/^https?:\/\//.test(url.trim()))
      return 'URL harus diawali http:// atau https://.';
    return '';
  }

  async function runTest() {
    const invalid = validate();
    if (invalid) {
      formError = invalid;
      return;
    }
    formError = '';
    testError = '';
    testResult = null;
    testing = true;
    try {
      testResult = await upstreamApi.test(buildInput());
      testedSignature = signature;
    } catch (error) {
      testError = error instanceof Error ? error.message : 'Test connection gagal.';
    } finally {
      testing = false;
    }
  }

  async function save() {
    const invalid = validate();
    if (invalid) {
      formError = invalid;
      return;
    }
    formError = '';
    const ok = await onsave(editing ? buildPatch() : buildInput());
    if (!ok) formError = upstream.error || 'Gagal menyimpan server.';
  }
</script>

<Modal
  {open}
  title={editing ? `Ubah server: ${server?.id ?? ''}` : 'Tambah server upstream'}
  description="Server MCP eksternal yang tool-nya diteruskan lewat Toolsmith"
  onclose={oncancel}
  width="max-w-3xl"
>
  <div class="space-y-4 p-4 sm:p-5">
    <label class="block min-w-0 space-y-1.5 text-sm text-fg">
      <span class="font-medium">Nama</span>
      <Input bind:value={name} disabled={saving} placeholder="Nama server" spellcheck={false} />
      <span class="block text-xs leading-5 text-fg-subtle">
        {#if editing}
          ID: <span class="font-mono">{server?.id ?? ''}</span> — tidak bisa diubah, dipakai sebagai prefix tool.
        {:else}
          ID otomatis: <span class="font-mono">{autoId}</span> — dipakai sebagai prefix tool (misal {autoId}__create_node).
        {/if}
      </span>
    </label>

    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-1.5">
        <span class="block text-sm font-medium text-fg">Transport</span>
        <SegmentedControl
          label="Transport server"
          options={transportOptions}
          bind:value={transport}
        />
      </div>
      <Button variant="secondary" size="sm" disabled={saving} onclick={() => (showAdvanced = !showAdvanced)}>
        <ChevronDown size={14} class={['shrink-0 transition-transform', showAdvanced && 'rotate-180']} />
        {showAdvanced ? 'Sembunyikan pengaturan lanjutan' : 'Pengaturan lanjutan'}
      </Button>
    </div>

    {#if transport === 'stdio'}
      <label class="block min-w-0 space-y-1.5 text-sm text-fg">
        <span class="font-medium">Command</span>
        <Input
          bind:value={command}
          disabled={saving}
          placeholder="bun"
          spellcheck={false}
        />
        <span class="block text-xs leading-5 text-fg-subtle">Nama perintah (misal bun) atau path absolut executable, tanpa shell.</span>
      </label>
      {#if showAdvanced}
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block min-w-0 space-y-1.5 text-sm text-fg">
          <span class="font-medium">Argumen (satu per baris)</span>
          <textarea bind:value={argsText} rows={3} placeholder={'cli\nmcp'} spellcheck={false} class={areaClass}></textarea>
        </label>
        <label class="block min-w-0 space-y-1.5 text-sm text-fg">
          <span class="font-medium">Environment (KEY=value, satu per baris)</span>
          <textarea
            bind:value={envText}
            rows={3}
            placeholder="API_KEY="
            spellcheck={false}
            class={areaClass}
          ></textarea>
          {#if editing}
            <span class="block text-xs leading-5 text-fg-subtle">
              {server?.hasEnvSecrets ? 'Env tersimpan ada — kosongkan untuk mempertahankannya.' : 'Belum ada env tersimpan.'}
            </span>
          {/if}
        </label>
      </div>
      <label class="block min-w-0 space-y-1.5 text-sm text-fg">
        <span class="font-medium">Working directory (opsional)</span>
        <Input bind:value={cwd} disabled={saving} placeholder="/home/era/Documents/Rosik" spellcheck={false} />
      </label>
      {/if}
    {:else}
      <label class="block min-w-0 space-y-1.5 text-sm text-fg">
        <span class="font-medium">URL</span>
        <Input bind:value={url} disabled={saving} placeholder="https://mcp.contoh.com/mcp" spellcheck={false} />
      </label>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1.5">
          <span class="block text-sm font-medium text-fg">Auth</span>
          <OptionDropdown
            label="Jenis auth"
            value={authType}
            width="w-48"
            class="w-48"
            options={authOptions}
            onchange={(value) => (authType = value as UpstreamAuthType)}
          />
        </div>
        {#if authType !== 'none'}
          <label class="block min-w-0 space-y-1.5 text-sm text-fg">
            <span class="font-medium">{authType === 'bearer' ? 'Bearer token' : 'API key'}</span>
            <Input
              type="password"
              bind:value={authSecret}
              disabled={saving || clearSecret}
              placeholder={editing && server?.hasAuthSecret ? 'Tersimpan — kosongkan untuk memakai yang lama' : 'Token / key baru'}
              autocomplete="off"
              spellcheck={false}
            />
            {#if editing && server?.hasAuthSecret}
              <label class="mt-1 flex cursor-pointer items-center gap-2 text-xs text-fg-subtle">
                <input type="checkbox" bind:checked={clearSecret} disabled={saving} />
                Hapus secret tersimpan
              </label>
            {/if}
          </label>
        {/if}
      </div>
      {#if showAdvanced}
      <label class="block min-w-0 space-y-1.5 text-sm text-fg">
        <span class="font-medium">Header tambahan (Key: value, satu per baris)</span>
        <textarea
          bind:value={headersText}
          rows={3}
          placeholder={'X-Custom: nilai'}
          spellcheck={false}
          class={areaClass}
        ></textarea>
        {#if editing}
          <span class="block text-xs leading-5 text-fg-subtle">Header tersimpan tidak ditampilkan — kosongkan untuk mempertahankannya.</span>
        {/if}
      </label>
      {/if}
    {/if}

    {#if showAdvanced}
      <div class="flex flex-wrap items-end gap-4 rounded-lg border border-line p-4">
        <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
          <span>Aktif</span>
          <Switch
            checked={enabled}
            label={enabled ? 'Nonaktifkan server' : 'Aktifkan server'}
            onchange={(value) => (enabled = value)}
          />
        </label>
        <label class="block w-40 space-y-1.5 text-sm text-fg">
          <span class="font-medium">Timeout (ms)</span>
          <input
            type="number"
            min={1000}
            max={120000}
            step={1000}
            bind:value={timeoutMs}
            disabled={saving}
            class={inputClass}
          />
        </label>
      </div>
    {/if}

    <section class="rounded-lg border border-line p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium text-fg">Test connection</h3>
          <p class="mt-0.5 text-xs leading-5 text-fg-subtle">
            Menghubungkan ke server dengan konfigurasi di atas tanpa menyimpan.
            {#if editing}Saat edit, test memakai env/header yang diketik di form, bukan yang tersimpan.{/if}
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={testing || saving} onclick={() => void runTest()}>
          <PlugZap size={14} />
          {testing ? 'Mengetes…' : 'Test connection'}
        </Button>
      </div>
      {#if testError}
        <p class="mt-3 text-sm text-danger" role="alert">{testError}</p>
      {/if}
      {#if testResult}
        <div class="mt-3">
          <p class="text-sm text-fg" role="status">
            Terhubung ke <strong>{testResult.serverInfo.name}</strong>
            {#if testResult.serverInfo.version} <span class="text-fg-subtle">v{testResult.serverInfo.version}</span>{/if}
            — {testResult.tools.length} tool ditemukan.
          </p>
          {#if testResult.tools.length}
            <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {#each testResult.tools as tool (tool.name)}
                <li class="flex min-w-0 gap-2 text-sm">
                  <span class="shrink-0 font-mono text-fg">{tool.name}</span>
                  <span class="min-w-0 truncate text-fg-subtle">{tool.description ?? '—'}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </section>

    {#if formError}
      <p class="text-sm text-danger" role="alert">{formError}</p>
    {/if}
    {#if !tested && !formError}
      <p class="text-sm text-warning" role="status">
        Server belum dites — simpan tetap bisa, tapi koneksi belum terverifikasi.
      </p>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="secondary" size="sm" disabled={saving} onclick={oncancel}>Batal</Button>
    <Button variant="primary" size="sm" disabled={saving} onclick={() => void save()}>
      {saving ? 'Menyimpan…' : 'Simpan server'}
    </Button>
  {/snippet}
</Modal>

