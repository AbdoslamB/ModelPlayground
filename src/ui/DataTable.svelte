<!--
  A real <table> with sortable headers, live columns and linked selection.
  All rows are in the HTML, so the table reads without JavaScript.
  Keyboard: the table body is one tab stop; ↑/↓ move the selection, Esc clears.
-->
<script lang="ts" generics="R extends { id: number }">
  import type { TableColumn } from './table';

  import { formatNumber } from '../lib/format';

  interface Props {
    caption: string;
    rows: R[];
    columns: TableColumn<R>[];
    selectedId: number | null;
    onselect: (id: number | null) => void;
    onhighlight?: (symbol: string | null) => void;
    /** Describes a row for screen readers when it is selected by keyboard. */
    describe: (row: R) => string;
    /** Extra class for a row, e.g. to mark the rows that take part. */
    rowClass?: (row: R) => string | undefined;
    /** The column the table starts sorted by. */
    initialSort?: string;
  }

  let {
    caption,
    rows,
    columns,
    selectedId,
    onselect,
    onhighlight,
    describe,
    rowClass,
    initialSort,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let sortKey = $state<string | null>(initialSort ?? null);
  let descending = $state(false);
  let announcement = $state('');
  let scroller: HTMLDivElement | undefined = $state();

  const sorted = $derived.by(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column) return rows;
    const direction = descending ? -1 : 1;
    return [...rows].sort(
      (p, q) => direction * (column.value(p) - column.value(q)) || p.id - q.id,
    );
  });

  function sortBy(key: string) {
    if (sortKey === key) descending = !descending;
    else {
      sortKey = key;
      descending = false;
    }
  }

  function ariaSort(key: string) {
    if (sortKey !== key) return 'none';
    return descending ? 'descending' : 'ascending';
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onselect(null);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = sorted.findIndex((r) => r.id === selectedId);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex =
      index === -1 ? 0 : Math.min(sorted.length - 1, Math.max(0, index + step));
    const next = sorted[nextIndex];
    if (!next) return;
    onselect(next.id);
    announcement = describe(next);
  }
</script>

<div class="table">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="table__scroll"
    bind:this={scroller}
    tabindex="0"
    role="region"
    aria-label={`${caption} Use the up and down arrow keys to move between rows.`}
    onkeydown={onKey}
    onfocusout={(event) => {
      if (!scroller?.contains(event.relatedTarget as Node | null)) {
        announcement = '';
      }
    }}
  >
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {#each columns as column (column.key)}
            <th
              scope="col"
              aria-sort={ariaSort(column.key)}
              class={column.role}
              onpointerenter={() =>
                column.highlight && onhighlight?.(column.highlight)}
              onpointerleave={() => column.highlight && onhighlight?.(null)}
            >
              <button
                type="button"
                class="table__sort"
                onclick={() => {
                  sortBy(column.key);
                }}
              >
                <span>{column.header}</span>
                {#if column.unit}
                  <span class="table__unit">({column.unit})</span>
                {/if}
                <span class="table__arrow" aria-hidden="true">
                  {sortKey === column.key ? (descending ? '↓' : '↑') : '↕'}
                </span>
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sorted as row (row.id)}
          <tr
            class={rowClass?.(row)}
            data-row={row.id}
            data-selected={row.id === selectedId ? '' : undefined}
            onpointerenter={(event) => {
              if (event.pointerType === 'mouse') onselect(row.id);
            }}
            onpointerleave={(event) => {
              if (event.pointerType === 'mouse' && row.id === selectedId) {
                onselect(null);
              }
            }}
            onclick={(event) => {
              // A mouse already selected the row on hover; a tap toggles it.
              const isMouse = event.pointerType === 'mouse';
              onselect(!isMouse && row.id === selectedId ? null : row.id);
            }}
          >
            {#each columns as column (column.key)}
              <td class={column.role}>
                <span class="num"
                  >{column.text
                    ? column.text(row)
                    : formatNumber(column.value(row), column.decimals)}</span
                >
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="visually-hidden" aria-live="polite">{announcement}</p>
</div>

<style>
  .table__scroll {
    overflow-x: auto;
  }

  .table__scroll:focus-visible {
    outline-offset: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-16);
  }

  caption {
    padding-block-end: var(--s-2);
    color: var(--c-muted);
    font-size: var(--fs-14);
    text-align: start;
  }

  th {
    padding: 0;
    border-block-end: 1px solid var(--c-control-edge);
    font-weight: 600;
    text-align: end;
    white-space: nowrap;
  }

  th:first-child,
  td:first-child {
    text-align: start;
  }

  .table__sort {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
    justify-content: flex-end;
    width: 100%;
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 0;
    background: transparent;
    color: inherit;
    font-weight: 600;
  }

  th:first-child .table__sort {
    justify-content: flex-start;
    padding-inline-start: var(--s-2);
  }

  .table__unit {
    color: var(--c-muted);
    font-weight: 400;
  }

  .table__arrow {
    color: var(--c-muted);
    font-size: var(--fs-12);
  }

  td {
    padding: var(--s-2) var(--s-3);
    border-block-end: 1px solid var(--c-hairline);
    text-align: end;
    white-space: nowrap;
  }

  td:first-child {
    padding-inline-start: var(--s-2);
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: var(--c-surface-sunken);
  }

  /* Rows that take part, e.g. the neighbours that vote. */
  tbody tr:global(.is-active) td {
    font-weight: 700;
  }

  tbody tr:global(.is-active) td:first-child {
    box-shadow: inset 3px 0 0 var(--c-line);
  }

  tbody tr[data-selected] {
    background: var(--c-highlight);
    box-shadow: inset 3px 0 0 var(--c-data);
  }

  td.sym-line,
  th.sym-line {
    color: var(--c-line-ink);
  }

  td.sym-error,
  th.sym-error {
    color: var(--c-error-ink);
  }

  :global(.lab[data-highlight='line']) td.sym-line,
  :global(.lab[data-highlight='error']) td.sym-error {
    background: var(--c-highlight);
  }
</style>
