export type Stage =
  | "reading"
  | "questions"
  | "answers"
  | "mapping"
  | "grading"
  | "ready";

export interface Progress {
  stage: Stage;
  label: string;
  done: number;
  total: number;
}

export interface Rect {
  x: number; // percent 0-100
  y: number;
  w: number;
  h: number;
}

export interface Region {
  page: number;
  rect: Rect;
}

export interface PageImage {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface Question {
  id: string;
  number: string;
  text: string;
  marks: number | null;
  section: string | null;
  order: number;
}

export interface AnswerBlock {
  id: string;
  page: number;
  label: string | null;
  key: string;
  text: string;
  region: Region;
  continuation: boolean;
  confidence: number;
  order: number;
}

export interface Match {
  questionId: string;
  blockIds: string[];
  method: "label" | "semantic";
  confidence: number;
  note?: string;
}

export interface Grade {
  questionId: string;
  verdict: "correct" | "partial" | "incorrect" | "unanswered";
  awarded: number | null;
  max: number | null;
  feedback: string;
}

export interface Summary {
  max: number | null;
  awarded: number | null;
  answered: number;
  unanswered: number;
  unmatched: number;
  overall: string;
  strengths: string[];
  focus: string[];
}
