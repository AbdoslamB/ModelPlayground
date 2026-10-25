<!--
  The Naive Bayes graph: one bar per word of the message. A bar to the right
  points to spam, to the left to normal, and its length is the word's
  evidence. The first bar is where the model starts before reading; the last
  is the total. Clicking a word switches it off (or on again), as if it were
  deleted from the message.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { Term } from '../math';
  import type { BayesLab } from '../store.svelte';

  import { formatNumber } from '../../../lib/format';
  import { scaleLinear } from '../../../lib/scales';

  let { lab }: { lab: BayesLab } = $props();

  let frame: HTMLDivElement | undefined = $state();
  let width = $state(640);
  let focused = $state(false);
  let summary = $state('');

  const narrow = $derived(width < 480);
  const rowH = $derived(narrow ? 32 : 36);
  const barH = $derived(narrow ? 16 : 18);
  const labelW = $derived(narrow ? 92 : 124);
  const top = 30;
  const bottom = 44;
  const terms = $derived(lab.rows);
  /** Rows: the start, each word, then the total (after a small gap). */
  const height = $derived(top + rowH * (terms.length + 2) + 10 + bottom);
  const rowY = (index: number) => top + index * rowH;
  const totalY = $derived(top + (terms.length + 1) * rowH + 10);

  const shown = (t: Term) => t.times * t.evidence;
  const reach = $derived(
    Math.max(
      2,
      Math.ceil(
        Math.max(
          Math.abs(lab.reading.prior),
          Math.abs(lab.reading.logOdds),
          ...terms.map((t) => Math.abs(shown(t))),
        ) + 0.25,
      ),
    ),
  );
  const x = $derived(scaleLinear([-reach, reach], [labelW, width - 16]));
  const ticks = $derived(x.ticks(narrow ? 4 : 8).filter(Number.isInteger));
  const selectedId = $derived(lab.selectedRow?.id ?? null);

  function bar(value: number) {
    const x0 = x(0);
    const x1 = x(value);
    return { x: Math.min(x0, x1), width: Math.abs(x1 - x0) };
  }

  const side = (value: number) => (value >= 0 ? 1 : 2);

  // Screen-reader summary, refreshed at most once per second.
  $effect(() => {
    const strongest = [...lab.counted].sort(
      (p, q) => Math.abs(q.contribution) - Math.abs(p.contribution),
    )[0];
    const text = `The message reads as ${formatNumber(100 * lab.reading.spamChance, 0)}% likely spam.${
      strongest
        ? ` The strongest word is "${strongest.word}", pointing to ${strongest.contribution >= 0 ? 'spam' : 'normal'}.`
        : ''
    }`;
    const timer = setTimeout(() => {
      summary = text;
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = Math.max(260, Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  });

  function rowId(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    return id ? Number(id) : null;
  }

  // Keyboard on the words: ↑/↓ (or ←/→) walk through them, Enter or Space
  // switches the selected word off or on, Esc clears.
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      lab.select(null);
      return;
    }
    const term = lab.selectedRow;
    if ((event.key === 'Enter' || event.key === ' ') && term) {
      event.preventDefault();
      lab.toggle(term.word);
      return;
    }
    const direction =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const index = terms.findIndex((t) => t.id === selectedId);
    const next =
      terms[
        index === -1
          ? 0
          : Math.min(terms.length - 1, Math.max(0, index + direction))
      ];
    if (next) lab.select({ kind: 'item', id: next.id, source: 'graph' });
  }
</script>

<div
  class="graph"
  role="group"
  aria-label="Bar chart of the evidence each word gives: to the right for spam, to the left for normal"
  aria-describedby="nb-graph-summary"
  data-view="graph"
>
  <div class="graph__frame" bind:this={frame} style:height={`${height}px`}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" {height}>
      <!-- Direction labels and gridlines -->
      <g aria-hidden="true">
        <text class="side sym-class-2" x={x(-reach)} y={16}>← normal</text>
        <text class="side sym-class-1" x={x(reach)} y={16} text-anchor="end"
          >spam →</text
        >
        {#each ticks as tick (tick)}
          <line
            class={tick === 0 ? 'zero' : 'gridline'}
            x1={x(tick)}
            x2={x(tick)}
            y1={top - 4}
            y2={totalY + rowH}
          />
          <text
            class="tick num"
            x={x(tick)}
            y={totalY + rowH + 16}
            text-anchor="middle"
          >
            {formatNumber(tick, 0)}
          </text>
        {/each}
        <text
          class="axis-title"
          x={(labelW + width - 16) / 2}
          y={height - 6}
          text-anchor="middle"
        >
          evidence (log of how much likelier in spam)
        </text>
      </g>

      <!-- Where the model starts, before reading any words -->
      <g class="fixed" aria-hidden="true">
        <text class="label" x={labelW - 10} y={rowY(0) + rowH / 2 + 5}
          >start</text
        >
        <rect
          class={`bar bar--${side(lab.reading.prior)}`}
          x={bar(lab.reading.prior).x}
          y={rowY(0) + (rowH - barH) / 2}
          width={bar(lab.reading.prior).width}
          height={barH}
          rx="3"
        />
      </g>

      <!-- The words: one tab stop, arrow keys walk through them -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        class="words"
        role="group"
        aria-label={`${terms.length} words in the message. Use the arrow keys to move between them, and Enter to switch a word off or on.`}
        tabindex="0"
        onkeydown={onKey}
        onfocus={() => {
          focused = true;
        }}
        onblur={() => {
          focused = false;
        }}
        onpointerover={(event) => {
          const id = rowId(event);
          if (id !== null && event.pointerType === 'mouse') {
            lab.select({ kind: 'item', id, source: 'graph' });
          }
        }}
        onpointerout={(event) => {
          const id = rowId(event);
          if (id !== null && event.pointerType === 'mouse')
            lab.release('item', id);
        }}
        onclick={(event) => {
          const id = rowId(event);
          const term = terms.find((t) => t.id === id);
          if (!term) return;
          lab.select({ kind: 'item', id: term.id, source: 'graph' });
          lab.toggle(term.word);
        }}
      >
        {#if focused}
          <rect
            class="words__focus"
            x="2"
            y={rowY(1) - 2}
            width={width - 4}
            height={terms.length * rowH + 4}
            rx="6"
          />
        {/if}
        {#each terms as term, index (term.id)}
          {@const y = rowY(index + 1)}
          {@const value = shown(term)}
          <g
            class="row"
            class:row--off={term.known && !term.counted}
            class:row--unseen={!term.known}
            data-id={term.id}
            data-selected={term.id === selectedId ? '' : undefined}
          >
            <rect class="row__hit" x="0" {y} {width} height={rowH} rx="4" />
            <text class="label" x={labelW - 10} y={y + rowH / 2 + 5}>
              {term.word}{term.times > 1 ? ` ×${term.times}` : ''}
            </text>
            {#if term.known}
              <rect
                class={`bar bar--${side(value)}`}
                x={bar(value).x}
                y={y + (rowH - barH) / 2}
                width={bar(value).width}
                height={barH}
                rx="3"
              />
            {:else}
              <text class="unseen" x={x(0) + 8} y={y + rowH / 2 + 5}>
                never seen, so ignored
              </text>
            {/if}
          </g>
        {/each}
      </g>

      <!-- The total: start + every word that counts -->
      <g class="fixed" aria-hidden="true">
        <line
          class="divider"
          x1={labelW - 60}
          x2={width - 16}
          y1={totalY - 5}
          y2={totalY - 5}
        />
        <text
          class="label label--total"
          x={labelW - 10}
          y={totalY + rowH / 2 + 5}
          ><tspan class="sym-line">L</tspan> total</text
        >
        <rect
          class={`bar bar--total bar--${side(lab.reading.logOdds)}`}
          x={bar(lab.reading.logOdds).x}
          y={totalY + (rowH - barH - 6) / 2}
          width={bar(lab.reading.logOdds).width}
          height={barH + 6}
          rx="3"
        />
      </g>
    </svg>
  </div>
  <p class="visually-hidden" id="nb-graph-summary">{summary}</p>
</div>

<style>
  .graph {
    width: 100%;
    margin-inline: auto;
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

  .side {
    fill: currentcolor;
    font-size: 13px;
    font-weight: 700;
  }

  .gridline {
    stroke: var(--c-grid);
  }

  .zero {
    stroke: var(--c-control-edge);
  }

  .tick {
    fill: var(--c-muted);
    font-size: 12px;
  }

  .axis-title {
    fill: var(--c-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .label {
    fill: var(--c-text);
    font-size: 15px;
    text-anchor: end;
  }

  .label--total {
    font-weight: 700;
  }

  .label--total .sym-line {
    fill: var(--c-line-ink);
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-style: italic;
  }

  .divider {
    stroke: var(--c-hairline);
  }

  .bar {
    transition:
      x var(--dur-ui) var(--ease-out),
      width var(--dur-ui) var(--ease-out);
  }

  .bar--1 {
    fill: var(--c-class-1);
  }

  .bar--2 {
    fill: var(--c-class-2);
  }

  .bar--total {
    stroke: var(--c-text);
    stroke-width: 1.5;
  }

  :global(.lab[data-highlight='L']) .bar--total {
    stroke-width: 3;
  }

  .words {
    outline: none;
  }

  .words__focus {
    fill: none;
    stroke: var(--c-focus);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .row {
    cursor: pointer;
  }

  .row__hit {
    fill: transparent;
  }

  .row:hover .row__hit {
    fill: var(--c-surface-sunken);
  }

  .row[data-selected] .row__hit {
    fill: var(--c-highlight);
  }

  .row[data-selected] .label {
    font-weight: 700;
  }

  /* A word switched off: struck through, its bar an empty outline. */
  .row--off .label {
    fill: var(--c-muted);
    text-decoration: line-through;
  }

  .row--off .bar {
    fill: none;
    stroke: var(--c-control-edge);
    stroke-dasharray: 4 3;
    stroke-width: 1.5;
  }

  .row--unseen {
    cursor: default;
  }

  .row--unseen .label,
  .unseen {
    fill: var(--c-muted);
    font-style: italic;
  }

  .unseen {
    font-size: 13px;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
