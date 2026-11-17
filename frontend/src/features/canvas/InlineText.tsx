import type { Ref } from 'react';
import {
  hugsContent,
  measureText,
  STICKY_PADDING,
  textStyle,
} from '../../lib/text';
import type { Editing, View } from './types';

type InlineProps = {
  editing: Editing;
  view: View;
  onChange: (text: string) => void;
  onCommit: () => void;
};
/** A textarea laid exactly over the text being edited on the canvas. */
export function InlineText({
  ref,
  editing,
  view,
  onChange,
  onCommit,
}: InlineProps & { ref: Ref<HTMLTextAreaElement> }) {
  const shape = editing.shape;
  const style = textStyle(shape);
  const sticky = shape.kind === 'sticky';
  const x = shape.x + (sticky ? STICKY_PADDING.x : 0);
  const y = shape.y + (sticky ? STICKY_PADDING.top : 0);
  const fixedWidth = sticky
    ? shape.width - STICKY_PADDING.x * 2
    : hugsContent(editing.before)
      ? 0
      : shape.width;
  const width = fixedWidth || Math.max(40, measureText(shape).width + 24);
  return (
    <textarea
      ref={ref}
      className={`inline-text${sticky ? ' sticky' : ''}`}
      aria-label={sticky ? 'Note text' : 'Text'}
      value={shape.text}
      spellCheck
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        // Canvas presses commit through the pointer handler instead.
        if (!event.relatedTarget?.closest('.canvas-host')) onCommit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          event.key === 'Escape' ||
          (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
        ) {
          event.preventDefault();
          onCommit();
        }
      }}
      onInput={(event) => {
        if (sticky) return;
        const input = event.currentTarget;
        input.style.height = '0px';
        input.style.height = `${input.scrollHeight}px`;
      }}
      style={{
        left: view.x + x * view.scale,
        top: view.y + y * view.scale,
        width: width * view.scale,
        height: sticky
          ? (shape.height - STICKY_PADDING.top - STICKY_PADDING.bottom) *
            view.scale
          : undefined,
        fontSize: style.fontSize * view.scale,
        fontFamily: style.fontFamily,
        fontWeight: style.bold ? 700 : 400,
        textAlign: style.align,
        lineHeight: style.lineHeight,
        color: shape.color,
      }}
    />
  );
}
