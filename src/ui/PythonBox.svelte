<!--
  "Try it in Python": the Lab's state as short Python programs, which run in
  the browser. Each model passes its programs (one per tab; the first opens
  first). Collapsed by default, and the choice is remembered. This part is
  small and on every model page; the tabs, editor and Run (PythonPanel) are
  downloaded only when the section is first opened. Until then, and without
  JavaScript, a plain text box shows the first program.
-->
<script lang="ts">
  import type { Component } from 'svelte';

  import { onMount } from 'svelte';

  import type { PythonProgram } from '../lib/python';

  import { readFlag, writeFlag } from '../lib/storage';

  interface Props {
    /** One per tab; with a single program the tab bar is left out. */
    programs: PythonProgram[];
    /** A sentence or two above the code: what it does. */
    lead: string;
  }

  let { programs, lead }: Props = $props();

  let open = $state(false);
  /** False until the page's JavaScript runs: without it, the code shows. */
  let started = $state(false);
  let Panel: Component<{ programs: PythonProgram[] }> | null = $state.raw(null);

  async function loadPanel() {
    if (Panel) return;
    try {
      Panel = (await import('./PythonPanel.svelte')).default;
    } catch {
      // Offline or blocked: the code can still be read.
    }
  }

  onMount(() => {
    open = readFlag('python-open') === 'open';
    started = true;
    if (open) void loadPanel();
  });

  const first = $derived(programs[0]?.code ?? '');
</script>

<details
  class="py"
  {open}
  ontoggle={(event) => {
    open = event.currentTarget.open;
    writeFlag('python-open', open ? 'open' : 'closed');
    if (open) void loadPanel();
  }}
>
  <summary class="py__summary">
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    Try it in Python
  </summary>

  <div class="py__body">
    <p class="py__lead">{lead}</p>
    {#if Panel}
      <Panel {programs} />
    {:else if open || !started}
      <!-- While closed, the code is not built: the Lab can change every frame. -->
      <label class="visually-hidden" for="py-code">Python code</label>
      <textarea
        id="py-code"
        class="py__code"
        readonly
        rows={first.split('\n').length}
        wrap="off"
        spellcheck="false">{first}</textarea
      >
    {/if}
  </div>
</details>

<style>
  .py {
    margin-block-start: var(--s-8);
    border-block: 1px solid var(--c-hairline);
  }

  .py__summary {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    min-height: 48px;
    font-size: var(--fs-18);
    font-weight: 600;
    cursor: pointer;
  }

  .py__summary::marker {
    color: var(--c-muted);
  }

  .py__body {
    display: grid;
    /* Long code lines scroll inside the box, never widen the page. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-3);
    padding-block-end: var(--s-6);
  }

  .py__lead {
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .py__code {
    display: block;
    width: 100%;
    padding: var(--s-3);
    border: 1px solid var(--c-hairline);
    border-radius: var(--radius-control);
    background: var(--c-surface-sunken);
    color: var(--c-text);
    font-family: var(--font-code);
    font-size: var(--fs-14);
    line-height: 1.55;
    tab-size: 4;
    resize: vertical;
  }

  .py__code:focus-visible {
    outline: 2px solid var(--c-focus);
    outline-offset: 1px;
  }
</style>
