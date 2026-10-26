<!--
  The open "Try it in Python" section: tabs, the code editor, Reset and Run,
  and the output. PythonBox downloads this only when the section is first
  opened. The code follows the Lab until the learner edits it; Reset brings
  the Lab's version back. The code editor (CodeMirror) loads with it, and
  Python only on the first Run; until the editor is ready, a plain text box
  shows the code.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { PythonProgram } from '../lib/python';
  import type { Editor } from './codeEditor';

  import { runPython } from '../lib/python';

  interface Props {
    /** One per tab; with a single program the tab bar is left out. */
    programs: PythonProgram[];
    /** Prefix of the element ids, so a page can hold more than one. */
    name?: string;
  }

  let { programs, name = 'py' }: Props = $props();

  // svelte-ignore state_referenced_locally
  let tab = $state(programs[0]?.id ?? '');
  /** The learner's edits, per tab; missing follows the Lab. */
  let drafts = $state<Record<string, string | undefined>>({});
  let running = $state(false);
  let result = $state<{ output: string; error: string | null } | null>(null);
  let host: HTMLDivElement | undefined = $state();
  /** Esc hides the tooltips until the pointer or focus moves on. */
  let tipsHidden = $state(false);
  let editor: Editor | null = $state.raw(null);
  let loading = false;

  const generated = $derived(
    programs.find((p) => p.id === tab)?.code ?? programs[0]?.code ?? '',
  );
  const code = $derived(drafts[tab] ?? generated);
  const edited = $derived(drafts[tab] !== undefined);
  const lines = $derived(code.split('\n').length);

  /** Loads the code editor; the panel only exists once opened. */
  async function loadEditor() {
    if (editor || loading || !host) return;
    loading = true;
    try {
      const { createEditor } = await import('./codeEditor');
      if (!host) return;
      editor = createEditor(host, {
        text: code,
        label: 'Python code',
        onChange: (text) => {
          drafts = { ...drafts, [tab]: text };
        },
        onRun: () => {
          void run();
        },
      });
    } catch {
      // Offline or blocked: the plain text box keeps working.
    } finally {
      loading = false;
    }
  }

  // The editor follows the code: the Lab moving, a new tab, or Reset.
  $effect(() => {
    editor?.setText(code);
  });

  onMount(() => {
    void loadEditor();
    return () => {
      editor?.destroy();
    };
  });

  async function run() {
    if (running) return;
    running = true;
    result = null;
    result = await runPython(code, () => undefined);
    running = false;
  }

  function reset() {
    drafts = { ...drafts, [tab]: undefined };
    result = null;
  }
</script>

<div class="py__panel">
  {#if programs.length > 1}
    <div class="py__tabs" role="tablist" aria-label="Version of the code">
      {#each programs as t (t.id)}
        <button
          type="button"
          role="tab"
          id={`${name}-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`${name}-panel`}
          class="py__tab"
          onclick={() => {
            tab = t.id;
            result = null;
          }}
        >
          {t.label}
        </button>
      {/each}
    </div>
  {/if}

  <div
    id={`${name}-panel`}
    role={programs.length > 1 ? 'tabpanel' : undefined}
    aria-labelledby={programs.length > 1 ? `${name}-tab-${tab}` : undefined}
  >
    <div class="py__editor" bind:this={host} hidden={!editor}></div>
    <label class="visually-hidden" for={`${name}-code`}>Python code</label>
    <textarea
      hidden={editor !== null}
      id={`${name}-code`}
      class="py__code"
      rows={lines}
      wrap="off"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      value={code}
      oninput={(event) => {
        drafts = { ...drafts, [tab]: event.currentTarget.value };
      }}
      onkeydown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void run();
        }
      }}></textarea>
    {#if edited}
      <p class="py__note">
        Your edits are kept while the Lab changes. Reset brings back the Lab's
        data.
      </p>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="py__actions"
      class:py__actions--quiet={tipsHidden}
      onkeydown={(event) => {
        if (event.key === 'Escape') tipsHidden = true;
      }}
      onpointerleave={() => {
        tipsHidden = false;
      }}
      onfocusout={() => {
        tipsHidden = false;
      }}
    >
      <span class="tip-wrap">
        <button
          type="button"
          class="pill"
          disabled={!edited && !result}
          aria-describedby={`${name}-tip-reset`}
          onclick={reset}
        >
          Reset
        </button>
        <span class="tip" role="tooltip" id={`${name}-tip-reset`}>
          Erase your changes and go back to the Lab's code
        </span>
      </span>
      <span class="visually-hidden" aria-live="polite"
        >{running ? 'Processing' : ''}</span
      >
      <span class="tip-wrap">
        <button
          type="button"
          class="pill"
          class:pill--busy={running}
          disabled={running}
          aria-describedby={`${name}-tip-run`}
          onclick={() => {
            void run();
          }}
        >
          {#if running}
            Processing<span class="dots" aria-hidden="true"
              ><span>.</span><span>.</span><span>.</span></span
            >
          {:else}
            Run
          {/if}
        </button>
        <span class="tip tip--end" role="tooltip" id={`${name}-tip-run`}>
          Execute your current code and see what happens.
        </span>
      </span>
    </div>

    <!-- Results appear only after a run. -->
    <div class="py__results" aria-live="polite">
      {#if result}
        {#if result.output || !result.error}
          <h3 class="py__heading">Output</h3>
          <pre class="py__card py__output">{result.output ||
              'The code ran, but printed nothing.'}</pre>
        {/if}
        {#if result.error}
          <h3 class="py__heading">Error</h3>
          <pre class="py__card py__card--error py__error">{result.error}</pre>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .py__panel {
    display: grid;
    /* Long code lines scroll inside the editor, never widen the page. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-3);
  }

  .py__note {
    margin-block-start: var(--s-2);
    color: var(--c-muted);
    font-size: var(--fs-14);
  }

  .py__tabs {
    display: flex;
    gap: var(--s-1);
    border-block-end: 1px solid var(--c-hairline);
  }

  .py__tab {
    min-height: 40px;
    padding: 0 var(--s-3);
    border: 0;
    border-block-end: 3px solid transparent;
    background: transparent;
    color: var(--c-muted);
    font-size: var(--fs-14);
    font-weight: 600;
  }

  .py__tab[aria-selected='true'] {
    border-block-end-color: var(--c-primary);
    color: var(--c-text);
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

  /* Once the editor is ready, the plain text box steps aside. */
  .py__code[hidden],
  .py__editor[hidden] {
    display: none;
  }

  .py__code:focus-visible {
    outline: 2px solid var(--c-focus);
    outline-offset: 1px;
  }

  .py__actions {
    display: flex;
    margin-block-start: var(--s-3);
    gap: var(--s-3);
    align-items: center;
    justify-content: space-between;
  }

  .py__heading {
    margin-block-start: var(--s-4);
    font-size: var(--fs-18);
  }

  .py__card {
    min-height: 3em;
    max-height: 16em;
    margin: var(--s-2) 0 0;
    padding: var(--s-3) var(--s-4);
    overflow: auto;
    border-radius: var(--radius-control);
    background: var(--c-surface);
    box-shadow: var(--shadow-float);
    font-family: var(--font-code);
    font-size: var(--fs-14);
    font-weight: 600;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  /* An error has a red stripe on its left. */
  .py__card--error {
    border-inline-start: 6px solid var(--c-error);
    color: var(--c-error-ink);
  }

  /* Pill-shaped outline buttons: Reset on the left, Run on the right. */
  .pill {
    min-height: 48px;
    padding: 0 var(--s-6);
    border: 2px solid var(--c-text);
    border-radius: 999px;
    background: transparent;
    color: var(--c-text);
    font-size: var(--fs-16);
    font-weight: 700;
    cursor: pointer;
    transition: background-color var(--dur-ui);
  }

  .pill:hover:not(:disabled) {
    background: var(--c-surface-sunken);
  }

  .pill:focus-visible {
    outline: 2px solid var(--c-focus);
    outline-offset: 2px;
  }

  .pill:disabled {
    border-color: var(--c-control-edge);
    color: var(--c-muted);
    cursor: default;
  }

  .pill--busy:disabled {
    border-color: var(--c-text);
    background: var(--c-surface-sunken);
    color: var(--c-text);
  }

  /* Processing...: the dots light up one after another while code runs. */
  .dots span {
    animation: dot 1.2s infinite;
    opacity: 0.2;
  }

  .dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes dot {
    0%,
    60%,
    100% {
      opacity: 0.2;
    }

    30% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dots span {
      animation: none;
      opacity: 1;
    }
  }

  /* Tooltips: on hover and on keyboard focus; Esc hides them. */
  .tip-wrap {
    position: relative;
    display: inline-flex;
  }

  .tip {
    position: absolute;
    inset-block-end: calc(100% + 12px);
    inset-inline-start: 0;
    z-index: 5;
    width: max-content;
    max-width: 220px;
    padding: var(--s-2) var(--s-3);
    border-radius: 8px;
    background: var(--c-highlight);
    box-shadow: var(--shadow-float);
    color: var(--c-text);
    font-size: var(--fs-14);
    line-height: 1.4;
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--dur-ui);
    pointer-events: none;
  }

  .tip::after {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 24px;
    border: 7px solid transparent;
    border-block-start-color: var(--c-highlight);
    content: '';
  }

  .tip--end {
    inset-inline: auto 0;
  }

  .tip--end::after {
    inset-inline: auto 24px;
  }

  .py__actions:not(.py__actions--quiet) .tip-wrap:hover .tip,
  .py__actions:not(.py__actions--quiet) .pill:focus-visible + .tip {
    opacity: 1;
    visibility: visible;
  }
</style>
