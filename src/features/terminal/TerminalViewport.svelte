<script lang="ts">
  import { onMount } from 'svelte';
  import { FitAddon } from '@xterm/addon-fit';
  import { Terminal } from '@xterm/xterm';
  import '@xterm/xterm/css/xterm.css';
  import { theme } from '$lib/stores/theme.svelte';
  import { xtermThemes } from './themes';

  interface Props {
    ondata: (data: string) => void;
    onresize: (cols: number, rows: number) => void;
    class?: string;
  }

  let { ondata, onresize, class: className }: Props = $props();

  let host = $state<HTMLDivElement>();
  let selectionMode = $state(false);
  let term: Terminal | undefined;
  let fit: FitAddon | undefined;
  let selectionPointerId: number | undefined;
  let selectionAnchor = 0;
  let selectionPointerX = 0;
  let selectionPointerY = 0;
  let autoScrollFrame = 0;
  let suppressReplayInput = false;

  function terminalCellAt(clientX: number, clientY: number) {
    if (!host || !term) return undefined;
    const screen = host.querySelector<HTMLElement>('.xterm-screen');
    if (!screen) return undefined;
    const rect = screen.getBoundingClientRect();
    if (!rect.width || !rect.height) return undefined;
    const col = Math.max(0, Math.min(term.cols - 1, Math.floor((clientX - rect.left) / (rect.width / term.cols))));
    const row = Math.max(0, Math.min(term.rows - 1, Math.floor((clientY - rect.top) / (rect.height / term.rows))));
    return (term.buffer.active.viewportY + row) * term.cols + col;
  }

  function selectPointerRange(clientX: number, clientY: number) {
    if (!term) return;
    const current = terminalCellAt(clientX, clientY);
    if (current === undefined) return;
    const start = Math.min(selectionAnchor, current);
    term.select(start % term.cols, Math.floor(start / term.cols), Math.abs(current - selectionAnchor) + 1);
  }

  function stopSelectionAutoScroll() {
    if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  }

  function runSelectionAutoScroll() {
    autoScrollFrame = 0;
    if (!selectionMode || selectionPointerId === undefined || !host || !term) return;
    const screen = host.querySelector<HTMLElement>('.xterm-screen');
    if (!screen) return;
    const rect = screen.getBoundingClientRect();
    const edgeSize = Math.min(64, rect.height * 0.18);
    let direction = 0;
    let speed = 0;
    if (selectionPointerY < rect.top + edgeSize) {
      direction = -1;
      speed = Math.max(1, Math.ceil((rect.top + edgeSize - selectionPointerY) / 12));
    } else if (selectionPointerY > rect.bottom - edgeSize) {
      direction = 1;
      speed = Math.max(1, Math.ceil((selectionPointerY - (rect.bottom - edgeSize)) / 12));
    }
    if (!direction) return;
    term.scrollLines(direction * Math.min(speed, 5));
    selectPointerRange(selectionPointerX, selectionPointerY);
    autoScrollFrame = requestAnimationFrame(runSelectionAutoScroll);
  }

  function scheduleSelectionAutoScroll() {
    if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(runSelectionAutoScroll);
  }

  function onSelectionPointerDown(event: PointerEvent) {
    if (!selectionMode || (event.pointerType !== 'touch' && event.pointerType !== 'pen') ||
      (event.target instanceof Element && event.target.closest('button'))) return;
    const cell = terminalCellAt(event.clientX, event.clientY);
    if (cell === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    selectionPointerId = event.pointerId;
    selectionAnchor = cell;
    selectionPointerX = event.clientX;
    selectionPointerY = event.clientY;
    host?.setPointerCapture(event.pointerId);
    selectPointerRange(event.clientX, event.clientY);
  }

  function onSelectionPointerMove(event: PointerEvent) {
    if (!selectionMode || selectionPointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    selectionPointerX = event.clientX;
    selectionPointerY = event.clientY;
    selectPointerRange(event.clientX, event.clientY);
    scheduleSelectionAutoScroll();
  }

  function onSelectionPointerEnd(event: PointerEvent) {
    if (selectionPointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    selectionPointerId = undefined;
    stopSelectionAutoScroll();
  }

  // Imperative API used by the terminal controller (via bind:this).
  export function write(data: string) {
    // TUIs can capture drag gestures through mouse reporting. Keep those modes
    // disabled while selection mode is active so mouse, touch, and stylus can select text.
    const output = selectionMode
      ? data.replace(/\x1b\[\?(?:1000|1002|1003|1005|1006|1015)(?:;\d+)*h/g, '')
      : data;
    term?.write(output);
  }
  export function reset() {
    term?.reset();
  }
  // Replaying saved PTY output reconstructs the screen. It may contain old
  // terminal queries; responses generated while replaying must not be sent to
  // the currently running shell, or they appear as literal input on reconnect.
  export function restore(data: string) {
    if (!term) return;
    suppressReplayInput = true;
    term.reset();
    term.write(data, () => {
      suppressReplayInput = false;
    });
  }
  export function focus() {
    term?.focus();
  }
  export function refit() {
    if (!term || !fit) return;
    fit.fit();
    onresize(term.cols, term.rows);
  }

  // Follow the app theme live.
  $effect(() => {
    const palette = xtermThemes[theme.current];
    if (term) term.options.theme = palette;
  });

  onMount(() => {
    const instance = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      // Bundle the font so Nerd Font glyphs work even when the device has no system Nerd Font.
      fontFamily:
        '"Toolsmith Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", "FiraCode Nerd Font", "Hack Nerd Font", "MesloLGS NF", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10000,
      theme: xtermThemes[theme.current],
      rightClickSelectsWord: true,
      scrollOnUserInput: true,
    });
    const fitAddon = new FitAddon();
    instance.loadAddon(fitAddon);
    instance.open(host!);
    instance.onData((data) => {
      if (suppressReplayInput) return;
      // Ignore terminal color-query replies, including when xterm batches one
      // together with other input. They must never be typed into the shell.
      const filtered = data.replace(/\x1b\](?:10|11);rgb:[0-9a-f/]+(?:\x07|\x1b\\)/gi, '');
      if (filtered) ondata(filtered);
    });
    instance.onBinary((data) => {
      if (!suppressReplayInput) ondata(data);
    });
    // Keep keyboard shortcuts inside the terminal; Ctrl+C still sends SIGINT.
    instance.attachCustomKeyEventHandler((event) => {
      if (event.key === 'Escape') event.preventDefault();
      event.stopPropagation();
      return true;
    });

    term = instance;
    fit = fitAddon;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    });
    observer.observe(host!);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      instance.dispose();
      term = fit = undefined;
    };
  });
</script>

<div bind:this={host} onpointerdown={onSelectionPointerDown} onpointermove={onSelectionPointerMove} onpointerup={onSelectionPointerEnd} onpointercancel={onSelectionPointerEnd} role="application" class={["relative h-full w-full overflow-hidden px-3 py-2", selectionMode ? "touch-none" : "touch-pan-y", className]}>
  <button
    type="button"
    class={['absolute right-4 top-3 z-10 rounded-md border px-2.5 py-1.5 text-xs shadow-sm transition-colors', selectionMode ? 'border-accent bg-accent/10 text-fg' : 'border-line bg-surface-raised/90 text-fg-muted hover:bg-surface-hover']}
    aria-pressed={selectionMode}
    title={selectionMode ? 'Exit text selection mode' : 'Enable text selection for mouse, touch, or stylus'}
    onclick={() => {
      selectionMode = !selectionMode;
      if (selectionMode) {
        term?.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l');
      }
    }}
  >
    {selectionMode ? 'Selecting text' : 'Select text'}
  </button>
</div>
