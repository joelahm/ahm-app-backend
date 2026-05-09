const PLAINTEXT_MAX_LENGTH = 8000;

// Walks a ProseMirror JSON document and concatenates text nodes into a
// plaintext snapshot. Hard line break for hardBreak nodes; double newline
// between block-level nodes (paragraphs, headings, list items). Defensive
// against malformed input.
function proseMirrorToPlainText(node) {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const out = [];

  function walk(current, depth = 0) {
    if (!current || typeof current !== 'object') return;

    if (current.type === 'text' && typeof current.text === 'string') {
      out.push(current.text);
      return;
    }

    if (current.type === 'hardBreak') {
      out.push('\n');
      return;
    }

    const children = Array.isArray(current.content) ? current.content : [];
    for (const child of children) {
      walk(child, depth + 1);
    }

    const blockTypes = new Set([
      'paragraph',
      'heading',
      'listItem',
      'taskItem',
      'blockquote',
      'codeBlock'
    ]);

    if (depth > 0 && current.type && blockTypes.has(current.type)) {
      out.push('\n');
    }
  }

  walk(node, 0);

  return out
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PLAINTEXT_MAX_LENGTH);
}

// Validates the shape we expect from a TipTap editor before persisting.
// Returns the parsed value or throws an Error suitable to convert to a
// 400 VALIDATION_ERROR by the caller.
const MAX_DESCRIPTION_JSON_BYTES = 200 * 1024;

function validateDescriptionJson(value) {
  if (value === null || value === undefined) return null;

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('descriptionJson must be a JSON object.');
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_DESCRIPTION_JSON_BYTES) {
    throw new Error('descriptionJson exceeds 200KB limit.');
  }

  return value;
}

module.exports = {
  proseMirrorToPlainText,
  validateDescriptionJson,
  MAX_DESCRIPTION_JSON_BYTES
};
