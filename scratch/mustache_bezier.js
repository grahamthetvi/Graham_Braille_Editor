function bezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
  const y = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
  return { x, y };
}

function generateMustachePoints(cx, cy, radius, steps = 20) {
  const r = radius;

  const topLobe = [];
  const p0_1 = { x: 0, y: 0.06 };
  const cp1_1 = { x: 0.15, y: -0.22 };
  const cp2_1 = { x: 0.45, y: -0.22 };
  const p3_1 = { x: 0.65, y: -0.05 };
  for (let i = 0; i <= steps; i++) {
    topLobe.push(bezier(p0_1, cp1_1, cp2_1, p3_1, i / steps));
  }

  const innerHook = [];
  const p0_2 = p3_1;
  const cp1_2 = { x: 0.72, y: -0.1 };
  const cp2_2 = { x: 0.78, y: -0.2 };
  const p3_2 = { x: 0.85, y: -0.18 };
  for (let i = 1; i <= steps; i++) {
    innerHook.push(bezier(p0_2, cp1_2, cp2_2, p3_2, i / steps));
  }

  const tipWrap = [];
  const p0_3 = p3_2;
  const cp1_3 = { x: 0.88, y: -0.16 };
  const cp2_3 = { x: 0.86, y: -0.08 };
  const p3_3 = { x: 0.8, y: -0.12 };
  for (let i = 1; i <= steps; i++) {
    tipWrap.push(bezier(p0_3, cp1_3, cp2_3, p3_3, i / steps));
  }

  const outerHook = [];
  const p0_4 = p3_3;
  const cp1_4 = { x: 0.88, y: -0.34 };
  const cp2_4 = { x: 1.15, y: -0.34 };
  const p3_4 = { x: 1.12, y: -0.15 };
  for (let i = 1; i <= steps; i++) {
    outerHook.push(bezier(p0_4, cp1_4, cp2_4, p3_4, i / steps));
  }

  const swoopBottom = [];
  const p0_5 = p3_4;
  const cp1_5 = { x: 1.1, y: 0.05 };
  const cp2_5 = { x: 1.02, y: 0.08 };
  const p3_5 = { x: 0.95, y: 0.08 };
  for (let i = 1; i <= steps; i++) {
    swoopBottom.push(bezier(p0_5, cp1_5, cp2_5, p3_5, i / steps));
  }

  const bottomLobe = [];
  const p0_6 = p3_5;
  const cp1_6 = { x: 0.8, y: 0.35 };
  const cp2_6 = { x: 0.4, y: 0.38 };
  const p3_6 = { x: 0, y: 0.12 };
  for (let i = 1; i <= steps; i++) {
    bottomLobe.push(bezier(p0_6, cp1_6, cp2_6, p3_6, i / steps));
  }

  const rightHalf = [
    ...topLobe,
    ...innerHook,
    ...tipWrap,
    ...outerHook,
    ...swoopBottom,
    ...bottomLobe
  ];

  const leftHalf = rightHalf.map(p => ({ x: -p.x, y: p.y })).reverse();

  const combined = [
    ...leftHalf,
    ...rightHalf.slice(1)
  ];

  return combined.map(p => ({
    x: Math.round(cx + p.x * r),
    y: Math.round(cy + p.y * r)
  }));
}

function printMustache(cx, cy, radius) {
  const verts = generateMustachePoints(cx, cy, radius);

  function pointInPolygonEvenOdd(x, y, verts) {
    let inside = false;
    const n = verts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = verts[i].x;
      const yi = verts[i].y;
      const xj = verts[j].x;
      const yj = verts[j].y;
      if ((yi > y) !== (yj > y)) {
        const xInt = xi + ((xj - xi) * (y - yi)) / (yj - yi + 1e-12);
        if (x < xInt) inside = !inside;
      }
    }
    return inside;
  }

  const minX = Math.round(cx - radius * 1.4);
  const maxX = Math.round(cx + radius * 1.4);
  const minY = Math.round(cy - radius * 0.8);
  const maxY = Math.round(cy + radius * 0.8);

  let output = '';
  for (let y = minY; y <= maxY; y++) {
    let row = '';
    for (let x = minX; x <= maxX; x++) {
      row += pointInPolygonEvenOdd(x + 0.5, y + 0.5, verts) ? '#' : '.';
    }
    if (row.includes('#')) {
      output += String(y).padStart(2, ' ') + ' ' + row + '\n';
    }
  }
  console.log(output);
}

printMustache(20, 20, 10);
