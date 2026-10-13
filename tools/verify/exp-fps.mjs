import { chromium } from 'playwright-core';
const B='http://127.0.0.1:8901/';
const browser = await chromium.launch({ args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport:{width:1280,height:720} });
await page.goto(B+'?track=classic',{waitUntil:'load',timeout:60000});
await page.waitForFunction(()=>window.__mk&&window.__mk.track,{timeout:60000});
await page.waitForFunction(()=>window.__mk.state&&window.__mk.state.running===true,{timeout:120000});
const t0=Date.now();
for(let i=0;i<10;i++) await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
console.log('10 frames in', Date.now()-t0, 'ms');
// overhead clone-camera render + visible toggle diff
const r = await page.evaluate(()=>{
  const {scene,renderer,camera,track}=window.__mk;
  const mesh=track.shortcutMeshes[0];
  const cam=cam_clone();
  function cam_clone(){ const c=camera.clone(); return c; }
  const sc=track.shortcuts[0];
  const mid={x:(sc.a.x+sc.b.x)/2,z:(sc.a.z+sc.b.z)/2};
  cam.position.set(mid.x,90,mid.z); cam.lookAt(mid.x,0,mid.z);
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  // project 4 corners of ribbon
  const V=(x,y,z)=>new Object({x,y,z});
  const corners=[[sc.a.x,sc.yA,sc.a.z],[sc.b.x,sc.yB,sc.b.z]];
  const nrm={x:-sc.dir.z,z:sc.dir.x};
  const pts=[
    [corners[0][0]+nrm.x*sc.halfWidth,corners[0][1],corners[0][2]+nrm.z*sc.halfWidth],
    [corners[0][0]-nrm.x*sc.halfWidth,corners[0][1],corners[0][2]-nrm.z*sc.halfWidth],
    [corners[1][0]-nrm.x*sc.halfWidth,corners[1][1],corners[1][2]-nrm.z*sc.halfWidth],
    [corners[1][0]+nrm.x*sc.halfWidth,corners[1][1],corners[1][2]+nrm.z*sc.halfWidth],
  ];
  const THREE=window.__mk.THREE||null;
  // manual projection using camera matrices
  function proj(p){
    // build view matrix manually: use cam.matrixWorldInverse via three if reachable
    const c=camera; // fallback: use cam object methods
    return null;
  }
  return {hasClone: typeof cam.project==='function', keys:Object.keys(window.__mk)};
});
console.log(JSON.stringify(r));
await browser.close();
