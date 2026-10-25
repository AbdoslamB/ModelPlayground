<!--
  The Lab every model page is built around, in one centered column: a short
  key to the symbols, the tools, the graph on its own, the equations under it,
  then the controls and the metric side by side, and the data table. The
  model fills it through snippets; the shell owns the layout. It sits directly
  on the page, with no card of its own.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** Symbol highlighted across all views, e.g. "a". */
    highlight: string | null;
    /** A short key to the symbols, above the graph. */
    key: Snippet;
    tools: Snippet;
    graph: Snippet;
    /** The equations, right under the graph. */
    equation: Snippet;
    /** Parameter controls and the metric, side by side. */
    controls: Snippet;
    table: Snippet;
  }

  let {
    label,
    highlight,
    key,
    tools,
    graph,
    equation,
    controls,
    table,
  }: Props = $props();
</script>

<section class="lab" aria-label={label} data-highlight={highlight ?? undefined}>
  <div class="lab__key">{@render key()}</div>
  <div class="lab__tools">{@render tools()}</div>
  <div class="lab__graph">{@render graph()}</div>
  <div class="lab__equation">{@render equation()}</div>
  <div class="lab__controls">{@render controls()}</div>
  <div class="lab__table">{@render table()}</div>
</section>

<style>
  .lab {
    container: lab / inline-size;
    display: grid;
    gap: var(--s-4);
  }

  .lab__tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-2);
    align-items: center;
  }

  .lab__graph,
  .lab__equation,
  .lab__controls,
  .lab__table {
    min-width: 0;
  }

  .lab__table {
    margin-block-start: var(--s-4);
  }

  @container lab (width < 520px) {
    .lab__tools {
      gap: var(--s-1) 6px;
    }
  }

  /* Without JavaScript the controls do nothing, so they are hidden. */
  :global(html:not(.js)) .lab__tools,
  :global(html:not(.js)) .lab__controls {
    display: none;
  }
</style>
