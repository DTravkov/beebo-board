import { useEffect, useState } from 'react';
import type { BoardDocument } from '../../lib/document';
import { forgetLocal, saveLocal } from '../../lib/storage';

/** Personal autosaving and explicit snapshots share the same saving status. */
export function useBoardSaving(
  board: BoardDocument,
  revision: number,
  shared: boolean,
  onMessage: (message: string) => void,
) {
  const [localSaving, setLocalSavingState] = useState(false);
  const [savingLabel, setSavingLabel] = useState('Session only');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!localSaving || shared) return;
    setSavingLabel('Saving…');
    const timer = setTimeout(() => {
      saveLocal(board.export())
        .then(() => setSavingLabel('Saved on this device'))
        .catch((error) => {
          setSavingLabel('Save failed');
          onMessage(error.message);
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [board, revision, localSaving, shared, onMessage]);

  function setLocalSaving(enabled: boolean) {
    setLocalSavingState(enabled);
    if (!enabled) setSavingLabel('Session only');
  }

  async function saveBoard() {
    setSaving(true);
    try {
      await saveLocal(board.export());
      setSavingLabel('Saved on this device');
      onMessage('Board saved on this device. Restore it from My workspace.');
    } catch (error) {
      setSavingLabel('Save failed');
      onMessage(
        error instanceof Error ? error.message : 'Could not save this board.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function forgetSavedBoard() {
    setLocalSaving(false);
    try {
      await forgetLocal();
      onMessage('Saved personal board removed from this device.');
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : 'Could not remove the saved board.',
      );
    }
  }

  return {
    localSaving,
    setLocalSaving,
    savingLabel,
    saving,
    saveBoard,
    forgetSavedBoard,
  };
}
