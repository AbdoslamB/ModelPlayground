<!--
  The Support Vector Machine Lab: the one island on the page. Graph, equation
  and table are linked through one selection, like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Row } from './math';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import { SvmLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the straight and curved border formulas. */
    formulas: { linear: string; rbf: string };
  }

  let { dataset, formulas }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new SvmLab(dataset);

  const total = $derived(lab.points.length);
  /** The student the last line explains: the selected one, or the furthest past their margin. */
  const shown = $derived(
    lab.selectedRow ??
      [...lab.points].sort(
        (p, q) => (lab.slacks[q.id] ?? 0) - (lab.slacks[p.id] ?? 0),
      )[0],
  );
  const changed = $derived(
    lab.curved ||
      lab.logC !== dataset.logC.initial ||
      lab.logGamma !== dataset.logGamma.initial ||
      lab.points.some((p, i) => {
        const start = dataset.batches[lab.batchIndex]?.[i];
        return p.x !== start?.x || p.y !== start.y;
      }),
  );

  /** "+ 0.41" or "− 5.62", for the terms of a sum. */
  function term(value: number, decimals = 2) {
    return `${value < 0 ? '−' : '+'} ${formatNumber(Math.abs(value), decimals)}`;
  }

  const fmt = (value: number, decimals = 2) => formatNumber(value, decimals);

  function verdict(margin: number) {
    if (margin >= 1 - 1e-9) return 'outside the margin, no slack';
    if (margin >= 0) return 'inside the margin';
    return 'on the wrong side of the border';
  }

  const columns: TableColumn<Row>[] = $derived([
    { key: 'id', header: '#', decimals: 0, value: (r: Row) => r.id },
    {
      key: 'x',
      header: lab.xColumn?.short ?? 'x',
      unit: lab.xColumn?.unit,
      decimals: 1,
      value: (r: Row) => r.x,
    },
    {
      key: 'y',
      header: lab.yColumn?.short ?? 'y',
      unit: lab.yColumn?.unit,
      decimals: 1,
      value: (r: Row) => r.y,
    },
    {
      key: 'result',
      header: 'Result',
      decimals: 0,
      value: (r: Row) => lab.classIndex(r.label),
      text: (r: Row) => lab.classInfo(r.label)?.short ?? r.label,
    },
    {
      key: 'margin',
      header: 'y·f(x)',
      decimals: 2,
      role: 'sym-line',
      highlight: 'f',
      value: (r: Row) => lab.margins[r.id] ?? NaN,
    },
    {
      key: 'slack',
      header: 'ξ slack',
      decimals: 2,
      role: 'sym-error',
      highlight: 'xi',
      value: (r: Row) => lab.slacks[r.id] ?? NaN,
    },
    {
      key: 'support',
      header: 'Support?',
      decimals: 0,
      value: (r: Row) => (lab.supportIds.includes(r.id) ? 0 : 1),
      text: (r: Row) => (lab.supportIds.includes(r.id) ? 'yes' : '–'),
    },
  ]);

  function hover(event: PointerEvent, on: boolean) {
    if (!(event.target instanceof Element)) return;
    for (const [selector, id] of [
      ['.sym-line', 'f'],
      ['.sym-error', 'xi'],
    ] as const) {
      if (event.target.closest(selector)) {
        if (on) lab.select({ kind: 'symbol', id });
        else lab.release('symbol', id);
      }
    }
  }
</script>

<LabShell label="Support Vector Machine Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><circle cx="7" cy="7" r="5.5" fill="var(--c-class-2)" /></svg
        >passed
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><path d="M7 1.5 13 12.5H1Z" fill="var(--c-class-1)" /></svg
        >failed: drag any student
      </li>
      <li>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"
          ><circle
            cx="9"
            cy="9"
            r="7.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          /><circle cx="9" cy="9" r="3.5" fill="currentColor" /></svg
        >support vector
      </li>
      <li>
        <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true"
          ><line
            x1="1"
            y1="5"
            x2="19"
            y2="5"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="5 3"
          /></svg
        >margin
      </li>
    </ul>
  {/snippet}

  {#snippet tools()}
    <Toggle
      label="Areas"
      checked={lab.showAreas}
      onchange={(checked) => {
        lab.showAreas = checked;
      }}
    />
    <Toggle
      label="Curved"
      checked={lab.curved}
      onchange={(checked) => {
        lab.curved = checked;
      }}
    />
    <span class="tools__spacer"></span>
    <button
      type="button"
      class="button"
      onclick={() => {
        lab.nextBatch();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="tool-label">Refresh Data</span>
    </button>
    <button
      type="button"
      class="button button--quiet"
      disabled={!changed}
      onclick={() => {
        lab.reset();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="tool-label">Reset</span>
    </button>
  {/snippet}

  {#snippet graph()}
    <Graph {lab} />
  {/snippet}

  {#snippet equation()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="equation"
      data-view="equation"
      onpointerover={(event) => {
        hover(event, true);
      }}
      onpointerout={(event) => {
        hover(event, false);
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html lab.curved ? formulas.rbf : formulas.linear}
      </div>
      {#if lab.curved}
        <p class="equation__live num" data-live="f">
          <span class="sym-line">f</span>(x) = a sum over {lab.supportIds
            .length}
          support vectors, with
          <span class="sym-a">C</span> = {fmt(lab.C)} and
          <span class="sym-b">γ</span> = {fmt(lab.gamma)}, then
          {term(lab.machine.b)}
        </p>
      {:else}
        <p class="equation__live num" data-live="f">
          <span class="sym-line">f</span>(x) = {fmt(lab.w.x)} × studied {term(
            lab.w.y,
          )} × slept {term(lab.machine.b)}
        </p>
        <p class="equation__live num" data-live="margin">
          margin = 2 ÷ ‖w‖ = 2 ÷ {fmt(Math.hypot(lab.w.x, lab.w.y))} =
          <strong>{fmt(lab.width)} h</strong>
        </p>
        <p class="equation__live num" data-live="objective">
          ½‖w‖² + <span class="sym-a">C</span> Σ<span class="sym-error">ξ</span>
          = {fmt(lab.objective.size)} + {fmt(lab.C)} × {fmt(
            lab.objective.slack,
          )}
          = <strong>{fmt(lab.objective.total)}</strong>
        </p>
      {/if}
      {#if shown}
        {@const m = lab.margins[shown.id] ?? NaN}
        {@const sign = lab.classInfo(shown.label)?.sign ?? 1}
        <p class="equation__point num" data-live="point">
          Student {shown.id} ({lab.classInfo(shown.label)?.name}): y·<span
            class="sym-line">f</span
          >(x) = {sign > 0 ? '+1' : '−1'} × {fmt(lab.values[shown.id] ?? NaN)} = {fmt(
            m,
          )}, {verdict(m)}; <span class="sym-error">ξ</span> = {fmt(
            lab.slacks[shown.id] ?? NaN,
          )}
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <div class="sliders">
        <Slider
          id="slider-c"
          symbol="C"
          role="a"
          label={`C, how much a student past the margin costs: ${fmt(lab.C)}`}
          value={lab.logC}
          min={dataset.logC.min}
          max={dataset.logC.max}
          step={dataset.logC.step}
          onchange={(value) => {
            lab.setLogC(value);
          }}
          onfocuschange={(focused) => {
            if (focused) lab.select({ kind: 'symbol', id: 'C' });
            else lab.release('symbol', 'C');
          }}
        />
        {#if lab.curved}
          <Slider
            id="slider-gamma"
            symbol="γ"
            role="b"
            label={`γ, how far each student's pull reaches: ${fmt(lab.gamma)}`}
            value={lab.logGamma}
            min={dataset.logGamma.min}
            max={dataset.logGamma.max}
            step={dataset.logGamma.step}
            onchange={(value) => {
              lab.setLogGamma(value);
            }}
            onfocuschange={(focused) => {
              if (focused) lab.select({ kind: 'symbol', id: 'gamma' });
              else lab.release('symbol', 'gamma');
            }}
          />
        {/if}
      </div>
      <MetricCard
        compact
        tone="score"
        title="Support vectors"
        value={`${lab.supportIds.length} of ${total}`}
        unit=""
        detail=""
        position={total ? lab.supportIds.length / total : 0}
        label={`${lab.wrong} on the wrong side`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`${dataset.title}: ${total} students, and where each one sits against the border.`}
        rows={lab.points}
        {columns}
        rowClass={(row) =>
          lab.supportIds.includes(row.id) ? 'is-active' : undefined}
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'f' || symbol === 'xi')
            lab.select({ kind: 'symbol', id: symbol });
          else lab.select(null);
        }}
        describe={(row) =>
          `Student ${row.id}, ${lab.classInfo(row.label)?.name}: ${fmt(row.x, 1)} hours studied, ${fmt(row.y, 1)} slept; y times f of x is ${fmt(lab.margins[row.id] ?? NaN)}, slack ${fmt(lab.slacks[row.id] ?? NaN)}${lab.supportIds.includes(row.id) ? ', a support vector' : ''}`}
      />
    </div>
  {/snippet}
</LabShell>

<style>
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-6);
    margin: 0;
    padding: 0;
    color: var(--c-muted);
    font-size: var(--fs-14);
    line-height: 1.5;
    list-style: none;
  }

  .key li {
    display: flex;
    gap: var(--s-2);
    align-items: center;
  }

  .key svg {
    display: inline-block;
  }

  .tools__spacer {
    flex: 1;
  }

  .equation {
    display: grid;
    gap: var(--s-1);
    justify-items: center;
    text-align: center;
  }

  .equation__formula {
    max-width: 100%;
    overflow-x: auto;
    font-size: var(--fs-16);
  }

  .equation__live {
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__point {
    max-width: 56ch;
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .equation :global(.sym-line),
  .equation :global(.sym-error) {
    border-radius: 3px;
    cursor: help;
  }

  :global(.lab[data-highlight='f']) .equation :global(.sym-line),
  :global(.lab[data-highlight='xi']) .equation :global(.sym-error),
  :global(.lab[data-highlight='C']) .equation :global(.sym-a),
  :global(.lab[data-highlight='gamma']) .equation :global(.sym-b) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-6);
    align-items: center;
  }

  .sliders {
    display: grid;
    gap: var(--s-1);
  }

  @container lab (width < 520px) {
    .key {
      gap: var(--s-1) var(--s-4);
    }

    .controls {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--s-2);
    }

    .tool-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    :global(.lab__tools .button) {
      width: 44px;
      padding: 0;
    }
  }
</style>
