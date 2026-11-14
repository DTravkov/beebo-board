import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { BoardDocument } from '../src/lib/document';
import { makeShape, parseBoard, sampleShapes } from '../src/shared/board';

test('portable board format round-trips and rejects malicious or oversized values', () => {
  const board = {
    format: 'beebo-board',
    version: 1,
    title: 'Learning',
    shapes: sampleShapes,
  };
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  assert.throws(() => parseBoard(JSON.stringify({ ...board, version: 2 })));
  assert.throws(() =>
    parseBoard(
      JSON.stringify({ ...board, shapes: [{ ...sampleShapes[0], x: null }] }),
    ),
  );
  assert.throws(() =>
    parseBoard(
      JSON.stringify({
        ...board,
        shapes: [{ ...sampleShapes[0], color: 'url(https://example.com)' }],
      }),
    ),
  );
  assert.throws(() =>
    parseBoard(
      JSON.stringify({
        ...board,
        shapes: [{ ...sampleShapes[0], unexpected: 'extra state' }],
      }),
    ),
  );
  assert.throws(() =>
    parseBoard(
      JSON.stringify({ ...board, shapes: [sampleShapes[0], sampleShapes[0]] }),
    ),
  );
  assert.throws(() => parseBoard(' '.repeat(2_000_001)));
  assert.throws(() => parseBoard('null'));
});

test('independent property edits converge after disconnected clients reconnect', () => {
  const a = new BoardDocument();
  const b = new BoardDocument();
  try {
    const note = makeShape('sticky', 50, 60);
    note.width = 200;
    note.height = 175;
    note.text = 'Hello';
    note.fill = '#f5e7a1';
    a.add(note);
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    a.update(note.id, { x: 125 });
    b.update(note.id, { text: 'A shared discovery' });
    const aDelta = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
    const bDelta = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
    Y.applyUpdate(a.doc, bDelta);
    Y.applyUpdate(b.doc, aDelta);
    assert.deepEqual(a.export(), b.export());
    assert.equal(a.getShapes()[0].x, 125);
    assert.equal(a.getShapes()[0].text, 'A shared discovery');
  } finally {
    a.destroy();
    b.destroy();
  }
});

test('local undo preserves a remote property edit', () => {
  const a = new BoardDocument();
  const b = new BoardDocument();
  try {
    const shape = makeShape('text', 0, 0);
    shape.text = 'Original';
    a.add(shape);
    a.undo.clear();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    a.update(shape.id, { x: 80 });
    b.update(shape.id, { text: 'Remote edit' });
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    a.undo.undo();
    assert.equal(a.getShapes()[0].x, 0);
    assert.equal(a.getShapes()[0].text, 'Remote edit');
  } finally {
    a.destroy();
    b.destroy();
  }
});

test('deletion converges, and undo restores an imported board', () => {
  const a = new BoardDocument();
  const b = new BoardDocument();
  try {
    a.replace({
      format: 'beebo-board',
      version: 1,
      title: 'Sample',
      shapes: sampleShapes,
    });
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    a.remove('note-1');
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    assert.deepEqual(a.export(), b.export());
    assert.ok(!b.getShapes().some((s) => s.id === 'note-1'));
    const before = a.export();
    a.replace({
      format: 'beebo-board',
      version: 1,
      title: 'New board',
      shapes: [],
    });
    a.undo.undo();
    assert.deepEqual(a.export(), before);
  } finally {
    a.destroy();
    b.destroy();
  }
});

test('batch erasing publishes one update, converges, and can be undone', () => {
  const a = new BoardDocument();
  const b = new BoardDocument();
  try {
    a.replace({
      format: 'beebo-board',
      version: 1,
      title: 'Erase',
      shapes: sampleShapes,
    });
    a.undo.clear();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    let updates = 0;
    a.doc.on('update', (update) => {
      updates++;
      Y.applyUpdate(b.doc, update);
    });
    a.removeMany(['note-1', 'note-2', 'note-1']);
    assert.equal(updates, 1);
    assert.deepEqual(a.export(), b.export());
    assert.equal(a.getShapes().length, sampleShapes.length - 2);
    a.undo.undo();
    assert.deepEqual(a.getShapes(), sampleShapes);
    assert.deepEqual(a.export(), b.export());
  } finally {
    a.destroy();
    b.destroy();
  }
});

test('highlighter strokes round-trip through the board format and stay size-limited', () => {
  const highlight = makeShape('highlight', 10, 20, '#c58a48');
  highlight.points = [0, 0, 30, 5];
  highlight.strokeWidth = 24;
  const file = {
    format: 'beebo-board',
    version: 1,
    title: 'Highlights',
    shapes: [highlight],
  };
  assert.equal(parseBoard(JSON.stringify(file)).shapes[0].kind, 'highlight');
  assert.throws(() =>
    parseBoard(
      JSON.stringify({ ...file, shapes: [{ ...highlight, strokeWidth: 30 }] }),
    ),
  );
});

test('text styling fields are optional, validated, and round-trip', () => {
  const text = makeShape('text', 0, 0);
  text.text = 'Мама';
  const file = { format: 'beebo-board', version: 1, title: 'Fonts' };
  const styled = {
    ...text,
    fontFamily: 'serif',
    fontSize: 64,
    bold: true,
    align: 'center',
  };
  const parsed = parseBoard(JSON.stringify({ ...file, shapes: [styled] }));
  assert.equal(parsed.shapes[0].fontSize, 64);
  assert.equal(parsed.shapes[0].fontFamily, 'serif');
  // Boards saved before styling existed still load.
  assert.equal(
    parseBoard(JSON.stringify({ ...file, shapes: [text] })).shapes.length,
    1,
  );
  for (const bad of [
    { fontFamily: 'toString' },
    { fontFamily: 'Comic Sans' },
    { fontSize: 2 },
    { fontSize: 999 },
    { bold: 'yes' },
    { align: 'justify' },
    { extra: 1 },
  ])
    assert.throws(() =>
      parseBoard(JSON.stringify({ ...file, shapes: [{ ...text, ...bad }] })),
    );
});
