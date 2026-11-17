import { useEffect, useMemo, useState } from 'react';
import { BoardDocument } from '../../lib/document';

/** Owns the active Yjs document and its React subscription. */
export function useBoardDocument() {
  const [board, setBoard] = useState(() => new BoardDocument());
  const [revision, setRevision] = useState(0);
  const shapes = useMemo(() => board.getShapes(), [board, revision]);

  useEffect(() => {
    const unsubscribe = board.subscribe(() =>
      setRevision((value) => value + 1),
    );
    return () => {
      unsubscribe();
      board.destroy();
    };
  }, [board]);

  return { board, setBoard, shapes, revision };
}
