<script lang="ts">
  let { size = 24, full = false, class: className = '' }: { size?: number; full?: boolean; class?: string } = $props();
</script>

<span class={['inline-flex shrink-0 items-center gap-2', className]} aria-label={full ? 'Toolsmith' : undefined}>
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" class="shrink-0">
    <defs>
      <linearGradient id="toolsmith-logo-gradient" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
        <stop stop-color="#7C86E8" />
        <stop offset="1" stop-color="#4F5BC4" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#toolsmith-logo-gradient)" />
    <circle cx="15" cy="16" r="7.25" stroke="white" stroke-width="2.6" />
    <path d="M21 10.8 25 7M22.2 16H27" stroke="white" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="26" cy="6.5" r="2" fill="white" />
  </svg>
  {#if full}<span class="truncate text-base font-semibold tracking-tight">Toolsmith</span>{/if}
</span>
