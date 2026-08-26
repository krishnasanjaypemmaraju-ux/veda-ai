import { AnswerBlock, Rect } from './types';

export function boxToRect(box2d: [number, number, number, number], imageWidth: number, imageHeight: number): Rect {
  const [ymin, xmin, ymax, xmax] = box2d;
  return {
    x: (xmin / 1000) * imageWidth,
    y: (ymin / 1000) * imageHeight,
    width: ((xmax - xmin) / 1000) * imageWidth,
    height: ((ymax - ymin) / 1000) * imageHeight,
  };
}

export function cleanAnswerBlocks(rawBlocks: any[]): AnswerBlock[] {
  const cleaned: AnswerBlock[] = [];
  
  for (const block of rawBlocks) {
    if (block.continuation === true) {
      if (cleaned.length > 0) {
        const lastBlock = cleaned[cleaned.length - 1];
        if (!lastBlock.extra_boxes) {
          lastBlock.extra_boxes = [];
        }
        if (block.box_2d) {
          lastBlock.extra_boxes.push(block.box_2d);
        }
        lastBlock.text += `\n${block.text || ''}`;
      }
      continue; 
    }
    cleaned.push({
      ...block,
      extra_boxes: block.extra_boxes || []
    });
  }
  
  return cleaned;
}

export function normalizeLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}
