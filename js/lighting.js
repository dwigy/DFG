// Dithered darkness: the world is drawn, then a half-resolution shadow layer is
// laid over it with an ordered (Bayer) dither so light falls off in hard 8-bit bands.
G.Light = (function () {
  const LW = 160, LH = 90;
  const cv = document.createElement('canvas');
  cv.width = LW; cv.height = LH;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(LW, LH);
  const D = img.data;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
  const vig = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const dx = (x / LW - 0.5) * 2, dy = (y / LH - 0.5) * 2;
    vig[y * LW + x] = Math.max(0, dx * dx + dy * dy - 0.45) * 0.2;
  }

  // lights: [{x, y, r, s (strength 0..1), w (warmth 0..1)}] in world pixels
  function render(ctx, camX, camY, ambient, lights) {
    const n = lights.length;
    for (let by = 0; by < LH; by++) {
      const wy = camY + by * 2 + 1;
      for (let bx = 0; bx < LW; bx++) {
        const i = by * LW + bx;
        const wx = camX + bx * 2 + 1;
        let d = ambient + vig[i];
        let warm = 0;
        for (let l = 0; l < n; l++) {
          const L = lights[l];
          const dx = wx - L.x;
          if (dx > L.r || dx < -L.r) continue;
          const dy = wy - L.y;
          if (dy > L.r || dy < -L.r) continue;
          const dd = dx * dx + dy * dy;
          if (dd < L.r * L.r) {
            const f = 1 - Math.sqrt(dd) / L.r;
            d *= 1 - f * L.s;
            warm += f * (L.w || 0);
          }
        }
        if (d < 0) d = 0; else if (d > 1) d = 1;
        let q = Math.floor(d * 4 + BAYER[(bx & 3) | ((by & 3) << 2)]) / 4;
        if (q > 1) q = 1;
        if (warm > 1) warm = 1;
        const p = i * 4;
        D[p] = 13 + warm * 70;
        D[p + 1] = 11 + warm * 22;
        D[p + 2] = 20 - warm * 8;
        D[p + 3] = q * 242;
      }
    }
    cx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, 0, LW * 2, LH * 2);
  }
  return { render };
})();
