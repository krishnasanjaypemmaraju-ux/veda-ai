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
