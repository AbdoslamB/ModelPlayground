<!-- An on/off switch with a visible label. -->
<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    onchange: (checked: boolean) => void;
    /** Role color of the small sample mark, e.g. "error". */
    role?: string;
    /** Line style of the sample mark. */
    mark?: 'dashed' | 'dotted' | 'solid';
  }

  let { label, checked, onchange, role, mark = 'solid' }: Props = $props();
</script>

<button
  type="button"
  class="toggle"
  role="switch"
  aria-checked={checked}
  onclick={() => {
    onchange(!checked);
  }}
>
  <span class="toggle__track" aria-hidden="true"
    ><span class="toggle__thumb"></span></span
  >
  {#if role}
    <span
      class="toggle__mark"
      aria-hidden="true"
      style:border-color={`var(--c-${role})`}
      style:border-top-style={mark}
    ></span>
  {/if}
  <span>{label}</span>
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 44px;
    padding: 0 var(--s-1);
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    font-size: var(--fs-16);
  }

  .toggle__track {
    position: relative;
    width: 36px;
    height: 20px;
    border: 1px solid var(--c-control-edge);
    border-radius: 999px;
    background: var(--c-surface-sunken);
    transition: background-color var(--dur-ui);
  }

  .toggle__thumb {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-start: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--c-control-edge);
    transition:
      transform var(--dur-ui) var(--ease-out),
      background-color var(--dur-ui);
  }

  .toggle[aria-checked='true'] .toggle__track {
    border-color: var(--c-primary);
    background: var(--c-primary);
  }

  .toggle[aria-checked='true'] .toggle__thumb {
    background: var(--c-on-primary);
    transform: translateX(16px);
  }

  .toggle__mark {
    width: 18px;
    height: 0;
    border-top-width: 3px;
  }

  /* Phones: a smaller switch so all the tools fit on one row. */
  @container lab (width < 520px) {
    .toggle {
      gap: 6px;
      padding: 0;
      font-size: var(--fs-14);
    }

    .toggle__track {
      width: 30px;
      height: 18px;
    }

    .toggle__thumb {
      width: 12px;
      height: 12px;
    }

    .toggle[aria-checked='true'] .toggle__thumb {
      transform: translateX(12px);
    }

    .toggle__mark {
      width: 14px;
    }
  }

  @container lab (width < 340px) {
    .toggle__mark {
      display: none;
    }
  }
</style>
