// P13 边缘线/红白路肩 Z-fighting 专项探针：
// 1) 几何检查：路肩 y=0.04、白边线 y=0.06、加速带 y=0.05、路面/路肩材质 polygonOffset 生效
// 2) 像素检查：7s 发车视角截图中，左右两侧路肩带应出现红白条纹（红色像素），
//    而不是被草地（绿色）盖住——即路肩真实渲染、未与地面共面镂空
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://127.0.0.1:8901/');
await page.waitForTimeout(7000);
await page.screenshot({ path: 'shots/curb-p13-7s.png' });

// --- 1) 几何/材质检查 ---
const geo = await page.evaluate(() => {
  const out = {};
  const t = window.track;
  const sh = t.shoulderMeshes[0];
  out.shoulderY = sh.geometry.attributes.position.getY(0);
  out.shoulderPolyOffset = sh.material.polygonOffset === true && sh.material.polygonOffsetFactor < 0;
  out.roadPolyOffset = t.roadMesh.material.polygonOffset === true && t.roadMesh.material.polygonOffsetFactor < 0;
  out.roadY = t.roadMesh.geometry.attributes.position.getY(0);
  // 白色边线（THREE.Line）
  let lineY = null;
  t.scene.traverse((o) => { if (lineY === null && o.isLine && o.type === 'Line') lineY = o.geometry.attributes.position.getY(0); });
  out.edgeLineY = lineY;
  // 加速带（蓝色 MeshBasicMaterial 0x00aaff）
  let boostY = null;
  t.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0x00aaff && boostY === null) {
      boostY = o.geometry.attributes.position.getY(0);
    }
  });
  out.boostPadY = boostY;
  return out;
});

// --- 2) 像素检查：把截图喂回 canvas 分析 ---
const b64 = (await page.screenshot()).toString('base64');
const px = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = 'data:image/png;base64,' + dataUrl; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  // 只看下半屏（近处路肩清晰、避开远处看台红色座椅）
  const y0 = Math.floor(img.height * 0.55);
  const d = g.getImageData(0, y0, img.width, img.height - y0).data;
  let red = 0, white = 0, green = 0, asphalt = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r > 140 && gg < 90 && b < 90) red++;
    else if (r > 200 && gg > 200 && b > 200) white++;
    else if (gg > 90 && gg > r + 25 && gg > b + 25) green++;
    else if (r < 95 && gg < 95 && b < 95) asphalt++;
  }
  return { red, white, green, asphalt, total: d.length / 4 };
}, b64);

const curbStripes = px.red > 500 && px.white > 500; // 红+白条纹都出现才算路肩在渲染
const result = {
  errors,
  geo,
  pixels: px,
  checks: {
    shoulderRaised: Math.abs(geo.shoulderY - 0.04) < 1e-6,
    edgeLineRaised: Math.abs(geo.edgeLineY - 0.06) < 1e-6,
    boostPadRaised: Math.abs(geo.boostPadY - 0.05) < 1e-6,
    roadAboveGround: geo.roadY > 0.005,
    polyOffsets: geo.shoulderPolyOffset && geo.roadPolyOffset,
    curbStripesVisible: curbStripes,
  },
};
result.ok = result.errors.length === 0 && Object.values(result.checks).every(Boolean);
console.log(JSON.stringify(result, null, 1));
await browser.close();
process.exit(result.ok ? 0 : 1);
