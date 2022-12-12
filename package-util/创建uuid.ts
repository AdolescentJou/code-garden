export function uuid(length = 8) {
  return (Number(Math.random().toString().substring(2)) + Date.now()).toString(36).slice(0, length);
}