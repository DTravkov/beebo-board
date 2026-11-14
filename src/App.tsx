import { useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import {
  Canvas,
  type TextEditor,
  type Tool,
  type View,
} from './components/Canvas';
import { Dialog } from './components/Dialog';
import { Icon } from './components/Icon';
import {
  BrushStyles,
  MAX_COLORS,
  MAX_STYLES,
  BASE_COLORS,
  type BrushStyle,
} from './components/BrushStyles';
import { BoardDocument } from './lib/document';
import {
  createRoom,
  invitationUrl,
  readInvite,
  RoomSession,
  type Presence,
  type RoomStatus,
} from './lib/room';
import { forgetLocal, loadLocal, saveLocal } from './lib/storage';
import {
  makeShape,
  MAX_DOCUMENT_BYTES,
  parseBoard,
  sampleShapes,
  type BoardShape,
} from './shared/board';

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Cursor', key: 'V' },
  { id: 'hand', label: 'Hand', key: 'H' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'sticky', label: 'Sticky note', key: 'N' },
];
// Everything in the Pen button's flyout: brushes first, then erasers.
const PEN_GROUP: { id: Tool; label: string; key: string }[] = [
  { id: 'pen', label: 'Pen brush', key: 'P' },
  { id: 'highlighter', label: 'Highlighter', key: 'L' },
  { id: 'eraser', label: 'Object eraser', key: 'E' },
  { id: 'eraser-partial', label: 'Partial eraser', key: 'X' },
];
type Brush = 'pen' | 'highlighter';
const DEFAULT_STYLES: Record<Brush, BrushStyle[]> = {
  pen: [
    { color: '#34483e', width: 3 },
    { color: '#c84b3c', width: 3 },
    { color: '#3d5fa8', width: 6 },
  ],
  highlighter: [
    { color: '#f2c94c', width: 16 },
    { color: '#768f54', width: 16 },
  ],
};
const COLORS = [
  '#34483e',
  '#768f54',
  '#c58a48',
  '#c06e72',
  '#907cb3',
  '#668fa4',
];
const OFFLINE: RoomStatus = {
  state: 'offline',
  peers: 0,
  message: 'Only on your device',
};
function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initialBoard() {
  const board = new BoardDocument();
  // A joining replica must start empty to avoid merging the welcome template into its host.
  if (!location.hash.includes('room='))
    board.replace({
      format: 'beebo-board',
      version: 1,
      title: 'Our little idea space',
      shapes: sampleShapes,
    });
  board.undo.clear();
  return board;
}

export default function App() {
  const [board, setBoard] = useState(initialBoard);
  const [revision, setRevision] = useState(0);
  const shapes = useMemo(() => board.getShapes(), [board, revision]);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [brushStyles, setBrushStyles] = useState(DEFAULT_STYLES);
  const [activeStyle, setActiveStyle] = useState<Record<Brush, number>>({
    pen: 0,
    highlighter: 0,
  });
  const [customColors, setCustomColors] = useState<string[]>([]);
  const penItem = PEN_GROUP.find((item) => item.id === tool);
  const brush: Brush | null =
    tool === 'pen' || tool === 'highlighter' ? tool : null;
  const brushStyle = brush ? brushStyles[brush][activeStyle[brush]] : null;
  function changeStyles(
    target: Brush,
    update: (styles: BrushStyle[]) => BrushStyle[],
  ) {
    setBrushStyles((all) => ({ ...all, [target]: update(all[target]) }));
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [panel, setPanel] = useState(false);
  const [dialog, setDialog] = useState<
    'share' | 'files' | 'help' | 'template' | null
  >(null);
  const [editor, setEditor] = useState<TextEditor | null>(null);
  const [toast, setToast] = useState('');
  const [lowBandwidth, setLowBandwidth] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState('Session only');
  const [name, setName] = useState('Curious learner');
  const nameRef = useRef(name);
  nameRef.current = name;
  const [config, setConfig] = useState<{
    turnConfigured: boolean;
    directEnabled: boolean;
  } | null>(null);
  const [policy, setPolicy] = useState<'relay' | 'all'>('relay');
  const [status, setStatus] = useState<RoomStatus>(OFFLINE);
  const [people, setPeople] = useState<Presence[]>([]);
  const [invite, setInvite] = useState<{ room: string; secret: string } | null>(
    null,
  );
  const [pendingInvite, setPendingInvite] = useState<{
    room: string;
    secret: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<RoomSession | null>(null);
  const stage = useRef<Konva.Stage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedShape = shapes.find((shape) => shape.id === selected);

  useEffect(() => {
    const off = board.subscribe(() => setRevision((value) => value + 1));
    return () => {
      off();
      board.destroy();
    };
  }, [board]);
  useEffect(() => {
    fetch('/api/config')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setConfig)
      .catch(() => setConfig(null));
    try {
      const invitation = readInvite();
      if (invitation) {
        setPendingInvite(invitation);
        setDialog('share');
      }
    } catch (error) {
      setToast((error as Error).message);
    }
    return () => session.current?.close();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!localSaving || invite) return;
    setSavingLabel('Saving…');
    const timer = setTimeout(() => {
      saveLocal(board.export())
        .then(() => setSavingLabel('Saved on this device'))
        .catch((error) => {
          setSavingLabel('Save failed');
          setToast(error.message);
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [board, revision, localSaving, invite]);
  function safely(action: () => void) {
    try {
      action();
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : 'Something went wrong.',
      );
    }
  }
  function add(shape: BoardShape) {
    safely(() => board.add(shape));
  }
  function update(id: string, patch: Partial<BoardShape>) {
    safely(() => board.update(id, patch));
  }
  function remove(id: string) {
    safely(() => board.remove(id));
    setSelected(null);
  }
  function erase(ids: string[]) {
    safely(() => board.removeMany(ids));
    setSelected((id) => (id && ids.includes(id) ? null : id));
  }
  function splice(changes: { id: string; pieces: BoardShape[] }[]) {
    safely(() => board.splice(changes));
    setSelected((id) =>
      id && changes.some((change) => change.id === id) ? null : id,
    );
  }
  function exportBoard() {
    download(
      `${board.title.replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'beebo'}.beebo.json`,
      new Blob([JSON.stringify(board.export(), null, 2)], {
        type: 'application/json',
      }),
    );
    setToast('Board exported. Keep this file to open it again.');
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'input, textarea, select, button, dialog, [contenteditable]',
        ) ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) board.undo.redo();
          else board.undo.undo();
        }
        if (event.key.toLowerCase() === 's') {
          event.preventDefault();
          exportBoard();
        }
        return;
      }
      if (event.key === 'Escape') {
        setSelected(null);
        setTool('select');
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault();
        remove(selected);
      }
      const found = [...TOOLS, ...PEN_GROUP].find(
        (item) => item.key.toLowerCase() === event.key.toLowerCase(),
      );
      if (found) setTool(found.id);
      if (
        selected &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        const shape = board.getShapes().find((item) => item.id === selected);
        if (!shape) return;
        const distance = event.shiftKey ? 10 : 1;
        update(selected, {
          x:
            shape.x +
            (event.key === 'ArrowRight'
              ? distance
              : event.key === 'ArrowLeft'
                ? -distance
                : 0),
          y:
            shape.y +
            (event.key === 'ArrowDown'
              ? distance
              : event.key === 'ArrowUp'
                ? -distance
                : 0),
        });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [board, selected]);
  async function startSession(
    value: { room: string; secret: string },
    joining: boolean,
  ) {
    session.current?.close();
    let target = board;
    if (joining) {
      target = new BoardDocument();
      setBoard(target);
      setSelected(null);
    }
    setLocalSaving(false);
    setSavingLabel('Session only');
    setInvite(value);
    setPendingInvite(null);
    history.replaceState(null, '', invitationUrl(value.room, value.secret));
    setStatus({
      state: 'connecting',
      peers: 0,
      message: 'Connecting to your room…',
    });
    const next = new RoomSession(
      target,
      value.room,
      value.secret,
      setStatus,
      setPeople,
      () => nameRef.current,
      COLORS[1],
    );
    session.current = next;
    await next.connect();
  }
  async function share() {
    setBusy(true);
    try {
      await startSession(
        pendingInvite ?? (await createRoom(policy)),
        Boolean(pendingInvite),
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not connect.');
      setStatus({
        state: 'error',
        peers: 0,
        message: 'Could not connect. You can keep working locally.',
      });
    } finally {
      setBusy(false);
    }
  }
  function leave() {
    session.current?.close();
    session.current = null;
    setInvite(null);
    setPendingInvite(null);
    setStatus(OFFLINE);
    setPeople([]);
    history.replaceState(null, '', location.pathname + location.search);
    setToast('You left the room. A copy of the board stays in this tab.');
  }
  function zoom(delta: number) {
    const scale = Math.max(
      0.2,
      Math.min(3, Math.round((view.scale + delta) * 100) / 100),
    );
    const width = stage.current?.width() ?? 1000;
    const height = stage.current?.height() ?? 700;
    setView({
      scale,
      x: width / 2 - ((width / 2 - view.x) / view.scale) * scale,
      y: height / 2 - ((height / 2 - view.y) / view.scale) * scale,
    });
  }
  function fit() {
    if (!shapes.length) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const width = stage.current?.width() ?? 1000;
    const height = stage.current?.height() ?? 700;
    const left = Math.min(...shapes.map((s) => s.x + Math.min(0, s.width)));
    const top = Math.min(...shapes.map((s) => s.y + Math.min(0, s.height)));
    const right = Math.max(
      ...shapes.map(
        (s) => s.x + Math.max(s.width, s.kind === 'text' ? 360 : 20),
      ),
    );
    const bottom = Math.max(...shapes.map((s) => s.y + Math.max(s.height, 60)));
    const scale = Math.max(
      0.2,
      Math.min(
        1.5,
        (width - 220) / (right - left + 40),
        (height - 200) / (bottom - top + 40),
      ),
    );
    setView({
      scale,
      x: (width - (right - left) * scale) / 2 - left * scale,
      y: (height - (bottom - top) * scale) / 2 - top * scale,
    });
  }
  async function importFile(file: File) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      setToast('Choose a board file smaller than 2 MB.');
      return;
    }
    try {
      const data = parseBoard(await file.text());
      board.replace(data);
      setSelected(null);
      setToast('Board opened. Undo will restore your previous canvas.');
      setDialog(null);
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  function saveText(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || !editor.text.trim()) return;
    if (editor.id) update(editor.id, { text: editor.text });
    else {
      const shape = makeShape(editor.kind, editor.x, editor.y, color);
      shape.text = editor.text;
      shape.width = editor.kind === 'sticky' ? 205 : 360;
      shape.height = editor.kind === 'sticky' ? 175 : 60;
      shape.fill = editor.kind === 'sticky' ? '#f5e7a1' : 'transparent';
      add(shape);
    }
    setEditor(null);
    setTool('select');
  }

  return (
    <div className="app-shell">
      <a href="#objects" className="skip-link" onClick={() => setPanel(true)}>
        Skip to accessible object editor
      </a>
      <header className="header">
        <a
          className="brand"
          href="/"
          aria-label="Beebo home"
          onClick={(event) => {
            event.preventDefault();
            setDialog('help');
          }}
        >
          <span className="brand-mark">
            b<span />
          </span>
          <span>
            beebo<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="header-divider" />
        <button className="workspace-button" onClick={() => setDialog('files')}>
          <span className="workspace-icon">
            <Icon name="grid" size={16} />
          </span>
          <span>My workspace</span>
          <Icon name="chevron" size={14} />
        </button>
        <span className="header-badge">
          <span className="tiny-dot" /> A little space for big ideas
        </span>
        <div className="header-actions">
          <div className="history-buttons">
            <button
              className="icon-button"
              title="Undo (Ctrl/⌘ Z)"
              aria-label="Undo"
              disabled={!board.undo.canUndo()}
              onClick={() => board.undo.undo()}
            >
              <Icon name="undo" size={18} />
            </button>
            <button
              className="icon-button"
              title="Redo (Ctrl/⌘ Shift Z)"
              aria-label="Redo"
              disabled={!board.undo.canRedo()}
              onClick={() => board.undo.redo()}
            >
              <Icon name="redo" size={18} />
            </button>
          </div>
          <span className="header-divider" />
          <div
            className="avatar-stack"
            aria-label={`${status.peers + 1} participants`}
          >
            <span className="avatar me" title={name}>
              {name.charAt(0).toUpperCase()}
            </span>
            {status.peers > 0 && (
              <span className="avatar others">+{status.peers}</span>
            )}
          </div>
          <button className="share-button" onClick={() => setDialog('share')}>
            <Icon name="share" size={17} />
            <span>Share board</span>
          </button>
        </div>
      </header>
      <aside className="navigation-rail" aria-label="Workspace navigation">
        <button
          className="rail-button active"
          aria-label="Board files"
          title="Board files"
          onClick={() => setDialog('files')}
        >
          <Icon name="grid" />
        </button>
        <button
          className="rail-button"
          aria-label="Learning templates"
          title="Learning templates"
          onClick={() => setDialog('template')}
        >
          <Icon name="book" />
        </button>
        <div className="rail-bottom">
          <button
            className={`rail-button ${panel ? 'active' : ''}`}
            aria-label="Toggle Objects panel"
            title="Objects & keyboard editing"
            aria-pressed={panel}
            onClick={() => setPanel(!panel)}
          >
            <Icon name="layers" />
          </button>
          <button
            className="rail-button"
            aria-label="Help and keyboard shortcuts"
            title="Help & shortcuts"
            onClick={() => setDialog('help')}
          >
            <Icon name="info" />
          </button>
          <span className="rail-avatar" title="An open space for everyone">
            b.
          </span>
        </div>
      </aside>
      <main className="board-area" aria-label="Board workspace">
        <Canvas
          shapes={shapes}
          tool={tool}
          color={brushStyle?.color ?? color}
          width={brushStyle?.width ?? strokeWidth}
          selected={selected}
          view={view}
          lowBandwidth={lowBandwidth}
          presence={people}
          stageRef={stage}
          onView={setView}
          onSelect={setSelected}
          onAdd={add}
          onUpdate={update}
          onErase={erase}
          onSplice={splice}
          onEditText={setEditor}
          onCursor={(x, y) => session.current?.cursor(x, y, lowBandwidth)}
        />
        <div className="board-heading">
          <div className="board-title-row">
            <input
              aria-label="Board title"
              value={board.title}
              maxLength={120}
              onChange={(event) => board.setTitle(event.target.value)}
            />
            <Icon name="pen" size={13} />
          </div>
          <div className="board-subtitle">
            <Icon name={localSaving ? 'check' : 'lock'} size={12} />
            <span>
              {invite ? 'Private room · up to 8 people' : savingLabel}
            </span>
            <span className="separator-dot">·</span>
            <span>{shapes.length} objects</span>
          </div>
        </div>
        <div className="canvas-note">
          <span className="note-spark">✳</span>
          <span>
            A blank canvas.
            <br />A fresh perspective.
          </span>
        </div>
        <div
          className="tool-dock"
          role="toolbar"
          aria-label="Drawing tools"
          aria-orientation="vertical"
        >
          {TOOLS.map((item, index) => (
            <div key={item.id} className={index === 2 ? 'tool-divider' : ''}>
              <button
                className={`tool-button ${tool === item.id || (item.id === 'pen' && penItem) ? 'selected' : ''}`}
                aria-label={`${item.label} (${item.key})`}
                title={`${item.label} · ${item.key}`}
                aria-pressed={
                  tool === item.id || (item.id === 'pen' && !!penItem)
                }
                onClick={() => setTool(item.id)}
              >
                <Icon name={item.id} />
                <span className="tool-key">{item.key}</span>
              </button>
            </div>
          ))}
          <div className="color-divider" />
          <label className="active-color" title="Drawing color">
            <input
              type="color"
              aria-label="Drawing color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <span style={{ background: color }} />
          </label>
        </div>
        {penItem && (
          <div
            className="brush-panel"
            role="toolbar"
            aria-label="Pen tools"
            aria-orientation="vertical"
          >
            {PEN_GROUP.map((item, index) => [
              index === 2 && (
                <span key="eraser-divider" className="brush-divider" />
              ),
              <button
                key={item.id}
                className={`tool-button ${tool === item.id ? 'selected' : ''}`}
                aria-label={`${item.label} (${item.key})`}
                title={`${item.label} · ${item.key}`}
                aria-pressed={tool === item.id}
                onClick={() => setTool(item.id)}
              >
                <Icon name={item.id} size={18} />
              </button>,
            ])}
            {brush && (
              <>
                <span className="brush-divider" />
                <BrushStyles
                  label={brush === 'pen' ? 'Pen' : 'Highlighter'}
                  styles={brushStyles[brush]}
                  active={activeStyle[brush]}
                  customColors={customColors}
                  onSelect={(index) =>
                    setActiveStyle((all) => ({ ...all, [brush]: index }))
                  }
                  onChange={(index, next) =>
                    changeStyles(brush, (styles) =>
                      styles.map((item, i) => (i === index ? next : item)),
                    )
                  }
                  onAdd={() => {
                    const count = brushStyles[brush].length;
                    if (count >= MAX_STYLES) return;
                    changeStyles(brush, (styles) => [
                      ...styles,
                      { ...styles[activeStyle[brush]] },
                    ]);
                    setActiveStyle((all) => ({ ...all, [brush]: count }));
                  }}
                  onRemove={(index) => {
                    changeStyles(brush, (styles) =>
                      styles.length > 1
                        ? styles.filter((_, i) => i !== index)
                        : styles,
                    );
                    setActiveStyle((all) => ({ ...all, [brush]: 0 }));
                  }}
                  onAddColor={(value) =>
                    setCustomColors((list) =>
                      BASE_COLORS.includes(value) ||
                      list.includes(value) ||
                      BASE_COLORS.length + list.length >= MAX_COLORS
                        ? list
                        : [...list, value],
                    )
                  }
                />
              </>
            )}
          </div>
        )}
        {['rect', 'ellipse', 'arrow', 'text', 'sticky'].includes(tool) && (
          <div className="style-bar" aria-label="Drawing style">
            {COLORS.map((value) => (
              <button
                key={value}
                className={`swatch ${color === value ? 'chosen' : ''}`}
                style={{ background: value }}
                aria-label={`Use color ${value}`}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
              />
            ))}
            <span className="style-divider" />
            <label>
              Width{' '}
              <select
                aria-label="Stroke width"
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
              >
                <option value={2}>Fine</option>
                <option value={3}>Medium</option>
                <option value={6}>Bold</option>
              </select>
            </label>
          </div>
        )}
        <div className={`connection-pill ${status.state}`} role="status">
          <span className="connection-dot" />
          <span>{status.message}</span>
          {invite && (
            <button
              aria-label="Room connection settings"
              onClick={() => setDialog('share')}
            >
              <Icon name="chevron" size={13} />
            </button>
          )}
        </div>
        <div className="canvas-hint">
          <Icon name="hand" size={14} />
          <span>Middle mouse + drag to move</span>
          <span className="separator-dot">·</span>
          <span>Scroll to zoom</span>
        </div>
        <div className="zoom-controls">
          <button
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => zoom(-0.1)}
            disabled={view.scale <= 0.2}
          >
            <Icon name="minus" size={17} />
          </button>
          <button
            className="zoom-value"
            aria-label="Reset zoom to 100 percent"
            onClick={() => setView({ x: 0, y: 0, scale: 1 })}
          >
            {Math.round(view.scale * 100)}
            <span>%</span>
          </button>
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => zoom(0.1)}
            disabled={view.scale >= 3}
          >
            <Icon name="plus" size={17} />
          </button>
          <span className="zoom-divider" />
          <button
            className="icon-button"
            aria-label="Fit board to screen"
            title="Fit board"
            onClick={fit}
          >
            <Icon name="fit" size={17} />
          </button>
        </div>
        {panel && (
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
                onClick={() => setPanel(false)}
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
                    className={`object-item ${selected === shape.id ? 'chosen' : ''}`}
                    key={shape.id}
                    onClick={() => setSelected(shape.id)}
                    aria-pressed={selected === shape.id}
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
                <p className="muted">
                  Your canvas is ready for its first idea.
                </p>
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
                          update(selectedShape.id, {
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
                      update(selectedShape.id, { color: event.target.value })
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
                        update(selectedShape.id, { text: event.target.value })
                      }
                    />
                  </label>
                )}
                <button
                  className="danger-button wide"
                  onClick={() => remove(selectedShape.id)}
                >
                  <Icon name="trash" size={15} /> Delete object
                </button>
              </div>
            )}
            <button
              className="secondary-button panel-add"
              onClick={() =>
                setEditor({
                  kind: 'sticky',
                  x: 260 - view.x / view.scale,
                  y: 180 - view.y / view.scale,
                  text: '',
                })
              }
            >
              <Icon name="plus" size={16} /> Add a note with keyboard
            </button>
          </aside>
        )}
      </main>
      <footer className="app-footer">
        <span>
          <Icon name="leaf" size={13} />
          Your ideas stay yours.
        </span>
        <span>
          Made for learning. Open to everyone.
          <span className="footer-license">Apache 2.0</span>
        </span>
        <button onClick={() => setDialog('help')}>
          <Icon name="keyboard" size={14} />
          <span>Shortcuts</span>
        </button>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.beebo.json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {editor && (
        <Dialog
          title={
            editor.id
              ? 'Edit your idea'
              : editor.kind === 'sticky'
                ? 'A little note'
                : 'Put it into words'
          }
          onClose={() => setEditor(null)}
        >
          <form onSubmit={saveText}>
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
              value={editor.text}
              onChange={(event) =>
                setEditor({ ...editor, text: event.target.value })
              }
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={!editor.text.trim()}>
                {editor.id ? 'Save changes' : 'Add to board'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === 'share' && !editor && (
        <Dialog
          title={
            pendingInvite
              ? 'You’re invited to think together'
              : 'Good ideas are better together'
          }
          onClose={() => setDialog(null)}
        >
          <p className="muted">
            A private space for tutoring, study groups, and your next shared
            lightbulb moment. Up to 8 people.
          </p>
          <label className="field-label" htmlFor="your-name">
            What should we call you?
          </label>
          <input
            className="text-input"
            id="your-name"
            maxLength={32}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {invite ? (
            <>
              <div className="privacy-card">
                <Icon name="shield" />
                <div>
                  <strong>
                    {status.policy === 'all'
                      ? 'Direct connections enabled'
                      : 'Relay-only connections'}
                  </strong>
                  <p>
                    Everyone with the invitation can view and edit this board.
                    Share it with people you trust.
                  </p>
                </div>
              </div>
              <label className="field-label" htmlFor="invitation">
                Private invitation link
              </label>
              <input
                id="invitation"
                className="text-input invitation-input"
                readOnly
                value={invitationUrl(invite.room, invite.secret)}
                onFocus={(event) => event.target.select()}
              />
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    leave();
                    setDialog(null);
                  }}
                >
                  Leave room
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(invitationUrl(invite.room, invite.secret))
                      .then(() =>
                        setToast('Invitation copied. Share it privately.'),
                      )
                      .catch(() =>
                        setToast('Select and copy the invitation link above.'),
                      );
                  }}
                >
                  Copy invitation
                </button>
              </div>
              {status.state === 'error' && (
                <p className="error-text">
                  {status.message} Leave, then open the invitation again to
                  retry.
                </p>
              )}
            </>
          ) : (
            <>
              {!pendingInvite && (
                <>
                  <fieldset className="connection-options">
                    <legend>Connection privacy</legend>
                    <label>
                      <input
                        type="radio"
                        name="policy"
                        checked={policy === 'relay'}
                        onChange={() => setPolicy('relay')}
                      />
                      <span>
                        <strong>
                          Relay only{' '}
                          <span className="recommended">Default</span>
                        </strong>
                        <small>
                          Hides your IP address from other participants.
                        </small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="policy"
                        checked={policy === 'all'}
                        disabled={!config?.directEnabled}
                        onChange={() => setPolicy('all')}
                      />
                      <span>
                        <strong>Allow direct connections</strong>
                        <small>
                          Other participants may learn your IP address.
                          {!config?.directEnabled &&
                            ' Disabled by this operator.'}
                        </small>
                      </span>
                    </label>
                  </fieldset>
                  {!config?.turnConfigured && policy === 'relay' && (
                    <div className="notice">
                      <Icon name="info" size={17} />
                      <span>
                        {config
                          ? 'Relay sharing needs TURN configuration by the operator. Your local board works without it.'
                          : 'The signaling service is unavailable. Start both services with npm run dev.'}
                      </span>
                    </div>
                  )}
                </>
              )}
              {pendingInvite && (
                <div className="notice">
                  <Icon name="info" size={17} />
                  <span>
                    Joining opens the shared board in this tab. Its creator
                    chose the connection policy. Anyone with this invitation can
                    edit.
                  </span>
                </div>
              )}
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={lowBandwidth}
                  onChange={(event) => setLowBandwidth(event.target.checked)}
                />
                <span>
                  Low-bandwidth mode{' '}
                  <small>Fewer cursor updates and simpler strokes</small>
                </span>
              </label>
              <div className="dialog-actions">
                <span className="small muted">No account. No tracking.</span>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    (!pendingInvite &&
                      (policy === 'relay'
                        ? !config?.turnConfigured
                        : !config?.directEnabled))
                  }
                  onClick={() => void share()}
                >
                  {busy
                    ? 'Connecting…'
                    : pendingInvite
                      ? 'Join shared board'
                      : 'Create private room'}
                  <Icon name="arrow" size={15} />
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
      {dialog === 'files' && (
        <Dialog title="Your little workspace" onClose={() => setDialog(null)}>
          <p className="muted">
            A board is yours to keep. Export a portable file, or choose to save
            a personal board on this device.
          </p>
          <div className="file-actions">
            <button onClick={exportBoard}>
              <Icon name="download" />
              <span>
                <strong>Export board</strong>
                <small>Editable .beebo.json file</small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
            <button onClick={() => fileInput.current?.click()}>
              <Icon name="upload" />
              <span>
                <strong>Open board file</strong>
                <small>Replaces this canvas · undo to restore</small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
            <button
              onClick={() => {
                try {
                  const url = stage.current?.toDataURL({ pixelRatio: 2 });
                  if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'beebo-board.png';
                    a.click();
                  }
                } catch {
                  setToast('Could not export an image. Try the JSON export.');
                }
              }}
            >
              <Icon name="download" />
              <span>
                <strong>Export view as PNG</strong>
                <small>The visible canvas at twice the resolution</small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
          </div>
          <div className="local-storage">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={localSaving}
                disabled={Boolean(invite)}
                onChange={(event) => {
                  setLocalSaving(event.target.checked);
                  if (!event.target.checked) setSavingLabel('Session only');
                }}
              />
              <span>
                Save personal board on this device
                <small>
                  {invite
                    ? 'Leave the shared room before enabling local saving.'
                    : 'Off by default. Shared boards are never saved automatically.'}
                </small>
              </span>
            </label>
            <div className="storage-actions">
              <button
                className="text-button"
                onClick={() => {
                  if (invite) {
                    setToast(
                      'Leave the shared room before restoring a personal board.',
                    );
                    return;
                  }
                  void loadLocal()
                    .then((saved) => {
                      if (saved) {
                        board.replace(saved);
                        setToast('Saved board restored.');
                        setDialog(null);
                      } else
                        setToast('No personal board is saved on this device.');
                    })
                    .catch((error) => setToast(error.message));
                }}
              >
                Restore saved board
              </button>
              <button
                className="text-button danger"
                onClick={() => {
                  setLocalSaving(false);
                  setSavingLabel('Session only');
                  void forgetLocal()
                    .then(() =>
                      setToast(
                        'Saved personal board removed from this device.',
                      ),
                    )
                    .catch((error) => setToast(error.message));
                }}
              >
                Forget saved board
              </button>
            </div>
          </div>
          <div className="dialog-actions">
            <span className="small muted">An open format. A fresh start.</span>
            <button
              className="secondary-button"
              onClick={() => {
                board.replace({
                  format: 'beebo-board',
                  version: 1,
                  title: 'Untitled board',
                  shapes: [],
                });
                setSelected(null);
                setView({ x: 0, y: 0, scale: 1 });
                setDialog(null);
                setToast(
                  'Fresh canvas ready. Undo restores your previous board.',
                );
              }}
            >
              <Icon name="plus" size={16} /> New blank board
            </button>
          </div>
        </Dialog>
      )}
      {dialog === 'template' && (
        <Dialog
          title="A starting point for learning"
          onClose={() => setDialog(null)}
        >
          <p className="muted">
            Add a small activity to your board. Everything is editable, and undo
            removes it.
          </p>
          <div className="template-list">
            {[
              {
                title: 'Think · Pair · Share',
                detail:
                  'Make room for individual ideas and shared discoveries.',
                notes: [
                  'THINK\nWhat do you notice?\nWrite one idea.',
                  'PAIR\nCompare your ideas.\nWhat connects them?',
                  'SHARE\nWhat did you learn?\nTell the group.',
                ],
              },
              {
                title: 'Know · Wonder · Learn',
                detail: 'Turn curiosity into a simple learning journey.',
                notes: [
                  'KNOW\nWhat do we already know?',
                  'WONDER\nWhat would we like to find out?',
                  'LEARN\nWhat have we discovered?',
                ],
              },
            ].map((template) => (
              <button
                key={template.title}
                className="template-card"
                onClick={() => {
                  safely(() => {
                    template.notes.forEach((text, index) => {
                      const shape = makeShape(
                        'sticky',
                        235 + index * 245 - view.x / view.scale,
                        180 - view.y / view.scale,
                      );
                      shape.width = 205;
                      shape.height = 175;
                      shape.text = text;
                      shape.fill = ['#f5e7a1', '#dce8cf', '#eadff0'][index];
                      board.add(shape);
                    });
                  });
                  setDialog(null);
                  setToast('Activity added. Make it your own.');
                }}
              >
                <span className="template-preview">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{template.title}</strong>
                <span>{template.detail}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {dialog === 'help' && (
        <Dialog
          title="A little room for everyone"
          onClose={() => setDialog(null)}
        >
          <p className="muted">
            Beebo is an open-source whiteboard for learning and thinking
            together. Start sketching, add a note, or invite your small group.
          </p>
          <div className="shortcut-grid">
            {TOOLS.map((item) => (
              <div key={item.id}>
                <span>{item.label}</span>
                <kbd>{item.key}</kbd>
              </div>
            ))}
            <div>
              <span>Move around</span>
              <kbd>Middle mouse + drag</kbd>
            </div>
            <div>
              <span>Undo / redo</span>
              <kbd>Ctrl/⌘ Z / ⇧ Z</kbd>
            </div>
            <div>
              <span>Export board</span>
              <kbd>Ctrl/⌘ S</kbd>
            </div>
            <div>
              <span>Move selection</span>
              <kbd>Arrow keys</kbd>
            </div>
            <div>
              <span>Move by 10</span>
              <kbd>Shift + arrows</kbd>
            </div>
          </div>
          <div className="privacy-card">
            <Icon name="shield" />
            <div>
              <strong>Your ideas stay yours.</strong>
              <p>
                Local saving is optional. Room content is encrypted in the
                browser. Invited editors can keep copies; operators still see
                connection metadata.
              </p>
            </div>
          </div>
          <p className="small muted">
            For keyboard editing, open Objects in the left rail. Add notes, edit
            text and positions, and delete objects there. Accessibility and
            classroom permission controls are still under development.
          </p>
          <button
            className="primary-button"
            onClick={() => {
              setPanel(true);
              setDialog(null);
              setTimeout(() => document.getElementById('objects')?.focus(), 0);
            }}
          >
            Open Objects
            <Icon name="layers" size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
