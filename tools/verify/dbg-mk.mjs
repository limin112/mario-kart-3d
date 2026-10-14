import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,200)));
await page.goto('http://127.0.0.1:8901/?track=classic', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__mk && window.__mk.intro, null, { timeout: 90000 });
for (const t of [0, 0.6, 1.25, 1.9, 2.5, 3.0, 3.4, 3.5]) {
  const s = await page.evaluate((t) => {
    const mk = window.__mk;
    mk.intro.setSplashFinished(false);
    mk.intro.setParadeTime(t);
    mk.intro.updateParade();
    const cam = mk.camera;
    cam.updateMatrixWorld();
    const V = cam.position.constructor;
    const ndc = (x,y,z) => { const p = new V(x,y,z); p.project(cam); return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; };
    const karts = [mk.playerKart.position, ...window.__ai.aiKarts.map(k=>k.mesh.position)];
    const gate = mk.track.getStartLineInfo().position;
    const inf = (p) => Math.abs(p[0])<=1 && Math.abs(p[1])<=1 && p[2]<1;
    return {
      t, cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
      pd: mk.state.paradeDone, pm: mk.state.paradeMode,
      kartsIn: karts.map(k => inf(ndc(k.x, k.y+0.6, k.z))).filter(Boolean).length,
      gateIn: inf(ndc(gate.x, gate.y+3, gate.z)),
      kartNdc: karts.map(k => ndc(k.x, k.y+0.6, k.z)), gateNdc: ndc(gate.x, gate.y+3, gate.z),
    };
  }, t);
  console.log(JSON.stringify(s));
}
await browser.close();
