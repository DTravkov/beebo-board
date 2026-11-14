import * as Y from 'yjs';
import {
  isShape,
  MAX_OBJECTS,
  type BoardFile,
  type BoardShape,
} from '../shared/board';

export class BoardDocument {
  readonly doc = new Y.Doc();
  readonly objects = this.doc.getMap<Y.Map<unknown>>('objects');
  readonly order = this.doc.getArray<string>('order');
  readonly metadata = this.doc.getMap<string>('metadata');
  private readonly localOrigin = {};
  readonly undo = new Y.UndoManager([this.objects, this.order, this.metadata], {
    trackedOrigins: new Set([this.localOrigin]),
    captureTimeout: 300,
  });

  constructor() {
    // Stable default: never add initial content independently in joining replicas.
  }
  get title() {
    return this.metadata.get('title') ?? 'Our little idea space';
  }
  setTitle(title: string) {
    this.doc.transact(
      () => this.metadata.set('title', title.slice(0, 120)),
      this.localOrigin,
    );
  }
  getShapes(): BoardShape[] {
    const seen = new Set<string>();
    const shapes: BoardShape[] = [];
    for (const id of this.order.toArray().slice(0, MAX_OBJECTS * 2)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const map = this.objects.get(id);
      if (!(map instanceof Y.Map)) continue;
      const shape = map.toJSON();
      if (isShape(shape) && shape.id === id) shapes.push(shape);
      if (shapes.length >= MAX_OBJECTS) break;
    }
    return shapes;
  }
  add(shape: BoardShape) {
    if (!isShape(shape)) throw new Error('Invalid board object.');
    if (this.objects.size >= MAX_OBJECTS)
      throw new Error('This board has reached its 1,000 object limit.');
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const map = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(shape)) map.set(key, value);
      this.objects.set(shape.id, map);
      this.order.push([shape.id]);
    }, this.localOrigin);
  }
  update(id: string, patch: Partial<BoardShape>) {
    const map = this.objects.get(id);
    if (!(map instanceof Y.Map)) return;
    const next = { ...map.toJSON(), ...patch, id };
    if (!isShape(next)) throw new Error('Invalid object change.');
    this.doc.transact(() => {
      for (const [key, value] of Object.entries(patch))
        if (key !== 'id') map.set(key, value);
    }, this.localOrigin);
  }
  remove(id: string) {
    this.removeMany([id]);
  }
  removeMany(ids: string[]) {
    if (!ids.length) return;
    const removed = new Set(ids);
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of removed) this.objects.delete(id);
      for (let i = this.order.length - 1; i >= 0; i--)
        if (removed.has(this.order.get(i))) this.order.delete(i, 1);
    }, this.localOrigin);
  }
  /** Swaps each erased line for its surviving pieces, keeping stacking order. */
  splice(changes: { id: string; pieces: BoardShape[] }[]) {
    if (!changes.length) return;
    const pieces = changes.flatMap((change) => change.pieces);
    if (!pieces.every(isShape)) throw new Error('Invalid board object.');
    if (this.objects.size - changes.length + pieces.length > MAX_OBJECTS)
      throw new Error('This board has reached its 1,000 object limit.');
    // No stopCapturing: one eraser drag merges into a single undo step.
    this.doc.transact(() => {
      for (const { id, pieces } of changes) {
        this.objects.delete(id);
        for (const piece of pieces) {
          const map = new Y.Map<unknown>();
          for (const [key, value] of Object.entries(piece)) map.set(key, value);
          this.objects.set(piece.id, map);
        }
        const ids = pieces.map((piece) => piece.id);
        const index = this.order.toArray().indexOf(id);
        if (index < 0) {
          if (ids.length) this.order.push(ids);
          continue;
        }
        this.order.delete(index, 1);
        if (ids.length) this.order.insert(index, ids);
      }
    }, this.localOrigin);
  }
  replace(board: BoardFile) {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      this.objects.clear();
      this.order.delete(0, this.order.length);
      this.metadata.set('title', board.title);
      for (const shape of board.shapes) {
        const map = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(shape)) map.set(key, value);
        this.objects.set(shape.id, map);
        this.order.push([shape.id]);
      }
    }, this.localOrigin);
  }
  /** Encoded size of the whole board, as it is shared with peers. */
  byteSize() {
    return Y.encodeStateAsUpdate(this.doc).length;
  }
  export(): BoardFile {
    return {
      format: 'beebo-board',
      version: 1,
      title: this.title,
      shapes: this.getShapes(),
    };
  }
  subscribe(callback: () => void) {
    this.doc.on('afterTransaction', callback);
    return () => this.doc.off('afterTransaction', callback);
  }
  destroy() {
    this.undo.destroy();
    this.doc.destroy();
  }
}
