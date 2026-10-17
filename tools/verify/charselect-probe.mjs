// P17补 角色选择界面探针
//  验收 GUIDANCE 2026-10-17 07:17 条（06:30 spec）：
//   A) splash 后出现选人遮罩：4 张车手卡、默认选中马里奥；
//   B) ArrowRight 切换选中 → Enter 确认 → 遮罩移除、玩家换车（peach）、
//      被占角色 AI 改开让出的 mario 车（charKey/mesh/color 三处联动），
//      四角色不重复、玩家 userData.wheels 完好；
//   C) 确认后流程自动推进：巡游 → 倒计时 → running；
//   D) 零输入自动路径：遮罩 3s 自动确认默认 mario，阵容不变，照常进 running；
//   E) 全程零 console/page error。
// 用法: node charselect-probe.mjs [baseUrl]  (默认 http://127.0.0.1:8901/)
// 注意：本机 8G 软渲染，勿与 verify.js 并发（11:35 教训）；轮询间隔 ≥1s。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const BASE = process.argv[2] || 'http://127.0.0.1:8901/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOT_DIR = path.join(ROOT, 'shots', 'p17-review');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`;
  results.push(line);
  console.log(line);
  if (!ok) failures++;
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function newPage(initScripts = []) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  for (const s of initScripts) await page.addInitScript(s);
  return { page, errors };
}
const cdpShot = async (page, file) => {
  const cdp = await page.context().newCDPSession(page);
  const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
  return fs.statSync(file).size;
};
const waitMk = (page) => page.waitForFunction(
  () => window.__mk && window.__mk.scene && window.__mk.track, null, { timeout: 240000, polling: 1000 });
const waitOverlay = (page) => page.waitForFunction(
  () => !!document.getElementById('charSelectOverlay'), null, { timeout: 180000, polling: 1000 });
const waitRunning = (page) => page.waitForFunction(
  () => window.__mk && window.__mk.state && window.__mk.state.running === true, null,
  { timeout: 180000, polling: 1000 });

// ================= 路径 A/B/C：交互选人（禁用自动确认） =================
{
  const { page, errors } = await newPage(['window.__charselectTimeoutMs = 600000;']);
  await page.goto(BASE + '?track=classic', { waitUntil: 'commit', timeout: 120000 });
  await waitMk(page);
  await waitOverlay(page);

  // A. 遮罩结构：4 卡 + 默认选中 mario
  const a = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#charSelectOverlay .cs-card')];
    const sel = document.querySelector('#charSelectOverlay .cs-card[data-selected="1"]');
    return { n: cards.length, keys: cards.map((c) => c.dataset.key).join(','), sel: sel ? sel.dataset.key : null };
  });
  check('A1 选人遮罩出现且 4 张车手卡', a.n === 4, `keys=${a.keys}`);
  check('A2 默认选中 mario', a.sel === 'mario', `sel=${a.sel}`);
  const shotSize = await cdpShot(page, path.join(SHOT_DIR, '01-charselect.png'));
  check('A3 选人屏截图 >20KB', shotSize > 20000, `${path.basename('01-charselect.png')}=${shotSize}B`);

  // B. ArrowRight → peach 选中；Enter 确认 → 换车
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const b1 = await page.evaluate(() => {
    const sel = document.querySelector('#charSelectOverlay .cs-card[data-selected="1"]');
    return sel ? sel.dataset.key : null;
  });
  check('B1 ArrowRight 切换选中 → peach', b1 === 'peach', `sel=${b1}`);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('charSelectOverlay'), null,
    { timeout: 60000, polling: 1000 });
  const b2 = await page.evaluate(() => {
    const pk = window.__mk.playerKart;
    const ais = window.__mk.aiKarts.map((k) => ({ charKey: k.charKey, meshChar: k.mesh && k.mesh.userData && k.mesh.userData.character, color: k.color }));
    const all = [pk.userData && pk.userData.character, ...ais.map((x) => x.charKey)];
    return {
      playerChar: pk.userData && pk.userData.character,
      wheels: pk.userData && pk.userData.wheels ? pk.userData.wheels.length : 0,
      ais, all,
      allDistinct: new Set(all).size === 4,
    };
  });
  check('B2 玩家换车 peach（userData.character + wheels 完好）',
    b2.playerChar === 'peach' && b2.wheels === 4,
    `player=${b2.playerChar} wheels=${b2.wheels}`);
  const marioAi = b2.ais.filter((x) => x.charKey === 'mario');
  check('B3 被占角色 AI 改开 mario 车（charKey/mesh/color 联动）',
    marioAi.length === 1 && marioAi[0].meshChar === 'mario' && marioAi[0].color === 0xff3333,
    JSON.stringify(b2.ais));
  check('B4 四角色不重复', b2.allDistinct, `all=${b2.all.join(',')}`);

  // C. 流程自动推进到 running
  await waitRunning(page);
  check('C1 确认后自动进 running（巡游→倒计时→比赛）', true);
  const c2 = await page.evaluate(() => ({
    splash: window.__mk.intro.isSplashFinished(),
    paradeDone: window.__mk.state.paradeDone,
  }));
  check('C2 splash/巡游标志正常', c2.splash === true && c2.paradeDone === true, JSON.stringify(c2));
  check('E1(A) 零 console/page error', errors.length === 0, errors.slice(0, 3).join(' || '));
  await page.close();
}

// ================= 路径 D：零输入自动确认 =================
{
  const { page, errors } = await newPage();
  await page.goto(BASE + '?track=classic', { waitUntil: 'commit', timeout: 120000 });
  await waitMk(page);
  await waitOverlay(page);
  // 不碰键盘，等遮罩被自动确认移除（3s 计时 + 帧间隔）
  await page.waitForFunction(() => !document.getElementById('charSelectOverlay'), null,
    { timeout: 120000, polling: 1000 });
  await waitRunning(page);
  const d = await page.evaluate(() => ({
    playerChar: window.__mk.playerKart.userData.character,
    ais: window.__mk.aiKarts.map((k) => k.charKey).join(','),
  }));
  check('D1 零输入自动确认默认 mario，阵容不变，照常进 running',
    d.playerChar === 'mario' && d.ais === 'peach,dino,bowser',
    `player=${d.playerChar} ais=${d.ais}`);
  check('E2(D) 零 console/page error', errors.length === 0, errors.slice(0, 3).join(' || '));
  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
