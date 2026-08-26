export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnswerBlock {
  label: string;
  text: string;
  box_2d: [number, number, number, number];
  continuation?: boolean;
  confidence?: number;
  extra_boxes?: [number, number, number, number][];
}

export interface Question {
  label: string;
  text: string;
  marks?: number;
  box_2d?: [number, number, number, number];
}
