// Original, self-contained Lottie artwork. No images or network assets.
const transform = (position: number[]) => ({ o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: position }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } });
const groupTransform = { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } };
const ease = { i: { x: [.25, .25, .25], y: [1, 1, 1] }, o: { x: [.2, .2, .2], y: [0, 0, 0] } };

export function confirmationAnimation() {
  return { v: "5.12.2", fr: 60, ip: 0, op: 60, w: 120, h: 120, nm: "Attendance confirmed", ddd: 0, assets: [], layers: [
    { ddd: 0, ind: 1, ty: 4, nm: "Check", sr: 1, ks: transform([60, 60, 0]), ao: 0, shapes: [{ ty: "gr", it: [
      { ty: "sh", ks: { a: 0, k: { i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[-20, 0], [-5, 15], [23, -15]], c: false } } },
      { ty: "st", c: { a: 0, k: [1, 1, 1, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 7 }, lc: 2, lj: 2 },
      { ty: "tm", s: { a: 0, k: 0 }, e: { a: 1, k: [{ t: 16, s: [0], e: [100], i: { x: [.5], y: [1] }, o: { x: [.3], y: [0] } }, { t: 43, s: [100] }] }, o: { a: 0, k: 0 }, m: 1 }, groupTransform,
    ] }], ip: 0, op: 60, st: 0, bm: 0 },
    { ddd: 0, ind: 2, ty: 4, nm: "Circle", sr: 1, ks: { ...transform([60, 60, 0]), s: { a: 1, k: [{ t: 0, s: [0, 0, 100], e: [112, 112, 100], ...ease }, { t: 20, s: [112, 112, 100], e: [100, 100, 100], ...ease }, { t: 32, s: [100, 100, 100] }] } }, ao: 0, shapes: [{ ty: "gr", it: [
      { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [104, 104] }, d: 1 },
      { ty: "fl", c: { a: 0, k: [1, 1, 1, 1] }, o: { a: 0, k: 12 }, r: 1 }, groupTransform,
    ] }], ip: 0, op: 60, st: 0, bm: 0 },
  ] };
}

export function loadingAnimation() {
  return { v: "5.12.2", fr: 60, ip: 0, op: 60, w: 120, h: 60, nm: "Loading", ddd: 0, assets: [], layers: [0, 1, 2].map(index => ({
    ddd: 0, ind: index + 1, ty: 4, nm: `Dot ${index + 1}`, sr: 1,
    ks: { ...transform([30 + index * 30, 30, 0]), o: { a: 1, k: [
      { t: 0, s: [30], e: [30], i: { x: [.5], y: [1] }, o: { x: [.5], y: [0] } },
      { t: 1 + index * 8, s: [30], e: [100], i: { x: [.5], y: [1] }, o: { x: [.5], y: [0] } },
      { t: 16 + index * 8, s: [100], e: [30], i: { x: [.5], y: [1] }, o: { x: [.5], y: [0] } },
      { t: 32 + index * 8, s: [30] },
    ] } }, ao: 0, shapes: [{ ty: "gr", it: [
      { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [14, 14] }, d: 1 },
      { ty: "fl", c: { a: 0, k: [1, 1, 1, 1] }, o: { a: 0, k: 100 }, r: 1 }, groupTransform,
    ] }], ip: 0, op: 60, st: 0, bm: 0,
  })) };
}
