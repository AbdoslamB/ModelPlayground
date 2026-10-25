/**
 * The Python code editor (CodeMirror): line numbers, Python colours,
 * indentation and undo. The page loads this module only when the Python
 * section is opened, so CodeMirror never slows the first visit. Colours are
 * the site's text tokens, already checked for contrast in both themes.
 */
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { pythonLanguage } from '@codemirror/lang-python';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

const colours = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.bool, tags.null, tags.operatorKeyword],
    color: 'var(--c-a-ink)',
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--c-b-ink)' },
  { tag: tags.number, color: 'var(--c-error-ink)' },
  { tag: tags.comment, color: 'var(--c-muted)', fontStyle: 'italic' },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.definition(tags.variableName)),
    ],
    color: 'var(--c-line-ink)',
  },
]);

const theme = EditorView.theme({
  '&': {
    border: '1px solid var(--c-hairline)',
    borderRadius: 'var(--radius-control)',
    background: 'var(--c-surface)',
    color: 'var(--c-text)',
    fontSize: 'var(--fs-14)',
  },
  '&.cm-focused': {
    outline: '2px solid var(--c-focus)',
    outlineOffset: '1px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-code)',
    lineHeight: '1.55',
  },
  '.cm-content': { padding: 'var(--s-2) 0', caretColor: 'var(--c-text)' },
  '.cm-cursor': { borderLeftColor: 'var(--c-text)' },
  '.cm-gutters': {
    border: 'none',
    borderRight: '1px solid var(--c-hairline)',
    borderRadius: 'var(--radius-control) 0 0 var(--radius-control)',
    background: 'var(--c-surface)',
    color: 'var(--c-muted)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'var(--c-highlight)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--c-focus) 25%, transparent)',
  },
  '.cm-matchingBracket': {
    background: 'color-mix(in srgb, var(--c-b) 25%, transparent)',
    outline: 'none',
  },
});

export interface Editor {
  text(): string;
  setText(text: string): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  options: {
    text: string;
    label: string;
    onChange: (text: string) => void;
    onRun: () => void;
  },
): Editor {
  // Our own changes (Reset, the Lab moving) are not the learner's edits.
  let quiet = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(colours),
        // The Python grammar alone: no autocomplete, which is large.
        new LanguageSupport(pythonLanguage),
        EditorState.tabSize.of(4),
        // Ctrl or Cmd + Enter runs. Tab indents; Esc, then Tab, leaves the editor.
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              options.onRun();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.contentAttributes.of({
          'aria-label': options.label,
          // Already focusable; said outright so checkers see the scrolling area can be reached.
          tabindex: '0',
          autocapitalize: 'off',
          autocorrect: 'off',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !quiet) {
            options.onChange(update.state.doc.toString());
          }
        }),
        theme,
      ],
    }),
  });
  return {
    text: () => view.state.doc.toString(),
    setText(text) {
      if (text === view.state.doc.toString()) return;
      quiet = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      quiet = false;
    },
    focus: () => {
      view.focus();
    },
    destroy: () => {
      view.destroy();
    },
  };
}
