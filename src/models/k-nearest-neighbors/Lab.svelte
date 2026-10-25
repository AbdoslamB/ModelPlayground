<!--
  The k-Nearest Neighbors Lab: the one island on the page. Graph, equation and
  table are linked through one selection, like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset, Row } from './data';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import PythonBox from '../../ui/PythonBox.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import { plainPython, sklearnPython } from './python';
  import { KnnLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the distance formula, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new KnnLab(dataset);

  const voterIds = $derived(lab.voters.map((v) => v.row.id));
  /** The fruit the distance line explains: the selected one, or the nearest. */
  const shown = $derived(
    (lab.selectedRow && lab.rankById[lab.selectedRow.id]) ?? lab.ranked[0],
  );
  const total = $derived(lab.rows.length);

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
      key: 'kind',
      header: 'Kind',
      decimals: 0,
      value: (r: Row) => lab.classIndex(r.label),
      text: (r: Row) => lab.classInfo(r.label)?.name ?? r.label,
    },
    {
      key: 'd',
      header: 'd: distance',
      unit: 'cm',
      decimals: 2,
      role: 'sym-line',
      highlight: 'd',
      value: (r: Row) => lab.rankById[r.id]?.distance ?? NaN,
    },
    {
      key: 'vote',
      header: 'Votes?',
      decimals: 0,
      value: (r: Row) => (voterIds.includes(r.id) ? 0 : 1),
      text: (r: Row) => (voterIds.includes(r.id) ? 'yes' : '–'),
    },
  ]);

  function plural(id: string, count: number) {
    const info = lab.classInfo(id);
    return count === 1 ? (info?.name ?? id) : (info?.plural ?? id);
  }

  const fmt = (value: number) => formatNumber(value, 1);

  // "Try it in Python", with the Lab's fruits, new fruit and k.
  const python = $derived.by(() => {
    const data = {
      title: dataset.title,
      rows: lab.rows,
      query: lab.query,
      k: lab.k,
    };
    return [
      { id: 'sklearn', label: 'With scikit-learn', code: sklearnPython(data) },
      { id: 'plain', label: 'Plain Python', code: plainPython(data) },
    ];
  });
</script>

<LabShell label="k-Nearest Neighbors Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><circle cx="7" cy="7" r="5.5" fill="var(--c-class-1)" /></svg
        >apple
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><path d="M7 1.5 13 12.5H1Z" fill="var(--c-class-2)" /></svg
        >pear
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><path
            d="M7 1 13 7 7 13 1 7Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          /></svg
        >new fruit: drag it, or tap the graph
      </li>
      <li>
        <span class="key__sym sym-line">k</span>how many nearest fruits vote
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
      disabled={lab.query.x === dataset.start.x &&
        lab.query.y === dataset.start.y}
      onclick={() => {
        lab.resetQuery();
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
      <span class="tool-label">Reset Fruit</span>
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
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.select({ kind: 'symbol', id: 'd' });
        }
      }}
      onpointerout={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.release('symbol', 'd');
        }
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      {#if shown}
        <p class="equation__live num" data-live="distance">
          <span class="sym-line">d</span> = √(({fmt(shown.row.x)} − {fmt(
            lab.query.x,
          )})² + ({fmt(shown.row.y)} − {fmt(lab.query.y)})²) =
          <strong class="sym-line">{formatNumber(shown.distance, 2)}</strong> cm
          <span class="equation__note">
            to {lab.classInfo(shown.row.label)?.name}
            {shown.row.id}{lab.selectedRow ? '' : ', the nearest'}
          </span>
        </p>
      {/if}
      <p class="equation__vote" data-live="vote">
        <span class="sym-line">k</span> = {lab.k} nearest:
        {#each Object.entries(lab.vote.counts) as [id, count], index (id)}
          {index > 0 ? ', ' : ''}<span class={`sym-class-${lab.classIndex(id)}`}
            >{count} {plural(id, count)}</span
          >
        {/each}
        →
        <strong class={`sym-class-${lab.classIndex(lab.prediction)}`}
          >{lab.classInfo(lab.prediction)?.name}</strong
        >
      </p>
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-k"
        symbol="k"
        role="line"
        label="k, the number of neighbours that vote"
        value={lab.k}
        min={dataset.ks[0] ?? 1}
        max={dataset.ks.at(-1) ?? 9}
        step={2}
        onchange={(value) => {
          lab.setK(value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'k' });
          else lab.release('symbol', 'k');
        }}
      />
      <MetricCard
        compact
        tone="score"
        title="Right on its own data"
        value={`${lab.score} of ${total}`}
        unit=""
        detail=""
        position={total ? lab.score / total : 0}
        label={`${formatNumber((100 * lab.score) / Math.max(1, total), 0)}% right`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`${dataset.title}: ${total} fruits, nearest to the new fruit first.`}
        rows={lab.rows}
        {columns}
        initialSort="d"
        rowClass={(row) =>
          voterIds.includes(row.id) ? 'is-active' : undefined}
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'd') lab.select({ kind: 'symbol', id: 'd' });
          else lab.release('symbol', 'd');
        }}
        describe={(row) =>
          `${lab.classInfo(row.label)?.name ?? row.label} ${row.id}: ${fmt(row.x)} by ${fmt(row.y)} cm, ${formatNumber(lab.rankById[row.id]?.distance ?? NaN, 2)} cm away${voterIds.includes(row.id) ? ', votes' : ''}`}
      />
    </div>
  {/snippet}
</LabShell>

<PythonBox
  programs={python}
  lead={`The same ${total} fruits, new fruit and k as the Lab, in a few lines of Python. Plain Python measures every distance and counts the votes by hand.`}
/>

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

  .key__sym {
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: var(--fs-18);
    font-style: italic;
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
    font-size: var(--fs-16);
  }

  .equation__live,
  .equation__vote {
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__note {
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 400;
  }

  .equation :global(.sym-line) {
    border-radius: 3px;
    cursor: help;
  }

  :global(.lab[data-highlight='d']) .equation :global(.sym-line) {
    background: var(--c-highlight);
    box-shadow: inset 0 -2px 0 currentcolor;
  }

  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--s-6);
    align-items: center;
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
