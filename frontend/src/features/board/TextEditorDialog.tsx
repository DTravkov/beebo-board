import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { TextEditor } from '../canvas/types';

type Props = {
  editor: TextEditor;
  onSave: (editor: TextEditor) => void;
  onClose: () => void;
};

/** Keeps an uncommitted keyboard-editing draft inside its dialog. */
export function TextEditorDialog({ editor, onSave, onClose }: Props) {
  const [text, setText] = useState(editor.text);

  return (
    <Dialog
      title={
        editor.id
          ? 'Edit your idea'
          : editor.kind === 'sticky'
            ? 'A little note'
            : 'Put it into words'
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) onSave({ ...editor, text });
        }}
      >
        <label className="field-label" htmlFor="note-text">
          Your text
        </label>
        <textarea
          id="note-text"
          className="text-editor"
          autoFocus
          maxLength={2000}
          rows={6}
          placeholder="Every idea starts somewhere…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!text.trim()}>
            {editor.id ? 'Save changes' : 'Add to board'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
