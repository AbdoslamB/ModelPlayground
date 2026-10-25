<!--
  The RNN graph, unrolled: one column per character read, left to right.
  Under each character, a strip shows the network's memory (the hidden
  state) after reading it: blue for positive numbers, orange for negative,
  stronger for bigger ones. Below, bars show the chance of each next
  character after the selected step (or the last one); the character that
  really comes next is outlined.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { RnnLab } from '../store.svelte';

  import { top } from '../math';

  let { lab }: { lab: RnnLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let width = $state(640);
  let focused = $state(false);

  const narrow = $derived(width < 480);
  const column = $derived(narrow ? 17 : 22);
  const cellH = $derived(narrow ? 4 : 5);
  const charH = 24;
  const H = $derived(lab.dataset.hidden);
  const lineH = $derived(charH + H * cellH + 14);
  const perLine = $derived(Math.max(1, Math.floor(width / column)));
  const lines = $derived(Math.max(1, Math.ceil(lab.steps.length / perLine)));
  const barsTop = $derived(lines * lineH + 12);
  const BARS = 8;
  const barH = 22;
  const labelW = 44;
  const height = $derived(barsTop + 26 + BARS * barH + 8);
  const shown = $derived(lab.shown);
  const selectedId = $derived(lab.selectedStep?.id ?? null);
  const bars = $derived(
    shown ? top(shown.probabilities, lab.dataset.alphabet, BARS) : [],
  );

  function at(t: number) {
    return {
      x: (t % perLine) * column,
      y: Math.floor(t / perLine) * lineH,
    };
  }

  /** Blue for positive, orange for negative, stronger when further from 0. */
  function heat(value: number): string {
    const strength = Math.round(Math.min(1, Math.abs(value)) * 16) * 5;
    if (strength === 0) return 'var(--c-bg)';
    const role = value > 0 ? 'var(--c-class-3)' : 'var(--c-class-1)';
    return `color-mix(in srgb, ${role} ${strength}%, var(--c-bg))`;
  }

  /** Space and full stop drawn so they can be seen. */
  function show(char: string): string {
    return char === ' ' ? '␣' : char;
  }

  onMount(() => {
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(240, Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function stepId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  // Keyboard: ←/→ walk through the steps, Esc clears.
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      lab.select(null);
      return;
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const index = lab.steps.findIndex((s) => s.id === selectedId);
    const next =
      lab.steps[
        index === -1
          ? 0
          : Math.min(lab.steps.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }
</script>

<div
  class="graph"
  role="group"
  aria-label="The network unrolled: one column per character, with its memory below, and the chances for the next character"
  data-view="graph"
>
  <div class="graph__frame" bind:this={frame} style:height={`${height}px`}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" {height}>
      <!-- The steps: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="steps"
        role="group"
        aria-label={`${lab.steps.length} steps, one per character read. Use the left and right arrow keys to move between them.`}
        tabindex="0"
        onkeydown={onKey}
        onfocus={() => {
          focused = true;
        }}
        onblur={() => {
          focused = false;
        }}
        onpointerover={(event) => {
          const id = stepId(event);
          if (id !== null && event.pointerType === 'mouse') {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = stepId(event);
          if (id !== null && event.pointerType === 'mouse')
            lab.release('item', id);
        }}
        onclick={(event) => {
          const id = stepId(event);
          if (id === null) return;
          if (selectedId === id && event.pointerType !== 'mouse')
            lab.select(null);
          else lab.select({ kind: 'item', id, source: 'graph' });
        }}
      >
        {#if focused}
          <rect
            class="steps__focus"
            x="-3"
            y="-3"
            width={width + 6}
            height={lines * lineH}
            rx="6"
          />
        {/if}
        {#each lab.steps as s, t (s.id)}
          {@const p = at(t)}
          <g
            class="step"
            class:step--shown={s === shown}
            transform={`translate(${p.x} ${p.y})`}
            data-id={s.id}
            data-selected={s.id === selectedId ? '' : undefined}
          >
            <rect class="step__hit" width={column} height={lineH - 6} rx="3" />
            <text class="step__char" x={column / 2} y={17}>{show(s.char)}</text>
            {#each s.hidden as value, k (k)}
              <rect
                class="cell"
                x="2"
                y={charH + k * cellH}
                width={column - 4}
                height={cellH}
                style:fill={heat(value)}
              />
            {/each}
          </g>
        {/each}
      </g>

      <!-- Chances for the next character -->
      {#if shown}
        <g class="bars" transform={`translate(0 ${barsTop})`}>
          <text class="bars__title" x="0" y="14">
            After “{show(shown.char)}” (step {shown.id}), the next character
            might be:
          </text>
          {#each bars as bar, i (bar.index)}
            {@const y = 26 + i * barH}
            {@const actual = bar.index === shown.next}
            <text class="bar__label" x={labelW - 10} y={y + 15}
              >{show(bar.char)}</text
            >
            <rect
              class="bar"
              class:bar--actual={actual}
              x={labelW}
              y={y + 3}
              width={Math.max(1, bar.p * (width - labelW - 8))}
              height={barH - 6}
              rx="3"
            />
          {/each}
        </g>
      {/if}
    </svg>
  </div>
</div>

<style>
  .graph {
    width: 100%;
  }

  .graph__frame {
    position: relative;
    user-select: none;
  }

  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  .steps {
    outline: none;
  }

  .steps__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .step {
    cursor: pointer;
  }

  .step__hit {
    fill: transparent;
  }

  .step:hover .step__hit {
    fill: var(--c-surface-sunken);
  }

  .step--shown .step__hit {
    fill: var(--c-highlight);
  }

  .step[data-selected] .step__hit {
    stroke: var(--c-text);
    stroke-width: 2;
  }

  .step__char {
    fill: var(--c-text);
    font-family: var(--font-code);
    font-size: 15px;
    font-weight: 600;
    text-anchor: middle;
  }

  .cell {
    stroke: var(--c-bg);
    stroke-width: 0.5;
  }

  :global(.lab[data-highlight='h']) .cell {
    stroke: var(--c-control-edge);
  }

  .bars__title {
    fill: var(--c-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .bar__label {
    fill: var(--c-text);
    font-family: var(--font-code);
    font-size: 15px;
    font-weight: 600;
    text-anchor: end;
  }

  .bar {
    fill: var(--c-line);
    transition: width var(--dur-ui) var(--ease-out);
  }

  .bar--actual {
    stroke: var(--c-text);
    stroke-width: 2;
  }

  :global(.lab[data-highlight='T']) .bar {
    fill: color-mix(in srgb, var(--c-line) 70%, var(--c-text));
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
