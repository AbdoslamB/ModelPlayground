<!--
  The Random Forest Lab: the one island on the page. Graph, equation and
  table are linked through one selection (a tree), like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Tree } from './math';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import PythonBox from '../../ui/PythonBox.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import { coverage, questionCount } from './math';
  import { plainPython, sklearnPython } from './python';
  import { ForestLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the vote formula, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new ForestLab(dataset);

  const n = $derived(lab.rows.length);
  /** The tree the second line explains: the selected one, or tree 1. */
  const shown = $derived(lab.selectedTree ?? lab.trees[0]);
  const shownCoverage = $derived(shown ? coverage(shown, n) : undefined);
  const share = $derived(
    lab.trees.length
      ? (lab.tally.counts[lab.classIndex(lab.prediction) - 1] ?? 0) /
          lab.trees.length
      : 0,
  );

  const columns: TableColumn<Tree>[] = $derived([
    { key: 'id', header: 'Tree', decimals: 0, value: (t: Tree) => t.id },
    {
      key: 'seen',
      header: 'Seeds seen',
      decimals: 0,
      value: (t: Tree) => coverage(t, n).seen,
    },
    {
      key: 'left',
      header: 'Left out',
      decimals: 0,
      value: (t: Tree) => coverage(t, n).left,
    },
    {
      key: 'questions',
      header: 'Questions',
      decimals: 0,
      value: (t: Tree) => questionCount(t.root),
    },
    {
      key: 'vote',
      header: 'Votes',
      decimals: 0,
      highlight: 'T',
      value: (t: Tree) => lab.classIndex(lab.votes[t.id] ?? ''),
      text: (t: Tree) => lab.classInfo(lab.votes[t.id] ?? '')?.short ?? '',
    },
  ]);

  // "Try it in Python", with the Lab's seeds, forest and new seed.
  const python = $derived.by(() => {
    const data = {
      title: dataset.title,
      rows: lab.rows,
      classes: lab.classes,
      names: [
        lab.xColumn?.label.toLowerCase() ?? 'x',
        lab.yColumn?.label.toLowerCase() ?? 'y',
      ] as const,
      units: [lab.xColumn?.unit ?? '', lab.yColumn?.unit ?? ''] as const,
      query: lab.query,
      size: lab.size,
      forestSeed: lab.forestSeed,
      maxDepth: dataset.maxDepth,
    };
    return [
      { id: 'sklearn', label: 'With scikit-learn', code: sklearnPython(data) },
      { id: 'plain', label: 'Plain Python', code: plainPython(data) },
    ];
  });
</script>

<LabShell label="Random Forest Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><circle cx="7" cy="7" r="5.5" fill="var(--c-class-2)" /></svg
        >sprouts
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><path d="M7 1.5 13 12.5H1Z" fill="var(--c-class-1)" /></svg
        >stays dry
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><path
            d="M7 1 13 7 7 13 1 7Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          /></svg
        >new seed: drag it, or tap the graph
      </li>
      <li><span class="key__sym sym-line">T</span>how many trees vote</li>
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
      class="button"
      onclick={() => {
        lab.newForest();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1.5 3 8h3l-2 4h8l-2-4h3Z M8 12v2.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
      <span class="tool-label">New Forest</span>
    </button>
    <button
      type="button"
      class="button button--quiet"
      disabled={lab.query.x === dataset.start.x &&
        lab.query.y === dataset.start.y &&
        lab.size === dataset.trees.initial &&
        lab.forestSeed === 1}
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
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.select({ kind: 'symbol', id: 'T' });
        }
      }}
      onpointerout={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.release('symbol', 'T');
        }
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      <p class="equation__live num" data-live="vote">
        <span class="sym-line">T</span> = {lab.trees.length}
        {lab.trees.length === 1 ? 'tree' : 'trees'}:
        {#each lab.classes as id, i (id)}
          {i > 0 ? ', ' : ''}<span class={`sym-class-${i + 1}`}
            >{lab.tally.counts[i]} {lab.classInfo(id)?.short}</span
          >
        {/each}
        →
        <strong class={`sym-class-${lab.classIndex(lab.prediction)}`}
          >{lab.classInfo(lab.prediction)?.name}</strong
        >
        ({formatNumber(100 * share, 0)}% of the votes)
      </p>
      {#if shown && shownCoverage}
        <p class="equation__tree num" data-live="tree">
          Tree {shown.id} drew {n} seeds at random, with repeats: it saw {shownCoverage.seen}
          different seeds and never saw {shownCoverage.left}. It says
          <strong
            class={`sym-class-${lab.classIndex(lab.votes[shown.id] ?? '')}`}
            >{lab.classInfo(lab.votes[shown.id] ?? '')?.short}</strong
          >.
        </p>
      {/if}
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-trees"
        symbol="T"
        role="line"
        label="T, the number of trees that vote"
        value={lab.size}
        min={dataset.trees.min}
        max={dataset.trees.max}
        step={dataset.trees.step}
        onchange={(value) => {
          lab.setSize(value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'T' });
          else lab.release('symbol', 'T');
        }}
      />
      <MetricCard
        compact
        tone="score"
        title="Right on unseen seeds"
        value={`${lab.outOfBag.right} of ${lab.outOfBag.judged}`}
        unit=""
        detail=""
        position={lab.outOfBag.judged
          ? lab.outOfBag.right / lab.outOfBag.judged
          : 0}
        label={lab.outOfBag.judged
          ? `${formatNumber((100 * lab.outOfBag.right) / lab.outOfBag.judged, 0)}% right`
          : 'Every tree saw every seed'}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`The ${lab.trees.length} trees: what each one learned from, and its vote for the new seed.`}
        rows={lab.trees}
        {columns}
        rowClass={(t) =>
          lab.votes[t.id] === lab.prediction ? 'is-active' : undefined}
        selectedId={lab.selectedTree?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        onhighlight={(symbol) => {
          if (symbol === 'T') lab.select({ kind: 'symbol', id: 'T' });
          else lab.release('symbol', 'T');
        }}
        describe={(t) => {
          const c = coverage(t, n);
          return `Tree ${t.id}: saw ${c.seen} different seeds, left out ${c.left}, asks ${questionCount(t.root)} questions, votes ${lab.classInfo(lab.votes[t.id] ?? '')?.short ?? ''}`;
        }}
      />
    </div>
  {/snippet}
</LabShell>

<PythonBox
  programs={python}
  lead={`The same ${lab.rows.length} seeds, trees and new seed as the Lab, in Python. Plain Python uses the Lab's own random numbers, so it grows the Lab's exact trees; scikit-learn makes its own random choices.`}
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
    max-width: 100%;
    overflow-x: auto;
    font-size: var(--fs-16);
  }

  .equation__live {
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__tree {
    max-width: 52ch;
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .equation :global(.sym-line) {
    border-radius: 3px;
    cursor: help;
  }

  :global(.lab[data-highlight='T']) .equation :global(.sym-line) {
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
