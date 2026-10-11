const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Track]') || text.includes('[Main]') || text.includes('[AI') || text.includes('[DEBUG')) {
      console.log('BROWSER LOG:', text);
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load', timeout: 30000 });
  
  // Inject debug code to access track and kart
  await page.evaluate(() => {
    // Wait for track to be initialized
    const checkTrack = setInterval(() => {
      if (window.track && window.track.spline) {
        clearInterval(checkTrack);
        const startPt = window.track.spline.getPointAt(0);
        const tangent = window.track.spline.getTangentAt(0).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        console.log('[DEBUG] Track start: pos=(' + startPt.x.toFixed(2) + ', ' + startPt.z.toFixed(2) + ') tangent=(' + tangent.x.toFixed(2) + ', ' + tangent.z.toFixed(2) + ') normal=(' + normal.x.toFixed(2) + ', ' + normal.z.toFixed(2) + ')');
        console.log('[DEBUG] Track length: ' + window.track.trackLength.toFixed(2));
        
        // Check spline at t=0.98 (8m back if trackLength=400)
        const pt98 = window.track.spline.getPointAt(0.98);
        const tan98 = window.track.spline.getTangentAt(0.98).normalize();
        const norm98 = new THREE.Vector3(-tan98.z, 0, tan98.x);
        console.log('[DEBUG] Spline at t=0.98: pos=(' + pt98.x.toFixed(2) + ', ' + pt98.z.toFixed(2) + ') tangent=(' + tan98.x.toFixed(2) + ', ' + tan98.z.toFixed(2) + ') normal=(' + norm98.x.toFixed(2) + ', ' + norm98.z.toFixed(2) + ')');
        
        // Check road mesh bounds
        if (window.track.roadMesh) {
          const box = new THREE.Box3().setFromObject(window.track.roadMesh);
          const center = new THREE.Vector3();
          box.getCenter(center);
          const size = new THREE.Vector3();
          box.getSize(size);
          console.log('[DEBUG] Road mesh box: center=(' + center.x.toFixed(2) + ', ' + center.y.toFixed(2) + ', ' + center.z.toFixed(2) + ') size=(' + size.x.toFixed(2) + ', ' + size.y.toFixed(2) + ', ' + size.z.toFixed(2) + ')');
        }
      }
    }, 100);
  });
  
  await page.waitForTimeout(5000);
  
  // Check kart position at spawn time (after showcase+countdown ~4s)
  await page.waitForTimeout(2000);
  
  const state = await page.evaluate(() => {
    return {
      playerKartPos: window.kartPhysics ? { x: window.kartPhysics.position.x, z: window.kartPhysics.position.z } : 'not found',
    };
  }).catch(e => ({ error: String(e) }));
  console.log('GAME STATE:', JSON.stringify(state, null, 2));
  
  await browser.close();
})();