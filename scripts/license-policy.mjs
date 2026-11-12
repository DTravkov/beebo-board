// Keep this list explicit. Adding a license requires a documented permissive-license review.
export const ALLOWED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'BlueOak-1.0.0',
]);

export function permitted(expression) {
  if (typeof expression !== 'string' || !expression.trim()) return false;
  const tokens = expression.match(/\(|\)|[A-Za-z0-9.+-]+/g) ?? [];
  if (tokens.join('') !== expression.replace(/\s/g, '')) return false;
  let index = 0;
  function atom() {
    const token = tokens[index++];
    if (token === '(') {
      const result = or();
      if (tokens[index++] !== ')')
        throw new Error('Unclosed license expression');
      return result;
    }
    if (!token || ['AND', 'OR', 'WITH', ')'].includes(token))
      throw new Error('Invalid license expression');
    return ALLOWED_LICENSES.has(token);
  }
  function and() {
    let result = atom();
    while (tokens[index] === 'AND') {
      index++;
      const right = atom();
      result = result && right;
    }
    return result;
  }
  function or() {
    let result = and();
    while (tokens[index] === 'OR') {
      index++;
      const right = and();
      result = result || right;
    }
    return result;
  }
  try {
    const result = or();
    return index === tokens.length && result;
  } catch {
    return false;
  }
}
