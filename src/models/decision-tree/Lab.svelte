<!--
  The Decision Tree Lab: the one island on the page. Graph, equation and
  table are linked through one selection, like every model's Lab.
-->
<script lang="ts">
  import type { TableColumn } from '../../ui/table';
  import type { Dataset } from './data';
  import type { Row, TreeNode } from './math';

  import LabShell from '../../lab/LabShell.svelte';
  import { formatNumber } from '../../lib/format';
  import DataTable from '../../ui/DataTable.svelte';
  import MetricCard from '../../ui/MetricCard.svelte';
  import Slider from '../../ui/Slider.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import { TreeLab } from './store.svelte';
  import Graph from './views/Graph.svelte';

  interface Props {
    dataset: Dataset;
    /** KaTeX HTML of the Gini formula, rendered at build time. */
    formula: string;
  }

  let { dataset, formula }: Props = $props();

  // svelte-ignore state_referenced_locally
  const lab = new TreeLab(dataset);

  const node = $derived(lab.focusNode);
  const total = $derived(lab.rows.length);

  function columnOf(feature: 'x' | 'y') {
    return feature === 'x' ? lab.xColumn : lab.yColumn;
  }

  /** "Temp ≤ 19 °C" or "Temp > 19 °C". */
  function condition(feature: 'x' | 'y', threshold: number, yes: boolean) {
    const col = columnOf(feature);
    return `${col?.short ?? feature} ${yes ? '≤' : '>'} ${formatNumber(threshold, 1)} ${col?.unit ?? ''}`;
  }

  /** The questions answered on the way down to a node. */
  function describe(target: TreeNode): string {
    const parts: string[] = [];
    let at: TreeNode | undefined = lab.tree;
    for (const step of target.path) {
      if (!at?.split) break;
      parts.push(condition(at.split.feature, at.split.threshold, step === 'L'));
      at = step === 'L' ? at.left : at.right;
    }
    return parts.length ? parts.join(', ') : 'every day';
  }

  function share(count: number, n: number) {
    return formatNumber(n ? count / n : 0, 2);
  }

  const columns: TableColumn<Row>[] = $derived([
    { key: 'id', header: '#', decimals: 0, value: (r: Row) => r.id },
    {
      key: 'x',
      header: lab.xColumn?.short ?? 'x',
      unit: lab.xColumn?.unit,
      decimals: 0,
      value: (r: Row) => r.x,
    },
    {
      key: 'y',
      header: lab.yColumn?.short ?? 'y',
      unit: lab.yColumn?.unit,
      decimals: 0,
      value: (r: Row) => r.y,
    },
    {
      key: 'day',
      header: 'Day',
      decimals: 0,
      value: (r: Row) => lab.classIndex(r.label),
      text: (r: Row) => lab.classInfo(r.label)?.short ?? r.label,
    },
    {
      key: 'leaf',
      header: 'Leaf',
      decimals: 0,
      value: (r: Row) => lab.leafNumber[lab.leafById[r.id]?.path ?? ''] ?? 0,
    },
    {
      key: 'says',
      header: 'Tree says',
      decimals: 0,
      value: (r: Row) => lab.classIndex(lab.leafById[r.id]?.prediction ?? ''),
      text: (r: Row) => {
        const says = lab.leafById[r.id]?.prediction ?? '';
        return `${lab.classInfo(says)?.short ?? says}${says === r.label ? '' : ' ✗'}`;
      },
    },
  ]);
</script>

<LabShell label="Decision Tree Lab" highlight={lab.highlight}>
  {#snippet key()}
    <ul class="key">
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><circle cx="7" cy="7" r="5.5" fill="var(--c-class-1)" /></svg
        >beach day
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><path d="M7 1.5 13 12.5H1Z" fill="var(--c-class-2)" /></svg
        >stay home
      </li>
      <li>
        <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"
          ><rect
            x="1"
            y="1"
            width="16"
            height="12"
            rx="2"
            fill="none"
            stroke="var(--c-focus)"
            stroke-width="2"
            stroke-dasharray="4 3"
          /></svg
        >node in focus: drag its line
      </li>
      <li><span class="key__sym sym-line">G</span>impurity</li>
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
      disabled={Object.keys(lab.chosen).length === 0 &&
        lab.focus === '' &&
        lab.depth === dataset.depths.initial}
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
      <span class="tool-label">Reset Tree</span>
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
          lab.select({ kind: 'symbol', id: 'G' });
        }
      }}
      onpointerout={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.sym-line')
        ) {
          lab.release('symbol', 'G');
        }
      }}
    >
      <div class="equation__formula">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KaTeX output built from our own TeX at build time -->
        {@html formula}
      </div>
      <p class="equation__live num" data-live="gini">
        <span class="equation__note">In focus: {describe(node)}.</span>
        {node.rows.length} days:
        {#each lab.classes as id, i (id)}
          {i > 0 ? ', ' : ''}<span class={`sym-class-${i + 1}`}
            >{node.counts[i]} {lab.classInfo(id)?.name}</span
          >
        {/each}
        → <span class="sym-line">G</span> = 1 − ({#each node.counts as count, i (i)}{i >
          0
            ? ' + '
            : ''}{share(count, node.rows.length)}²{/each}) =
        <strong class="sym-line">{formatNumber(node.gini, 2)}</strong>
      </p>
      {#if node.split && node.left && node.right}
        {@const n = node.rows.length}
        <p class="equation__live num" data-live="gain">
          Split {condition(node.split.feature, node.split.threshold, true)}:
          gain = {formatNumber(node.gini, 2)} − ({node.left.rows.length}/{n} × {formatNumber(
            node.left.gini,
            2,
          )} + {node.right.rows.length}/{n} × {formatNumber(
            node.right.gini,
            2,
          )}) =
          <strong>{formatNumber(node.gain ?? 0, 2)}</strong>
        </p>
      {:else}
        <p class="equation__live equation__note" data-live="gain">
          {node.gini === 0
            ? 'Every day here is the same kind, so this leaf needs no question.'
            : 'The tree may not grow deeper here: raise the depth to split it.'}
        </p>
      {/if}
      {#if lab.canSplit}
        <div
          class="options"
          role="group"
          aria-label="Split the node in focus on"
        >
          {#each lab.options as option (option.feature)}
            {#if option.best}
              <button
                type="button"
                class="option"
                aria-pressed={node.split?.feature === option.feature}
                onclick={() => {
                  lab.chooseFeature(option.feature);
                }}
              >
                Best on {columnOf(option.feature)?.label.toLowerCase()}:
                <span class="num"
                  >≤ {formatNumber(option.best.split.threshold, 1)}, gain {formatNumber(
                    option.best.gain,
                    2,
                  )}</span
                >
              </button>
            {/if}
          {/each}
        </div>
      {/if}
      <p class="equation__leaves num" data-live="leaves">
        All {lab.leaves.length} leaves, weighted by size:
        <span class="sym-line">G</span> = {formatNumber(lab.impurity, 2)}
      </p>
    </div>
  {/snippet}

  {#snippet controls()}
    <div class="controls">
      <Slider
        id="slider-depth"
        symbol="d"
        role="a"
        label="Maximum depth: how many questions in a row the tree may ask"
        value={lab.depth}
        min={dataset.depths.min}
        max={dataset.depths.max}
        step={dataset.depths.step}
        onchange={(value) => {
          lab.setDepth(value);
        }}
        onfocuschange={(focused) => {
          if (focused) lab.select({ kind: 'symbol', id: 'depth' });
          else lab.release('symbol', 'depth');
        }}
      />
      <MetricCard
        compact
        tone="score"
        title="Right on its own data"
        value={`${lab.right} of ${total}`}
        unit=""
        detail=""
        position={total ? lab.right / total : 0}
        label={`Depth ${lab.depth}: ${formatNumber((100 * lab.right) / Math.max(1, total), 0)}% right`}
        offScale={false}
        best={false}
      />
    </div>
  {/snippet}

  {#snippet table()}
    <div data-view="table">
      <DataTable
        caption={`${dataset.title}: ${total} days, and the leaf each one lands in.`}
        rows={lab.rows}
        {columns}
        rowClass={(row) =>
          node.path !== '' && lab.leafById[row.id]?.path.startsWith(node.path)
            ? 'is-active'
            : undefined}
        selectedId={lab.selectedRow?.id ?? null}
        onselect={(id) => {
          lab.select(
            id === null ? null : { kind: 'item', id, source: 'table' },
          );
        }}
        describe={(row) => {
          const leaf = lab.leafById[row.id];
          return `Day ${row.id}: ${row.x} ${lab.xColumn?.unit ?? ''}, ${row.y} ${lab.yColumn?.unit ?? ''}, ${lab.classInfo(row.label)?.name ?? row.label}. Leaf ${lab.leafNumber[leaf?.path ?? ''] ?? ''} says ${lab.classInfo(leaf?.prediction ?? '')?.name ?? ''}.`;
        }}
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

  .equation__live {
    font-size: var(--fs-16);
    font-weight: 500;
  }

  .equation__note {
    display: block;
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 400;
  }

  .equation__leaves {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    justify-content: center;
    margin-block: var(--s-1);
  }

  .option {
    min-height: 36px;
    padding: 2px var(--s-3);
    border: 1px solid var(--c-hairline);
    border-radius: 999px;
    background: var(--c-surface);
    color: var(--c-text);
    font-size: var(--fs-14);
  }

  .option[aria-pressed='true'] {
    border-color: var(--c-focus);
    box-shadow: inset 0 0 0 1px var(--c-focus);
    font-weight: 600;
  }

  .equation :global(.sym-line) {
    border-radius: 3px;
    cursor: help;
  }

  :global(.lab[data-highlight='G']) .equation :global(.sym-line) {
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
