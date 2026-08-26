export type PageImage = {
  index: number; // 0-based page index within its document
  dataUrl: string; // image/jpeg data URL
  width: number;
  height: number;
};

/** Percent-based rectangle (0-100) relative to the page image. */
export type Rect = { x: number; y: number; w: number; h: number };

export type Region = { page: number; rect: Rect };

export type Question = {
  id: string;
  number: string; // exactly as printed, e.g. "11(a)"
  key: string; // normalised, e.g. "11a"
  text: string;
  marks: number | null;
  section: string | null;
  page: number;
  order: number; // printed order across the whole paper
  region?: Region;
};

export type AnswerBlock = {
  id: string;
  page: number;
  label: string | null; // question number the student wrote, if any
  key: string | null;
  text: string;
  region: Region;
  continuation: boolean;
  confidence: number;
  order: number;
};

export type MatchMethod = "label" | "continuation" | "semantic" | "none";

export type Match = {
  questionId: string;
  blockIds: string[];
  method: MatchMethod;
  confidence: number;
  note?: string;
};

export type Grade = {
  questionId: string;
  verdict: "correct" | "partial" | "incorrect" | "unanswered";
  awarded: number | null;
  max: number | null;
  feedback: string;
};

export type Summary = {
  awarded: number | null;
  max: number | null;
  answered: number;
  unanswered: number;
  unmatched: number;
  overall: string;
  strengths: string[];
  focus: string[];
};

export type Stage =
  | "idle"
  | "reading"
  | "questions"
  | "answers"
  | "mapping"
  | "grading"
  | "ready"
  | "error";

export type Progress = {
  stage: Stage;
  label: string;
  done: number;
  total: number;
};
