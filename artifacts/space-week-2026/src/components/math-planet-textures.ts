import * as THREE from 'three';

const palettes: Record<string, [string, string, string]> = {
  mercury: ['#817f7d', '#b1aaa0', '#514e4b'],
  venus: ['#bd6535', '#efb85f', '#963f28'],
  earth: ['#123d71', '#51a8bd', '#d9e8dc'],
  mars: ['#a74332', '#dc7952', '#662c2e'],
  jupiter: ['#a56d4f', '#ead0a2', '#77443d'],
  saturn: ['#aa9468', '#e6d6a6', '#766243'],
  uranus: ['#468f9a', '#b3ebea', '#357782'],
  neptune: ['#183a9a', '#547ded', '#10245c'],
  sun: ['#e87531', '#fff0a3', '#bd3c21'],
};

function seeded(seed: string) {
  let value = [...seed].reduce((result, character) => result * 31 + character.charCodeAt(0), 7) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export function makeMathPlanetTexture(id: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const [dark, light, shadow] = palettes[id] ?? palettes.mercury;
  const random = seeded(id);
  context.fillStyle = dark;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (id === 'mercury' || id === 'mars') {
    for (let i = 0; i < 190; i++) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = id === 'mercury' ? 2 + random() * 13 : 1.5 + random() * 8;
      const gradient = context.createRadialGradient(x - radius * .25, y - radius * .25, 1, x, y, radius);
      gradient.addColorStop(0, `${light}22`);
      gradient.addColorStop(.72, `${shadow}b0`);
      gradient.addColorStop(1, `${light}b8`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `${light}55`;
      context.lineWidth = 1.2;
      context.stroke();
    }
    if (id === 'mars') {
      for (let i = 0; i < 8; i++) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        context.fillStyle = `${shadow}65`;
        context.beginPath();
        context.ellipse(x, y, 22 + random() * 50, 5 + random() * 15, random(), 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (id === 'earth') {
    context.fillStyle = '#34754e';
    const continents = [
      [82, 78, 54, 36], [137, 124, 27, 59], [258, 75, 70, 33],
      [302, 126, 26, 57], [406, 68, 55, 27], [449, 144, 37, 32],
    ];
    for (const [x, y, rx, ry] of continents) {
      context.beginPath();
      context.ellipse(x, y, rx, ry, -.35, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = 'rgba(238,250,255,.56)';
    context.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      const y = 12 + i * 20;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(150, y - 18, 335, y + 17, 512, y - 7);
      context.stroke();
    }
    context.strokeStyle = 'rgba(255,255,255,.7)';
    context.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const y = random() * canvas.height;
      context.beginPath();
      context.moveTo(random() * 180, y);
      context.bezierCurveTo(185, y - 23, 324, y + 23, 512, y - 8);
      context.stroke();
    }
  } else if (id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune') {
    const bandColors = id === 'jupiter'
      ? ['#dcb887', '#88594b', '#f0d7a8', '#a96f55', '#e8c897']
      : id === 'saturn'
        ? ['#e8d4a6', '#99815d', '#d5bd8c', '#806e50']
        : id === 'uranus'
          ? ['#a8e7e3', '#438d99', '#c3f1ec']
          : ['#3767dc', '#102b85', '#6892f2'];
    for (let y = -12, row = 0; y < canvas.height + 16; row++) {
      const bandHeight = 9 + random() * 23;
      context.fillStyle = bandColors[row % bandColors.length];
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(125, y - 5 - random() * 7, 355, y + 6 + random() * 8, canvas.width, y - 2);
      context.lineTo(canvas.width, y + bandHeight);
      context.bezierCurveTo(340, y + bandHeight + 4, 170, y + bandHeight - 4, 0, y + bandHeight + 2);
      context.closePath();
      context.globalAlpha = .38 + random() * .42;
      context.fill();
      context.globalAlpha = 1;
      y += bandHeight;
    }
    if (id === 'jupiter') {
      const spot = context.createRadialGradient(358, 144, 3, 358, 144, 35);
      spot.addColorStop(0, '#d98765');
      spot.addColorStop(.65, '#b65340');
      spot.addColorStop(1, '#85483b');
      context.fillStyle = spot;
      context.beginPath();
      context.ellipse(358, 144, 35, 17, -.12, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255,217,175,.45)';
      context.lineWidth = 2;
      context.stroke();
    }
  } else if (id === 'venus') {
    for (let i = 0; i < 28; i++) {
      const y = random() * canvas.height;
      context.strokeStyle = i % 2 ? 'rgba(255,221,140,.26)' : 'rgba(123,53,30,.24)';
      context.lineWidth = 4 + random() * 15;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(130, y - 42 + random() * 20, 350, y + 36 - random() * 28, canvas.width, y - 17);
      context.stroke();
    }
  } else {
    for (let i = 0; i < 100; i++) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 2 + random() * 16;
      context.fillStyle = i % 2 ? `${light}18` : `${shadow}30`;
      context.beginPath();
      context.ellipse(x, y, radius * 1.8, radius * .65, -.2, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}
