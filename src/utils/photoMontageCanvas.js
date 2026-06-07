export const PHOTO_MONTAGE_SIZE = {
  width: 1080,
  height: 1350,
};

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No hay imagen para generar el montaje.'));
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No pudimos cargar la foto para el montaje.'));
    image.src = url;
  });
}

export function drawImageCover(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawWave(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#043c7c');
  gradient.addColorStop(0.48, '#00a7e1');
  gradient.addColorStop(1, '#00234f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.arc(120 + i * 150, 250 + Math.sin(i) * 42, 46 + i * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.moveTo(0, 1030);
  ctx.bezierCurveTo(220, 920, 410, 1090, 620, 980);
  ctx.bezierCurveTo(810, 880, 980, 970, width, 900);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 74, 150, .24)';
  ctx.beginPath();
  ctx.moveTo(0, 1080);
  ctx.bezierCurveTo(260, 980, 430, 1140, 690, 1010);
  ctx.bezierCurveTo(840, 936, 980, 1028, width, 960);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
}

function drawDolphins(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#006a9e');
  gradient.addColorStop(0.55, '#00b2d5');
  gradient.addColorStop(1, '#dffbff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,.34)';
  for (let i = 0; i < 32; i += 1) {
    const size = 10 + (i % 5) * 7;
    ctx.beginPath();
    ctx.arc(70 + (i * 83) % width, 120 + (i * 67) % 720, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0, 29, 85, .46)';
  [[270, 260, 1], [760, 330, -1]].forEach(([x, y, direction]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(direction, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, 115, 34, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(96, -4);
    ctx.lineTo(160, -44);
    ctx.lineTo(138, 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-58, -18);
    ctx.lineTo(-90, -64);
    ctx.lineTo(-18, -24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawSunset(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#ff8a4c');
  gradient.addColorStop(0.42, '#ffce60');
  gradient.addColorStop(0.68, '#00a7e1');
  gradient.addColorStop(1, '#003c7c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 246, 190, .78)';
  ctx.beginPath();
  ctx.arc(width / 2, 330, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,.36)';
  ctx.lineWidth = 8;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(80, 820 + i * 54);
    ctx.bezierCurveTo(280, 780 + i * 54, 430, 860 + i * 54, 640, 820 + i * 54);
    ctx.bezierCurveTo(800, 790 + i * 54, 930, 840 + i * 54, width - 80, 805 + i * 54);
    ctx.stroke();
  }
}

function drawTemplateBackground(ctx, template, width, height) {
  if (template.type === 'dolphins') drawDolphins(ctx, width, height);
  else if (template.type === 'sunset') drawSunset(ctx, width, height);
  else drawWave(ctx, width, height);
}

function drawPreviewWatermark(ctx, width, height) {
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-0.38);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 110px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VISTA PREVIA', 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

export async function generatePhotoMontage({ photoUrl, template }) {
  const image = await loadImageFromUrl(photoUrl);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_MONTAGE_SIZE.width;
  canvas.height = PHOTO_MONTAGE_SIZE.height;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawTemplateBackground(ctx, template, width, height);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 29, 85, .42)';
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  roundedRect(ctx, 110, 360, 860, 700, 48);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 140, 390, 800, 640, 38);
  ctx.clip();
  drawImageCover(ctx, image, 140, 390, 800, 640);
  ctx.restore();

  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255,255,255,.78)';
  roundedRect(ctx, 140, 390, 800, 640, 38);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 29, 85, .78)';
  roundedRect(ctx, 95, 1120, 890, 120, 34);
  ctx.fill();
  ctx.fillStyle = '#ffce00';
  ctx.font = '900 42px Arial, sans-serif';
  ctx.fillText(template.name, 140, 1174);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px Arial, sans-serif';
  ctx.fillText('Yakupark Adventure · Montaje premium experimental', 140, 1214);

  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = '900 30px Arial, sans-serif';
  ctx.fillText(template.accentLabel || 'Vista previa', 140, 130);
  drawPreviewWatermark(ctx, width, height);

  try {
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    throw new Error('No pudimos exportar la vista previa. Probá con otra foto.');
  }
}

export function downloadMontageDataUrl(dataUrl, filename = 'montaje-premium-yakupark.jpg') {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}