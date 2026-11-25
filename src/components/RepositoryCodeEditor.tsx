import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { tags } from '@lezer/highlight';
import { useTranslation } from 'react-i18next';
import { textEditLimit } from '../../shared/repository-files';

const highlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--accent)' },
    { tag: [tags.string, tags.regexp], color: 'var(--green)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--text-secondary)' },
    {
      tag: [tags.propertyName, tags.definition(tags.variableName)],
      color: 'var(--code-identifier)',
    },
    { tag: [tags.comment, tags.meta], color: 'var(--text-secondary)', fontStyle: 'italic' },
    { tag: tags.heading, color: 'var(--accent)', fontWeight: 'var(--weight-strong)' },
    { tag: tags.strong, fontWeight: 'var(--weight-strong)' },
    { tag: tags.emphasis, fontStyle: 'italic' },
  ]),
);

function language(path: string) {
  if (/\.jsonc?$/i.test(path)) return json();
  if (/\.[cm]?[jt]sx?$/i.test(path))
    return javascript({ typescript: /\.[cm]?tsx?$/i.test(path), jsx: /[jt]sx$/i.test(path) });
  if (/\.(?:md|markdown)$/i.test(path)) return markdown();
  if (/\.ya?ml$/i.test(path)) return yaml();
  return [];
}

export default function RepositoryCodeEditor({
  path,
  value,
  disabled,
  onChange,
}: {
  path: string;
  value: string;
  disabled: boolean;
  onChange: (content: string) => void;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const [editability] = useState(() => new Compartment());
  const [locale] = useState(() => new Compartment());
  const [initial] = useState(value);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      doc: initial,
      extensions: [
        basicSetup,
        language(path),
        highlighting,
        editability.of([]),
        locale.of([]),
        EditorState.changeFilter.of(
          (transaction) => !transaction.docChanged || transaction.newDoc.length <= textEditLimit,
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, [editability, initial, locale, onChange, path]);

  useEffect(() => {
    editor.current?.dispatch({
      effects: editability.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
  }, [disabled, editability]);

  useEffect(() => {
    editor.current?.dispatch({
      effects: locale.reconfigure([
        EditorView.contentAttributes.of({ 'aria-label': t('repositoryFiles.content') }),
        EditorState.phrases.of(t('repositoryFiles.editorPhrases', { returnObjects: true })),
      ]),
    });
  }, [locale, t]);

  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [value]);

  return <div className="repository-code-editor" ref={host} />;
}
