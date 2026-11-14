import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export type BrushStyle = { color: string; width: number };

/** Direct size control for the active brush; preset colors stay unchanged. */
export function BrushSize({
  label,
  size,
  min = 1,
  max = 24,
  onChange,
}: {
  label: string;
  size: number;
  min?: number;
  max?: number;
  onChange: (size: number) => void;
}) {
  return (
    <label className="brush-size-control">
      <span>{label}</span>
      <output>{size}px</output>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={size}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export const MAX_STYLES = 5;
export const MAX_COLORS = 15;
export const BASE_COLORS = [
  '#34483e',
  '#1f2a24',
  '#768f54',
  '#3f8f5a',
  '#668fa4',
  '#3d5fa8',
  '#907cb3',
  '#c06e72',
  '#c84b3c',
  '#f2c94c',
];

type Props = {
  label: string;
  styles: BrushStyle[];
  active: number;
  customColors: string[];
  onSelect: (index: number) => void;
  onChange: (index: number, style: BrushStyle) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onAddColor: (color: string) => void;
};

/** Saved size + color presets for one brush, with an editor popover. */
export function BrushStyles(props: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const style = editing === null ? null : props.styles[editing];
  const colors = [...BASE_COLORS, ...props.customColors];

  function close() {
    const index = editing;
    setEditing(null);
    if (index !== null) buttons.current[index]?.focus();
  }

  useEffect(() => {
    if (editing === null) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        popover.current?.contains(target) ||
        buttons.current.some((button) => button?.contains(target))
      )
        return;
      setEditing(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  });

  // The native "change" event fires once the picker is committed, unlike React's onChange.
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const commit = () => props.onAddColor(input.value);
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  });

  useEffect(() => setEditing(null), [props.label]);

  return (
    <>
      {props.styles.map((item, index) => (
        <button
          key={index}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          className={`style-preset ${props.active === index ? 'chosen' : ''}`}
          aria-label={`${props.label} style ${index + 1}: size ${item.width}, color ${item.color}`}
          title={
            props.active === index ? 'Click to edit this style' : 'Use style'
          }
          aria-pressed={props.active === index}
          aria-expanded={editing === index}
          aria-haspopup="dialog"
          onClick={() => {
            if (props.active === index)
              setEditing(editing === index ? null : index);
            else {
              props.onSelect(index);
              setEditing(null);
            }
          }}
        >
          <span
            style={{
              width: 4 + Math.min(item.width, 24) * 0.7,
              height: 4 + Math.min(item.width, 24) * 0.7,
              background: item.color,
            }}
          />
        </button>
      ))}
      {props.styles.length < MAX_STYLES && (
        <button
          className="style-add"
          aria-label={`Add ${props.label} style`}
          title="Add style"
          onClick={() => {
            props.onAdd();
            setEditing(props.styles.length);
          }}
        >
          <Icon name="plus" size={14} />
        </button>
      )}
      {style && editing !== null && (
        <div
          ref={popover}
          className="style-popover"
          role="dialog"
          aria-label={`Edit ${props.label} style ${editing + 1}`}
        >
          <label className="thickness">
            <span>Thickness</span>
            <span className="thickness-row">
              <output>{style.width}</output>
              <input
                type="range"
                min={1}
                max={24}
                value={style.width}
                aria-label="Thickness"
                onChange={(event) =>
                  props.onChange(editing, {
                    ...style,
                    width: Number(event.target.value),
                  })
                }
              />
            </span>
          </label>
          <span className="popover-heading">Colors</span>
          <div className="popover-colors">
            {colors.map((value) => (
              <button
                key={value}
                className={`popover-swatch ${style.color === value ? 'chosen' : ''}`}
                style={{ background: value }}
                aria-label={`Use color ${value}`}
                aria-pressed={style.color === value}
                onClick={() =>
                  props.onChange(editing, { ...style, color: value })
                }
              >
                {style.color === value && <Icon name="check" size={14} />}
              </button>
            ))}
            {colors.length < MAX_COLORS && (
              <label className="popover-swatch add" title="Add a color">
                <input
                  ref={picker}
                  type="color"
                  aria-label="Add a custom color"
                  value={style.color}
                  onChange={(event) =>
                    props.onChange(editing, {
                      ...style,
                      color: event.target.value,
                    })
                  }
                />
                <Icon name="plus" size={16} />
              </label>
            )}
          </div>
          {props.styles.length > 1 && (
            <button
              className="style-remove"
              onClick={() => {
                props.onRemove(editing);
                setEditing(null);
              }}
            >
              <Icon name="trash" size={14} /> Remove style
            </button>
          )}
        </div>
      )}
    </>
  );
}

export const MIN_ERASER = 8;
export const MAX_ERASER = 80;

/** Size button for the partial eraser; opens a thickness slider. */
export function EraserThickness(props: {
  size: number;
  onChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popover.current?.contains(target) || button.current?.contains(target))
        return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  const dot = 6 + ((props.size - MIN_ERASER) / (MAX_ERASER - MIN_ERASER)) * 18;
  return (
    <>
      <button
        ref={button}
        className="style-preset chosen eraser-size"
        aria-label={`Partial eraser thickness: ${props.size}`}
        title="Eraser thickness"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <span style={{ width: dot, height: dot }} />
      </button>
      {open && (
        <div
          ref={popover}
          className="style-popover"
          role="dialog"
          aria-label="Partial eraser thickness"
        >
          <label className="thickness">
            <span>Thickness</span>
            <span className="thickness-row">
              <output>{props.size}</output>
              <input
                type="range"
                min={MIN_ERASER}
                max={MAX_ERASER}
                step={2}
                value={props.size}
                aria-label="Eraser thickness"
                onChange={(event) => props.onChange(Number(event.target.value))}
              />
            </span>
          </label>
        </div>
      )}
    </>
  );
}
