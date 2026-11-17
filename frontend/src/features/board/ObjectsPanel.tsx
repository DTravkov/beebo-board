import { Icon } from '../../components/Icon';
import type { BoardShape } from '../../shared/board';

type Props = {
  shapes: BoardShape[];
  selected: string[];
  onSelect: (id: string, additive: boolean) => void;
  onUpdate: (id: string, patch: Partial<BoardShape>) => void;
  onRemove: (ids: string[]) => void;
  onAddNote: () => void;
  onClose: () => void;
};

export function ObjectsPanel({
  shapes,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onAddNote,
  onClose,
}: Props) {
  const selectedShape =
    selected.length === 1
      ? shapes.find((shape) => shape.id === selected[0])
      : undefined;

  return (
    <aside
      className="objects-panel"
      id="objects"
      aria-label="Accessible object editor"
      tabIndex={-1}
    >
      <div className="panel-heading">
        <h2>
          Objects <span>{shapes.length}</span>
        </h2>
        <button
          className="icon-button"
          aria-label="Close Objects panel"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="muted small">
        Select an object to edit it without dragging.
      </p>
      <div className="object-list">
        {shapes.length ? (
          shapes.map((shape, index) => (
            <button
              className={`object-item ${selected.includes(shape.id) ? 'chosen' : ''}`}
              key={shape.id}
              onClick={(event) =>
                onSelect(
                  shape.id,
                  event.shiftKey || event.ctrlKey || event.metaKey,
                )
              }
              aria-pressed={selected.includes(shape.id)}
            >
              <Icon
                name={
                  shape.kind === 'stroke'
                    ? 'pen'
                    : shape.kind === 'highlight'
                      ? 'highlighter'
                      : shape.kind
                }
                size={16}
              />
              <span>
                {shape.text
                  ? shape.text.slice(0, 35)
                  : `${shape.kind} ${index + 1}`}
              </span>
            </button>
          ))
        ) : (
          <p className="muted">Your canvas is ready for its first idea.</p>
        )}
      </div>
      {selectedShape && (
        <div className="object-properties">
          <h3>Edit selected object</h3>
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                aria-label={`Object ${key}`}
                type="number"
                value={Math.round(selectedShape[key])}
                min={-1000000}
                max={1000000}
                onChange={(event) => {
                  if (event.target.value !== '')
                    onUpdate(selectedShape.id, {
                      [key]: Number(event.target.value),
                    });
                }}
              />
            </label>
          ))}
          <label>
            Color
            <input
              aria-label="Object color"
              type="color"
              value={selectedShape.color}
              onChange={(event) =>
                onUpdate(selectedShape.id, { color: event.target.value })
              }
            />
          </label>
          {(selectedShape.kind === 'text' ||
            selectedShape.kind === 'sticky') && (
            <label className="wide">
              Text
              <textarea
                maxLength={2000}
                value={selectedShape.text}
                onChange={(event) =>
                  onUpdate(selectedShape.id, { text: event.target.value })
                }
              />
            </label>
          )}
          <button
            className="danger-button wide"
            onClick={() => onRemove([selectedShape.id])}
          >
            <Icon name="trash" size={15} /> Delete object
          </button>
        </div>
      )}
      <button className="secondary-button panel-add" onClick={onAddNote}>
        <Icon name="plus" size={16} /> Add a note with keyboard
      </button>
    </aside>
  );
}
