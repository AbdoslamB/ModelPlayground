<!--
  A compact labelled range input: the symbol, then the track. The value itself
  is shown elsewhere (in the live equation), so it is not repeated here.
  Keys: arrows = one step, Page Up/Down = ten steps, Home/End = min/max.
-->
<script lang="ts">
  import { clamp, snap } from '../lib/format';
  import { oncePerFrame } from '../lib/raf';

  interface Props {
    id: string;
    /** The symbol shown in its role color, e.g. "a". */
    symbol: string;
    /** Role color of the symbol and thumb, e.g. "a" for --c-a. */
    role: string;
    /** Spoken name, e.g. "Intercept". */
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onchange: (value: number) => void;
    onfocuschange?: (focused: boolean) => void;
  }

  let {
    id,
    symbol,
    role,
    label,
    value,
    min,
    max,
    step,
    onchange,
    onfocuschange,
  }: Props = $props();

  const percent = $derived(((value - min) / (max - min)) * 100);

  // Range input fires many events per frame; write the state once per frame.
  const push = oncePerFrame((next: number) => {
    onchange(next);
  });

  function onRangeKey(event: KeyboardEvent) {
    const jump =
      event.key === 'PageUp' ? 10 : event.key === 'PageDown' ? -10 : 0;
    if (!jump) return;
    event.preventDefault();
    onchange(snap(clamp(value + jump * step, min, max), step));
  }
</script>

<div
  class="slider"
  data-symbol={symbol}
  style:--role-color={`var(--c-${role})`}
>
  <label class="slider__label" for={id}>
    <span class={`slider__symbol sym-${role}`}>{symbol}</span>
    <span class="visually-hidden">{label}</span>
  </label>
  <input
    {id}
    class="slider__range"
    type="range"
    {min}
    {max}
    {step}
    {value}
    style:--fill={`${percent}%`}
    oninput={(event) => {
      push(Number(event.currentTarget.value));
    }}
    onkeydown={onRangeKey}
    onfocus={() => onfocuschange?.(true)}
    onblur={() => onfocuschange?.(false)}
  />
</div>

<style>
  .slider {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr);
    gap: var(--s-3);
    align-items: center;
    padding-inline: var(--s-2);
    margin-inline: calc(-1 * var(--s-2));
    border-radius: var(--radius-control);
    transition: background-color var(--dur-ui);
  }

  :global(.lab[data-highlight='a']) .slider[data-symbol='a'],
  :global(.lab[data-highlight='b']) .slider[data-symbol='b'] {
    background: var(--c-highlight);
    box-shadow: inset 0 0 0 1px var(--c-control-edge);
  }

  .slider__symbol {
    font-family: 'KaTeX_Math', 'Times New Roman', serif;
    font-size: var(--fs-20);
    font-style: italic;
    line-height: 1;
  }

  .slider__range {
    width: 100%;
    height: 44px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    appearance: none;
  }

  .slider__range::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--role-color) 45%, transparent) var(--fill),
      var(--c-surface-sunken) var(--fill)
    );
    box-shadow: inset 0 0 0 1px var(--c-hairline);
  }

  .slider__range::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--role-color) 45%, transparent) var(--fill),
      var(--c-surface-sunken) var(--fill)
    );
    box-shadow: inset 0 0 0 1px var(--c-hairline);
  }

  .slider__range::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
    margin-top: -8px;
    border: 3px solid var(--c-bg);
    border-radius: 50%;
    background: var(--role-color);
    box-shadow: 0 0 0 1px var(--c-control-edge);
    appearance: none;
  }

  .slider__range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 3px solid var(--c-bg);
    border-radius: 50%;
    background: var(--role-color);
    box-shadow: 0 0 0 1px var(--c-control-edge);
  }

  .slider__range:focus-visible {
    outline: none;
  }

  .slider__range:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--c-focus);
    outline-offset: 2px;
  }

  .slider__range:focus-visible::-moz-range-thumb {
    outline: 2px solid var(--c-focus);
    outline-offset: 2px;
  }
</style>
