function testE3WithClamp() {
  const cx = 20;
  const cy = 20;
  const radius = 15;
  const maxT = 1.15;
  const minThickness = 0.13;
  const a = 0.7;
  const b = 1.0;

  const isInsideMustache = (x, y) => {
    const dx = (x - cx) / radius;
    const dy = (y - cy) / radius;
    const t = Math.abs(dx);

    if (t > maxT) return false;

    const yCenter = a * t - b * Math.pow(t, 2);
    let thickness = (0.25 + 0.15 * Math.sin((t * Math.PI) / maxT)) * (maxT - t);
    
    if (thickness < minThickness) {
      thickness = minThickness;
    }

    const yTop = yCenter - thickness / 2;
    const yBottom = yCenter + thickness / 2;
    return dy >= yTop && dy <= yBottom;
  };

  let output = '';
  for (let y = 1; y <= 40; y++) {
    let row = '';
    for (let x = 1; x <= 40; x++) {
      row += isInsideMustache(x, y) ? '#' : '.';
    }
    if (row.includes('#')) {
      output += String(y).padStart(2, ' ') + ' ' + row + '\n';
    }
  }
  console.log(output);
}

testE3WithClamp();
