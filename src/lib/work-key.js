// Existing numeric YMGal URLs remain stable. CnGal-only works use a namespace,
// never an invented numeric gid that could later collide with YMGal.
export function workKey(value) {
  const key = String(value ?? '');
  return /^(?:[1-9]\d{0,8}|(?:cn|vn|bg)[1-9]\d{0,8})$/.test(key) ? key : '';
}
