<!--
  The Linear Regression Lab: the one island on the page. It wires the model's
  state into the shared Lab shell: graph, equation and table, linked through
  one selection.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TableColumn } from '../../ui/table';
  import type { Dataset, Row } from './data';
  import type { SymbolId } from './store.svelte';

  import LabShell from '../../lab/LabShell.svelte';
  import { decimalsForStep, formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import { LinearRegressionLab } from './store.svelte';
  import Graph from './views/Graph.svelte';
  import PythonBox from './views/PythonBox.svelte';

  interface Props {
    datasets: Dataset[];
    /** KaTeX HTML of the model's formula, rendered at build time. */
    formula: string;
  }

  let { datasets, formula }: Props = $props();

  // The Lab owns its state; the datasets prop never changes after load.
  // svelte-ignore state_referenced_locally
  const lab = new LinearRegressionLab(datasets);

  const ds = $derived(lab.dataset);
  const xCol = $derived(lab.xColumn);
  const yCol = $derived(lab.yColumn);
  const aDecimals = $derived(decimalsForStep(ds.params.a.step));
  const bDecimals = $derived(decimalsForStep(ds.params.b.step));

  /** The x the live equation uses: the selected row's, or the question's. */
  const liveX = $derived(lab.selectedRow?.x ?? ds.exampleX);

  const columns: TableColumn<Row>[] = $derived([
    { key: 'id', header: '#', decimals: 0, value: (r: Row) => r.id },
    {
      key: 'x',
      header: `x: ${xCol?.short ?? ''}`,
      unit: xCol?.unit,
      decimals: xCol?.decimals ?? 1,
      value: (r: Row) => r.x,
    },
    {
      key: 'y',
      header: `y: ${yCol?.short ?? ''}`,
      unit: yCol?.unit,
      decimals: yCol?.decimals ?? 1,
      value: (r: Row) => r.y,
    },
    {
      key: 'yhat',
      header: 'ŷ: prediction',
      unit: yCol?.unit,
      decimals: 1,
      role: 'sym-line',
      highlight: 'line',
      value: (r: Row) => lab.predictions[r.id] ?? NaN,
    },
    {
      key: 'e',
      header: 'e: miss',
      unit: yCol?.unit,
      decimals: 1,
      role: 'sym-error',
      highlight: 'error',
      value: (r: Row) => lab.misses[r.id] ?? NaN,
    },
  ]);

  const symbolClasses: Record<string, SymbolId> = {
    'sym-a': 'a',
    'sym-b': 'b',
    'sym-error': 'error',
    'sym-line': 'line',
  };

  /** Hovering a symbol in the equation highlights it everywhere. */
  function symbolAt(event: Event): SymbolId | null {
    if (!(event.target instanceof Element)) return null;
    const holder = event.target.closest(
      '.sym-a, .sym-b, .sym-line, .sym-error',
    );
    if (!holder) return null;
    const match = [...holder.classList].find((c) => c in symbolClasses);
    return match ? (symbolClasses[match] ?? null) : null;
  }

  function highlightFromControl(symbol: SymbolId, focused: boolean) {
    if (focused) lab.select({ kind: 'symbol', id: symbol });
    else lab.release('symbol', symbol);
  }

  // Reset tweens back to the starting line (instant with reduced motion).
  let tween = 0;
  function reset() {
    cancelAnimationFrame(tween);
    const from = { a: lab.a, b: lab.b };
    const to = lab.initialLine;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 300;
    const start = performance.now();
    const frame = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - (1 - t) ** 3;
      lab.setLine(
        from.a + (to.a - from.a) * eased,
        from.b + (to.b - from.b) * eased,
        t < 1,
      );
      if (t < 1) tween = requestAnimationFrame(frame);
    };
    tween = requestAnimationFrame(frame);
  }

  onMount(() => () => {
    cancelAnimationFrame(tween);
  });

  function fmtX(value: number) {
    return formatNumber(value, xCol?.decimals ?? 1);
  }

  function fmtY(value: number) {
    return formatNumber(value, yCol?.decimals ?? 1);
  }
</script>

<LabShell label="Linear Regression Lab" highlight={lab.highlight}>
  {#snippet key()}
    <dl class="key">
      <div>
        <dt class="sym-a">a</dt>
        <dd>where the line starts: the {ds.words.y} at {ds.words.x} 0</dd>
      </div>
      <div>
        <dt class="sym-b">b</dt>
        <dd>the slope: growth for each extra {ds.words.xStep}</dd>
      </div>
      <div>
        <dt class="sym-error">e</dt>
        <dd>the miss: real {ds.words.y} minus prediction</dd>
      </div>
    </dl>
  {/snippet}

  {#snippet tools()}
    <Toggle
      label="Misses"
      role="error"
      mark="dotted"
      checked={lab.showMisses}
      onchange={(checked) => {
        lab.showMisses = checked;
      }}
    />
    <Toggle
      label="Best Line"
      role="best"
      mark="dashed"
      checked={lab.showBest}
      onchange={(checked) => {
        lab.showBest = checked;
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
      disabled={lab.a === lab.initialLine.a && lab.b === lab.initialLine.b}
      onclick={reset}
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
      <span class="tool-label">Reset Line</span>
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
        const symbol = symbolAt(event);
        if (symbol) lab.select({ kind: 'symbol', id: symbol });
      }}
      onpointerout={(event) => {
        const symbol = symbolAt(event);
        if (symbol) lab.release('symbol', symbol);
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      <p class="equation__live num" data-live="model">
        <span class="sym-line">ŷ</span> =
        <span class="sym-a" data-value="a"
          >{formatNumber(lab.a, aDecimals)}</span
        >
        +
        <span class="sym-b" data-value="b"
          >{formatNumber(lab.b, bDecimals)}</span
        >
        × {fmtX(liveX)} =
        <strong class="sym-line">{formatNumber(lab.at(liveX), 1)}</strong>
        {yCol?.unit}
      </p>
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-a"
        symbol="a"
        role="a"
        label="Intercept"
        value={lab.a}
        min={ds.params.a.min}
        max={ds.params.a.max}
        step={ds.params.a.step}
        onchange={(value) => {
          lab.setLine(value, lab.b);
        }}
        onfocuschange={(focused) => {
          highlightFromControl('a', focused);
        }}
      />
      <Slider
        id="slider-b"
        symbol="b"
        role="b"
        label="Slope"
        value={lab.b}
        min={ds.params.b.min}
        max={ds.params.b.max}
        step={ds.params.b.step}
        onchange={(value) => {
          lab.setLine(lab.a, value);
        }}
        onfocuschange={(focused) => {
          highlightFromControl('b', focused);
        }}
      />
      <div class="controls__metric">
        <MetricCard
          compact
          title="Typical miss"
          value={formatNumber(lab.typicalMiss, 1)}
          unit={yCol?.unit ?? ''}
          detail={`MSE ${formatNumber(lab.mse, 1)} ${yCol?.unit ?? ''}²`}
          position={lab.meter.position}
          label={lab.meter.label}
          offScale={lab.meter.offScale}
          best={lab.meter.label === 'Best possible'}
        />
      </div>
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`${ds.title}: ${lab.rows.length} ${ds.words.rows}.`}
        rows={lab.rows}
        {columns}
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'line' || symbol === 'error') {
            lab.select({ kind: 'symbol', id: symbol });
          } else {
            lab.release('symbol', lab.highlight ?? 'line');
          }
        }}
        describe={(row) =>
          `${ds.words.row} ${row.id}: ${xCol?.short ?? 'x'} ${fmtX(row.x)} ${xCol?.unit ?? ''}, ${yCol?.short ?? 'y'} ${fmtY(row.y)} ${yCol?.unit ?? ''}`}
      />
    </div>
  {/snippet}
</LabShell>

<PythonBox {lab} />

<style>
  /* The key to the symbols: small, one line each on wide screens. */
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-6);
    margin: 0;
    color: var(--c-muted);
    font-size: var(--fs-14);
    line-height: 1.5;
  }

  .key div {
    display: flex;
    gap: var(--s-2);
    align-items: baseline;
  }

  .key dt {
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: var(--fs-18);
    font-style: italic;
  }

  .key dd {
    margin: 0;
  }

  .tools__spacer {
    flex: 1;
  }

  /* Phones: the tools fit on one row; the buttons show only their icons
     (screen readers still hear the labels). */
  @container lab (width < 520px) {
    .tools__spacer {
      flex: 1 0 0;
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

  /* The smallest phones (320 px): no spacer element, slightly smaller
     buttons, so the row still fits. */
  @container lab (width < 340px) {
    .tools__spacer {
      display: none;
    }

    :global(.lab__tools .button) {
      width: 40px;
    }

    :global(.lab__tools .button:not(.button--quiet)) {
      margin-inline-start: auto;
    }
  }

  /* Two equations, stacked and centered under the graph. */
  .equation {
    display: grid;
    gap: var(--s-1);
    justify-items: center;
    text-align: center;
  }

  .equation__formula {
    font-size: var(--fs-16);
  }

  .equation__live {
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation :global(.sym-a),
  .equation :global(.sym-b),
  .equation :global(.sym-line),
  .equation :global(.sym-error) {
    border-radius: 3px;
    cursor: help;
    transition: background-color var(--dur-ui);
  }

  :global(.lab[data-highlight='a']) :global(.sym-a),
  :global(.lab[data-highlight='b']) :global(.sym-b),
  :global(.lab[data-highlight='line']) .equation :global(.sym-line),
  :global(.lab[data-highlight='error']) :global(.sym-error) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  /* a, b and the typical miss side by side. */
  .controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-6);
    align-items: center;
  }

  @container lab (width < 600px) {
    .key {
      flex-direction: column;
    }

    .controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--s-2) var(--s-4);
    }

    .controls__metric {
      grid-column: 1 / -1;
    }
  }
</style>
