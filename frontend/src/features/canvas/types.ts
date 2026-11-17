import type { BoardShape } from '../../shared/board';

export type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'frame'
  | 'hand'
  | 'eraser'
  | 'eraser-partial';
export type View = { x: number; y: number; scale: number };
export type TextEditor = {
  id?: string;
  kind: 'text' | 'sticky';
  x: number;
  y: number;
  text: string;
};
export type Editing = { shape: BoardShape; before: BoardShape | null };
