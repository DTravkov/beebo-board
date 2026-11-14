import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { BASE_COLORS } from './BrushStyles';
import {
  FONTS,
  type BoardShape,
  type FontFamily,
  type TextAlign,
} from '../shared/board';
import { clampFontSize, stepFontSize, textStyle } from '../lib/text';

const NOTE_COLORS = [
  '#f5e7a1',
  '#dce8cf',
  '#eadff0',
  '#d6e6f2',
  '#f6d5cf',
  '#ffffff',
];
const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

type Props = {
  shape: BoardShape;
  onUpdate: (patch: Partial<BoardShape>) => void;
  onDelete: () => void;
};

/** Context controls for the selected object, shown above it on the canvas. */
export function ObjectToolbar({ shape, onUpdate, onDelete }: Props) {
  const [open, setOpen] = useState<'color' | 'fill' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const textual = shape.kind === 'text' || shape.kind === 'sticky';
  const style = textStyle(shape);
  const [sizeDraft, setSizeDraft] = useState(String(style.fontSize));
  useEffect(() => setSizeDraft(String(style.fontSize)), [style.fontSize]);
  useEffect(() => setOpen(null), [shape.id]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function commitSize(value: string) {
    const size = Number(value);
    if (Number.isFinite(size) && size > 0)
      onUpdate({ fontSize: clampFontSize(size) });
    else setSizeDraft(String(style.fontSize));
  }
  const nextAlign = ALIGNS[(ALIGNS.indexOf(style.align) + 1) % ALIGNS.length];

  return (
    <div
      ref={root}
      className="object-toolbar"
      role="toolbar"
      aria-label="Selected object"
      onKeyDown={(event) => {
        // Keep board shortcuts away from the toolbar's own controls.
        event.stopPropagation();
        if (event.key === 'Escape') setOpen(null);
      }}
    >
      {textual && (
        <>
          <select
            className="font-select"
            aria-label="Font"
            value={style.family}
            onChange={(event) =>
              onUpdate({ fontFamily: event.target.value as FontFamily })
            }
            style={{ fontFamily: style.fontFamily }}
          >
            {Object.entries(FONTS).map(([id, font]) => (
              <option key={id} value={id} style={{ fontFamily: font.css }}>
                {font.label}
              </option>
            ))}
          </select>
          <span className="toolbar-divider" />
          <div className="font-size">
            <input
              aria-label="Font size"
              inputMode="numeric"
              value={sizeDraft}
              onChange={(event) =>
                setSizeDraft(event.target.value.replace(/[^\d]/g, ''))
              }
              onBlur={(event) => commitSize(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitSize(sizeDraft);
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  onUpdate({
                    fontSize: stepFontSize(
                      style.fontSize,
                      event.key === 'ArrowUp' ? 1 : -1,
                    ),
                  });
                }
              }}
            />
            <span className="size-steps">
              <button
                aria-label="Larger text"
                title="Larger"
                onClick={() =>
                  onUpdate({ fontSize: stepFontSize(style.fontSize, 1) })
                }
              >
                <span className="flip">
                  <Icon name="chevron" size={14} />
                </span>
              </button>
              <button
                aria-label="Smaller text"
                title="Smaller"
                onClick={() =>
                  onUpdate({ fontSize: stepFontSize(style.fontSize, -1) })
                }
              >
                <Icon name="chevron" size={14} />
              </button>
            </span>
          </div>
          <span className="toolbar-divider" />
          <button
            className={`toolbar-button bold-button${style.bold ? ' on' : ''}`}
            aria-label="Bold"
            aria-pressed={style.bold}
            title="Bold"
            onClick={() => onUpdate({ bold: !style.bold })}
          >
            B
          </button>
          <button
            className="toolbar-button"
            aria-label={`Align ${style.align}. Switch to ${nextAlign}`}
            title={`Align: ${style.align}`}
            onClick={() => onUpdate({ align: nextAlign })}
          >
            <Icon name={`align-${style.align}`} size={18} />
          </button>
        </>
      )}
      {!textual && (
        <label className="toolbar-thickness" title="Thickness">
          <span className="sr-only">Thickness</span>
          <input
            type="range"
            min={1}
            max={24}
            value={shape.strokeWidth}
            aria-label="Thickness"
            onChange={(event) =>
              onUpdate({ strokeWidth: Number(event.target.value) })
            }
          />
        </label>
      )}
      <span className="toolbar-divider" />
      <button
        className="toolbar-button"
        aria-label={textual ? 'Text color' : 'Color'}
        aria-expanded={open === 'color'}
        title={textual ? 'Text color' : 'Color'}
        onClick={() => setOpen(open === 'color' ? null : 'color')}
      >
        {textual ? (
          <span className="text-color-icon">
            A<span style={{ background: shape.color }} />
          </span>
        ) : (
          <span className="color-dot" style={{ background: shape.color }} />
        )}
      </button>
      {shape.kind === 'sticky' && (
        <button
          className="toolbar-button"
          aria-label="Note color"
          aria-expanded={open === 'fill'}
          title="Note color"
          onClick={() => setOpen(open === 'fill' ? null : 'fill')}
        >
          <span className="color-dot" style={{ background: shape.fill }} />
        </button>
      )}
      <span className="toolbar-divider" />
      <button
        className="toolbar-button"
        aria-label="Delete object"
        title="Delete"
        onClick={onDelete}
      >
        <Icon name="trash" size={17} />
      </button>
      {open && (
        <div
          className="toolbar-popover"
          role="dialog"
          aria-label={open === 'fill' ? 'Note color' : 'Color'}
        >
          <div className="popover-colors">
            {(open === 'fill' ? NOTE_COLORS : BASE_COLORS).map((value) => {
              const current = open === 'fill' ? shape.fill : shape.color;
              return (
                <button
                  key={value}
                  className={`popover-swatch ${current === value ? 'chosen' : ''}`}
                  style={{ background: value }}
                  aria-label={`Use color ${value}`}
                  aria-pressed={current === value}
                  onClick={() =>
                    onUpdate(
                      open === 'fill' ? { fill: value } : { color: value },
                    )
                  }
                />
              );
            })}
            <label className="popover-swatch add" title="Custom color">
              <input
                type="color"
                aria-label="Custom color"
                value={open === 'fill' ? shape.fill : shape.color}
                onChange={(event) =>
                  onUpdate(
                    open === 'fill'
                      ? { fill: event.target.value }
                      : { color: event.target.value },
                  )
                }
              />
              <Icon name="plus" size={16} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
