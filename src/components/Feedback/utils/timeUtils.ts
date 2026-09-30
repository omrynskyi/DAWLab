export function formatTimeWithTenths(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return { min: `${min < 10 ? "0" : ""}${min}`, sec: `${sec < 10 ? "0" : ""}${sec}`, tenths: `${tenths}` };
}
