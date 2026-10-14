import * as THREE from 'three';
import { Track } from './track.js';
import { AIManager } from './ai.js';
import { PlayerItemManager, AIItemManager } from './items.js';
import { ParticleSystem } from './particles.js';
import { createKart } from './kart.js';
import { AudioManager } from './audio.js';
import { startSplash } from './splash.js';
import { showRoundBanner } from './rounds.js';
import { getTheme } from './themes.js';
import { TRACK_LAYOUTS } from './trackdefs.js';

// ============ 全局状态 ============
const state = {
  running: false,
  started: false,
  finished: false,
  time: 0,
  lap: 0,
  bestLap: Infinity,
  lapTimes: [],
  currentLapStart: 0,
  speed: 0,
  rank: 1,
  countdown: 3,
  lastCheckpointIndex: -1,
  passedStartLine: false,
  totalTime: 0,
  // P24: 发车格巡游开场（替代旧 P7 零件爆炸展示）
  paradeMode: true,       // splash 播完到镜头落位车尾之间为 true
  paradeStartTime: 0,
  paradeDone: false,      // 巡游结束（落位车尾/被跳过），之后进倒计时
};

// 全局游戏时间（基于 rAF 时间戳，秒），避免 performance.now() 在 headless 下不同步
let gameTime = 0;

// ============ Three.js 场景 ============
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// P14：主题选择（URL 参数 ?theme=classic|desert|snow，未知名字兜底 classic）。
// P14b：赛道布局（?track=classic|dune|glacier）；未指定 theme 时用布局建议主题，显式 ?theme= 优先。
const URL_PARAMS = new URLSearchParams(location.search);
const TRACK_NAME = URL_PARAMS.get('track') || 'classic';
const THEME_NAME = URL_PARAMS.get('theme') || (TRACK_LAYOUTS[TRACK_NAME] && TRACK_LAYOUTS[TRACK_NAME].theme) || 'classic';
const raceTheme = getTheme(THEME_NAME);
scene.background = new THREE.Color(raceTheme.sceneBg ?? 0x87ceeb); // 天空蓝（比赛模式）

// 相机
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
// P16 第二步：初始相机位 = 展示 intro 起手位（angle 0、radius 30、height 12），
// splash 期间冻结渲染的就是这一帧，解冻进 intro 时零跳变。
camera.position.set(0, 12, 30);
camera.lookAt(0, 1.5, 0);

// 灯光（P6 优化：更真实的日照、更大范围阴影、环境光增强）
const hemiLight = new THREE.HemisphereLight(raceTheme.hemiSky ?? 0xffeedd, raceTheme.hemiGround ?? 0x445566, raceTheme.hemiIntensity ?? 1.0); // 略带暖色的天光 + 冷色地反射
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(raceTheme.sunColor ?? 0xffffee, raceTheme.sunIntensity ?? 2.0); // 暖白色阳光，强度提升
dirLight.position.set(80, 150, 60);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;  // 更高分辨率阴影贴图
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 350;
dirLight.shadow.camera.left = -140;
dirLight.shadow.camera.right = 140;
dirLight.shadow.camera.top = 140;
dirLight.shadow.camera.bottom = -140;
dirLight.shadow.bias = -0.0005;        // 减少阴影 acne
dirLight.shadow.normalBias = 0.02;
dirLight.shadow.radius = 3;            // PCF 软阴影模糊半径
scene.add(dirLight);

// 补光：模拟天空环境光（从上方柔和照亮阴影面）
const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
fillLight.position.set(-50, 80, -40);
fillLight.castShadow = false;
scene.add(fillLight);

// 微弱环境光兜底
const ambientLight = new THREE.AmbientLight(0x222233, 0.5);
scene.add(ambientLight);

// ============ 地面 ============
const groundGeo = new THREE.PlaneGeometry(500, 500);
const groundMat = new THREE.MeshStandardMaterial({
  color: raceTheme.ground ?? 0x3a5f0b,
  roughness: 0.9,
  metalness: 0.1,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 网格辅助线
const gridHelper = new THREE.GridHelper(500, 50, raceTheme.grid ?? 0x2d4a08, raceTheme.grid ?? 0x2d4a08);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const playerKart = createKart(0x33ff33);
playerKart.position.set(0, 0, 5);
scene.add(playerKart);

// ============ 赛道系统 (P2) ============
const track = new Track(scene, THEME_NAME, TRACK_NAME);
window.track = track; // DEBUG
// DEBUG: tools/shot/shot.js 用只读探针钩子（同 ai.js __ai 先例，不影响任何逻辑）
window.__mk = { scene, camera, renderer, track };

// ============ 粒子系统 (P6: 收尾) ============
const particleSystem = new ParticleSystem(scene);
Object.assign(window.__mk, { particleSystem, playerKart }); // DEBUG: 探针遍历场景用（合并，勿覆盖 track 钩子）

// ============ 输入处理 ============
const keys = { forward: false, backward: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
  // P24: 巡游开场期间任意键跳过（直接落位车尾进倒计时）；
  // P16: 开屏 splash 期间吞掉按键（交给 splash 自己的监听器）
  if (state.paradeMode && !state.paradeDone) {
    if (splashFinished) skipParade();
    return;
  }
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.forward = true; break;
    case 'KeyS': case 'ArrowDown': keys.backward = true; break;
    case 'KeyA': case 'ArrowLeft': keys.left = true; break;
    case 'KeyD': case 'ArrowRight': keys.right = true; break;
    case 'Space': if (playerItemManager) playerItemManager.useItem(); break;
    case 'KeyR': if (state.finished) location.reload(); break;
    case 'KeyM': toggleMute(); break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.forward = false; break;
    case 'KeyS': case 'ArrowDown': keys.backward = false; break;
    case 'KeyA': case 'ArrowLeft': keys.left = false; break;
    case 'KeyD': case 'ArrowRight': keys.right = false; break;
  }
});

// 点击也可跳过巡游开场
window.addEventListener('click', () => {
  if (state.paradeMode && !state.paradeDone && splashFinished) {
    skipParade();
  }
});

// ============ 玩家物理（街机式）===========
const kartPhysics = {
  position: new THREE.Vector3(0, 0, 5),
  velocity: new THREE.Vector3(0, 0, 0),
  rotation: 0, // y 轴旋转（弧度）
  maxSpeed: 35,
  baseMaxSpeed: 35,
  acceleration: 45,
  brakeForce: 60,
  friction: 0.98,
  turnSpeed: 3.0,
  driftFactor: 0.95,
  lap: 0,
  finished: false,
  totalTime: 0,
  lastCheckpointIndex: -1,
  passedStartLine: false,
  currentLapStart: 0,
  lapTimes: [],
};
window.kartPhysics = kartPhysics; // DEBUG

// ============ AI 对手 (P4) ============
const aiManager = new AIManager(scene, track, kartPhysics);

// ============ 道具系统 (P5) ============
let playerItemManager = null;
let aiItemManager = null;

// ============ 音效系统 (P10) ============
// WebAudio 程序化合成：引擎音随速度变调、倒计时 beep、道具音效
const audio = new AudioManager();

// M 键静音开关 + HUD 状态小图标
function toggleMute() {
  const muted = audio.toggleMute();
  const el = document.getElementById('muteHint');
  if (el) {
    el.textContent = muted ? '🔇 已静音' : '🔊 音效';
    el.classList.toggle('muted', muted);
  }
}

// 加速带 whoosh 音冷却（避免在带上每帧重复触发）
let boostSfxCooldown = 0;

// 首次用户手势时解锁 AudioContext（自动播放策略），一次性
const unlockAudioOnce = () => {
  audio.unlock();
  window.removeEventListener('keydown', unlockAudioOnce);
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('touchstart', unlockAudioOnce);
};
window.addEventListener('keydown', unlockAudioOnce);
window.addEventListener('pointerdown', unlockAudioOnce);
window.addEventListener('touchstart', unlockAudioOnce);

aiItemManager = new AIItemManager(scene, track, aiManager.aiKarts, audio, particleSystem);
playerItemManager = new PlayerItemManager(scene, track, kartPhysics, audio, aiItemManager, particleSystem);
aiItemManager.setItemBoxes(playerItemManager.itemBoxes);
Object.assign(window.__mk, { playerItemManager, aiItemManager, kartPhysics, state }); // DEBUG: 探针读捷径常驻香蕉/AI 共享碰撞/传送计圈用（同 window.__ai 先例）

function updatePhysics(dt) {
  const p = kartPhysics;
  let accel = 0;

  if (keys.forward) accel = p.acceleration;
  if (keys.backward) accel = -p.brakeForce * 0.5;

  // 前进方向向量
  const forward = new THREE.Vector3(
    -Math.sin(p.rotation),
    0,
    -Math.cos(p.rotation)
  );

  // 施加加速度
  p.velocity.addScaledVector(forward, accel * dt);

  // 摩擦
  const isSlipping = playerItemManager?.getIsSlipping() || false;
  const friction = isSlipping ? 0.85 : p.friction; // 打滑时摩擦更大
  p.velocity.multiplyScalar(Math.pow(friction, dt * 60));

  // 限制最大速度
  const speed = p.velocity.length();
  if (speed > p.maxSpeed) {
    p.velocity.normalize().multiplyScalar(p.maxSpeed);
  }

  // 转向（只有在移动时才能转）
  if (speed > 0.5) {
    let turnInput = 0;
    if (keys.left) turnInput = 1;
    if (keys.right) turnInput = -1;

    // 打滑时转向失控（随机抖动）
    let turnSpeed = p.turnSpeed;
    if (isSlipping) {
      turnSpeed *= 0.3; // 转向能力大幅下降
      turnInput += (Math.random() - 0.5) * 2; // 随机抖动
    }

    // 转向随速度衰减（高速转向变慢，低速转向快）
    const speedFactor = THREE.MathUtils.clamp(speed / p.maxSpeed, 0.3, 1.0);
    p.rotation += turnInput * turnSpeed * speedFactor * dt;
  }

  // 位置更新
  p.position.addScaledVector(p.velocity, dt);

  // 出界检测：草地减速
  const onRoad = track.isOnRoad(p.position);
  const onTrack = track.isOnTrack(p.position);
  
  if (!onTrack) {
    // 完全出界：强力减速并拉回
    p.velocity.multiplyScalar(0.7);
    // 向赛道中心施加修正力
    const closest = track.getClosestPoint(p.position);
    const toCenter = closest.point.clone().sub(p.position);
    toCenter.y = 0;
    if (toCenter.length() > 0.1) {
      toCenter.normalize().multiplyScalar(30 * dt);
      p.velocity.add(toCenter);
    }
  } else if (!onRoad) {
    // 在路肩上：中等减速
    p.velocity.multiplyScalar(0.92);
  }

  // P19b：发夹弯外侧护墙硬碰撞——位置拉回墙内，向外速度分量归零（轻微回弹）
  const wallHit = track.getHairpinWallHit(p.position);
  if (wallHit) {
    const outDir = wallHit.normal.clone().multiplyScalar(wallHit.side); // 朝弯道外侧的单位向量
    p.position.addScaledVector(outDir, -wallHit.excess);
    const outwardSpeed = p.velocity.dot(outDir);
    if (outwardSpeed > 0) p.velocity.addScaledVector(outDir, -outwardSpeed * 1.2);
  }
  
  // 加速带检测
  const boostMult = track.getBoostMultiplier(p.position);
  if (boostMult > 1.0) {
    p.velocity.multiplyScalar(1 + (boostMult - 1.0) * dt * 3);
    if (boostSfxCooldown <= 0) {
      audio.playBoostPad();
      boostSfxCooldown = 0.6;
    }
  }
  boostSfxCooldown = Math.max(0, boostSfxCooldown - dt);
  
  // 简单边界（防止开出地图）
  const bound = 240;
  p.position.x = THREE.MathUtils.clamp(p.position.x, -bound, bound);
  p.position.z = THREE.MathUtils.clamp(p.position.z, -bound, bound);

  // P19c：车身 y 跟随路面高程（缓坡）
  p.position.y = track.getSurfaceY(p.position);

  // 同步到 Three.js 对象
  playerKart.position.copy(p.position);
  playerKart.rotation.y = p.rotation;

  // 轮子转动 (新结构: wheel.tire 是轮胎网格)
  const wheelRotation = speed * dt * 5;
  for (const wheel of playerKart.userData.wheels) {
    wheel.tire.rotation.x += wheelRotation;
  }

  // 轮胎烟雾：高速加速或急转弯时
  const accelInput = keys.forward ? 1 : (keys.backward ? -1 : 0);
  const turnInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const isDrifting = Math.abs(turnInput) > 0 && speed > p.maxSpeed * 0.5;
  const smokeIntensity = (accelInput > 0 ? speed / p.maxSpeed : 0) + (isDrifting ? 0.5 : 0);
  if (smokeIntensity > 0.3 && Math.random() < 0.4) {
    // 后轮位置
    const rearWheels = playerKart.userData.wheels.slice(2);
    for (const wheel of rearWheels) {
      const wheelWorldPos = new THREE.Vector3();
      wheel.group.getWorldPosition(wheelWorldPos);
      particleSystem.emitTireSmoke(wheelWorldPos, p.velocity, smokeIntensity);
    }
  }

  // 加速带粒子
  if (boostMult > 1.0) {
    particleSystem.emitBoost(p.position);
  }

  // 更新速度显示（km/h 换算）
  state.speed = Math.round(speed * 3.6);

  // 引擎音：随速度变调（相对基础极速，蘑菇超速时 >1 继续上扬）、
  // 随油门/刹车变音量、蘑菇加速中额外轰响
  const engineBoost = p.maxSpeed > p.baseMaxSpeed * 1.01 ? 1 : 0;
  audio.setEngine(Math.min(speed / p.baseMaxSpeed, 1.3), accelInput, engineBoost);
}

// ============ 跟随镜头 ============
const cameraOffset = new THREE.Vector3(0, 6, 12);
const cameraTarget = new THREE.Vector3();

function updateCamera(dt) {
  // 目标点：车身后上方
  const kartPos = playerKart.position;
  const kartRot = playerKart.rotation.y;

  // 计算理想相机位置
  const idealPos = new THREE.Vector3();
  idealPos.x = kartPos.x + Math.sin(kartRot) * cameraOffset.z;
  idealPos.z = kartPos.z + Math.cos(kartRot) * cameraOffset.z;
  idealPos.y = kartPos.y + cameraOffset.y;

  // 计算理想看向点（车头前方）
  cameraTarget.x = kartPos.x - Math.sin(kartRot) * 5;
  cameraTarget.z = kartPos.z - Math.cos(kartRot) * 5;
  cameraTarget.y = kartPos.y + 1;

  // 平滑插值
  camera.position.lerp(idealPos, 1 - Math.exp(-8 * dt));
  camera.lookAt(cameraTarget);
}

// P16 第二步：相机瞬移到车尾跟随位（展示→发车视角切换用，之后 updateCamera 接管）
function snapCameraBehindKart() {
  const kartPos = playerKart.position;
  const rot = playerKart.rotation.y;
  camera.position.set(
    kartPos.x + Math.sin(rot) * cameraOffset.z,
    kartPos.y + cameraOffset.y,
    kartPos.z + Math.cos(rot) * cameraOffset.z
  );
  camera.lookAt(
    kartPos.x - Math.sin(rot) * 5,
    kartPos.y + 1,
    kartPos.z - Math.cos(rot) * 5
  );
}

// ============ HUD 更新 ============
function updateHUD() {
  document.getElementById('speed').textContent = state.speed;
  document.getElementById('lap').textContent = state.lap;
  const currentLapTime = state.running && !state.finished 
    ? (gameTime - state.currentLapStart)
    : (state.lapTimes[state.lapTimes.length - 1] || 0);
  document.getElementById('currentLapTime').textContent = currentLapTime.toFixed(2);
  // 总时间 = 已完成圈数总和 + 当前圈时间
  const totalRaceTime = state.running && !state.finished
    ? state.lapTimes.reduce((a, b) => a + b, 0) + currentLapTime
    : state.time;
  document.getElementById('totalTime').textContent = totalRaceTime.toFixed(2);
  document.getElementById('best').textContent = state.bestLap === Infinity ? '--' : state.bestLap.toFixed(2);
  document.getElementById('rank').textContent = state.rank;
  // 道具显示由 PlayerItemManager 处理
}

// ============ 倒计时状态（在游戏循环中按帧更新，避免 setTimeout 在 headless 下被限流）===========
const countdownState = {
  active: false,
  step: 0, // 0=3, 1=2, 2=1, 3=GO!, 4=done
  stepStartTime: 0,
  stepDuration: 0.4, // 每步 0.4 秒
  texts: ['3', '2', '1', 'GO!'],
  element: null,
  resolve: null,
  lastBeepStep: -1, // 已播放过 beep 的步骤（防重复）
};

function startCountdown() {
  countdownState.active = true;
  countdownState.step = 0;
  countdownState.lastBeepStep = -1;
  countdownState.stepStartTime = gameTime;
  countdownState.element = document.getElementById('countdown');
  countdownState.element.style.display = 'block';
  // 返回一个会在倒计时结束时 resolve 的 Promise（供外部 await）
  return new Promise((resolve) => {
    countdownState.resolve = resolve;
  });
}

function updateCountdown(elapsedTime) {
  if (!countdownState.active) return false;
  
  let stepElapsed = elapsedTime - countdownState.stepStartTime;
  const el = countdownState.element;
  
  if (countdownState.step < 4) {
    // 每个步骤开始时播放 beep（3/2/1 短音，GO 长音）
    if (countdownState.step !== countdownState.lastBeepStep) {
      countdownState.lastBeepStep = countdownState.step;
      if (countdownState.step === 3) {
        audio.playGoBeep();
      } else {
        audio.playCountdownBeep(countdownState.step);
      }
    }
    // 显示当前步骤
    if (stepElapsed < countdownState.stepDuration * 0.8) {
      // 前 80% 时间显示文字
      el.textContent = countdownState.texts[countdownState.step];
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, -50%) scale(1)';
    } else {
      // 后 20% 时间淡出
      const fadeProgress = (stepElapsed - countdownState.stepDuration * 0.8) / (countdownState.stepDuration * 0.2);
      el.style.opacity = 1 - Math.min(fadeProgress, 1);
      el.style.transform = 'translate(-50%, -50%) scale(' + (1 + Math.min(fadeProgress, 1) * 0.3) + ')';;
    }
    
    // 步骤结束：处理大时间跳跃（headless/throttled 环境下可能一次跨过多个步骤）
    while (stepElapsed >= countdownState.stepDuration && countdownState.step < 4) {
      countdownState.step++;
      countdownState.stepStartTime += countdownState.stepDuration;
      stepElapsed = elapsedTime - countdownState.stepStartTime;
      // 步骤变更时播放 beep
      if (countdownState.step !== countdownState.lastBeepStep && countdownState.step < 4) {
        countdownState.lastBeepStep = countdownState.step;
        if (countdownState.step === 3) {
          audio.playGoBeep();
        } else {
          audio.playCountdownBeep(countdownState.step);
        }
      }
    }
    // 如果 while 循环推进到了 step >= 4，直接进入结束逻辑
    if (countdownState.step >= 4) {
      el.style.display = 'none';
      countdownState.active = false;
      if (countdownState.resolve) countdownState.resolve();
      return true;
    }
    return false; // 还未结束
  } else {
    // 倒计时结束（正常逐帧推进到 step=4）
    el.style.display = 'none';
    countdownState.active = false;
    if (countdownState.resolve) countdownState.resolve();
    return true; // 结束
  }
}

// ============ 结算界面 ============
function showResults() {
  const el = document.getElementById('results');
  const table = document.getElementById('results-table');
  let html = '<tr><th>圈数</th><th>用时</th></tr>';
  for (let i = 0; i < state.lapTimes.length; i++) {
    html += `<tr><td>第 ${i + 1} 圈</td><td>${state.lapTimes[i].toFixed(2)}s</td></tr>`;
  }
  html += `<tr><th>总计</th><th>${state.time.toFixed(2)}s</th></tr>`;
  table.innerHTML = html;
  el.style.display = 'block';
}

// ============ 游戏循环 ============
let lastTime = 0;
let countdownDone = false;
let countdownStarted = false;
// P24: 开屏 splash 是否已播完（播完前画面冻结在巡游起始机位）
let splashFinished = false;

// 缓动函数
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

async function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 1 / 30); // 限制最大 dt
  lastTime = time;
  gameTime = time / 1000; // 全局游戏时间（秒），基于 rAF 时间戳

  // P24: 开屏 splash 播放期间——渲染冻结的发车格画面（相机已摆在巡游起点）
  if (!splashFinished) {
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
    return;
  }

  // P24: 发车格巡游开场（替代旧 P7 零件爆炸展示，旧整段已删除）——
  // 低角度 dolly 滑过四车侧面（每辆车轰油渐起）→ 拉升绕到玩家车后，
  // 落位即 3-2-1 倒计时跟随机位（零跳变）
  if (state.paradeMode && !state.paradeDone) {
    updateParade();
    track.update(dt, gameTime);
    particleSystem.update(dt, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
    return;
  }

  // 比赛模式：倒计时期间更新倒计时 UI，不更新物理
  if (!countdownDone) {
    const countdownFinished = updateCountdown(gameTime);
    if (countdownFinished) {
      countdownDone = true;
      state.running = true;
      state.started = true;
      announceRound('ROUND 1', false); // P18: 开赛播报
      kartPhysics.currentLapStart = gameTime;
      state.currentLapStart = kartPhysics.currentLapStart;
    }
    // P16 第二步：倒计时期间保持跟随机位（车静止，lerp 无感），发车视角稳定
    updateCamera(dt);
    // 赛道动画更新（云朵、观众、路灯）
    track.update(dt, gameTime);
    particleSystem.update(dt, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
    return;
  }

  // 比赛进行中
  if (state.running && !state.finished) {
    updatePhysics(dt);
    aiManager.update(dt);
    playerItemManager.update(dt);
    aiItemManager.update(dt);
    updateCheckpoints();
    state.rank = aiManager.getPlayerRank();
    updateCamera(dt);
    updateHUD();
  }

  // 赛道动画更新（云朵、观众、路灯）
  track.update(dt, gameTime);

  // 加速带持续粒子效果
  if (track.boostZones) {
    for (const zone of track.boostZones) {
      const box = new THREE.Box3().setFromObject(zone);
      const center = new THREE.Vector3();
      box.getCenter(center);
      particleSystem.emitBoost(center);
    }
  }

  // 粒子系统更新
  particleSystem.update(dt, camera);

  renderer.render(scene, camera);
  requestAnimationFrame(gameLoop);
}

// ============ P18: 回合播报（大字横幅 + 号角音效） ============
// 横幅由 rounds.js 自绘 DOM，音效经 audio.js（未 unlock 时安全 no-op）。
function announceRound(text, isFinal) {
  try {
    showRoundBanner(text, { final: !!isFinal, duration: isFinal ? 2000 : 1600 });
  } catch (e) { /* 横幅失败不影响比赛 */ }
  audio.playRoundFanfare(!!isFinal);
}

// ============ 检查点与圈数检测 ============
function updateCheckpoints() {
  const pos = kartPhysics.position;
  
  // 检查检查点（按顺序）
  const nextCpIndex = track.checkCheckpoints(pos, kartPhysics.lastCheckpointIndex);
  if (nextCpIndex !== -1) {
    kartPhysics.lastCheckpointIndex = nextCpIndex;
    state.lastCheckpointIndex = nextCpIndex;
  }
  
  // 检查起点线（完成一圈）
  const startInfo = track.getStartLineInfo();
  const toStart = pos.clone().sub(startInfo.position);
  const distToStart = toStart.length();
  const projected = toStart.dot(startInfo.normal);
  
  // 只有通过了所有检查点且从正确方向穿过起点线才算数
  const allCheckpointsPassed = kartPhysics.lastCheckpointIndex === track.checkpoints.length - 1;
  
  if (allCheckpointsPassed && distToStart < 15 && projected > 0 && !kartPhysics.passedStartLine) {
    // 完成一圈
    const now = gameTime;
    const lapTime = now - kartPhysics.currentLapStart;
    state.lapTimes.push(lapTime);
    kartPhysics.lapTimes.push(lapTime);
    if (lapTime < state.bestLap) state.bestLap = lapTime;
    kartPhysics.lap++;
    state.lap = kartPhysics.lap;
    kartPhysics.currentLapStart = now;
    state.currentLapStart = now;
    kartPhysics.lastCheckpointIndex = -1;
    state.lastCheckpointIndex = -1;
    kartPhysics.passedStartLine = true;
    state.passedStartLine = true;
    
    if (kartPhysics.lap >= 3) {
      // 比赛结束
      state.running = false;
      state.finished = true;
      kartPhysics.finished = true;
      kartPhysics.totalTime = state.lapTimes.reduce((a, b) => a + b, 0);
      state.time = kartPhysics.totalTime;
      audio.stopEngine();
      showResults();
    } else {
      // P18: 回合播报——进第 2 圈报 ROUND 2，进第 3 圈（最后一圈）报 FINAL LAP
      if (kartPhysics.lap === 1) announceRound('ROUND 2', false);
      else if (kartPhysics.lap === 2) announceRound('FINAL LAP', true);
    }
  } else if (distToStart > 20) {
    // 远离起点线后重置标志
    kartPhysics.passedStartLine = false;
    state.passedStartLine = false;
  }
  
}

// ============ 辅助：将卡丁车放置到起点线 ============
function placeKartAtStartLine(kartMesh, kartPhysics, track, spawnIndex = 0) {
  // 使用赛道样条采样：2×2 错位排布
  const spawnPositions = track.getSpawnPositions();
  const spawn = spawnPositions[spawnIndex];
  
  // 同步到 Three.js 对象和物理状态
  kartMesh.position.copy(spawn.position);
  kartMesh.rotation.y = spawn.rotation;
  kartPhysics.position.copy(spawn.position);
  kartPhysics.rotation = spawn.rotation;
  kartPhysics.velocity.set(0, 0, 0);
  kartPhysics.lastCheckpointIndex = -1;
  kartPhysics.passedStartLine = false;
  kartPhysics.lap = 0;
  kartPhysics.currentLapStart = gameTime;
  state.lap = 0;
  state.lastCheckpointIndex = -1;
  state.passedStartLine = false;
  state.currentLapStart = gameTime;
  state.lapTimes = [];
  kartPhysics.lapTimes = [];
  state.bestLap = Infinity;
  state.time = 0;
  state.totalTime = 0;
  kartPhysics.totalTime = 0;
  kartPhysics.finished = false;
  state.finished = false;
  state.running = false;
  state.started = false;
}

// ============ 窗口大小调整 ============
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============ P24: 发车格巡游开场 ============
// 时间线（总 3.5s ≤ 4s）：
//   0 → 2.5s   相机低角度（车头高度）从发车格侧前方 dolly 滑过四车侧面
//              （easeInOut，经过每辆车 playRev 引擎渐起）
//   2.5 → 3.5s 镜头上扬拉升绕到玩家车后，落位与倒计时跟随机位完全一致（零跳变）
// splash 播完后任意键/点击 = skipParade 立即落位车尾进倒计时。
const PARADE_DOLLY = 2.5;  // 滑过四车侧面（秒）
const PARADE_RISE = 1.0;   // 拉升绕到车尾（秒）
const PARADE_TOTAL = PARADE_DOLLY + PARADE_RISE;

const parade = {
  a: new THREE.Vector3(),        // dolly 起点（发车格前右方，低角度）
  b: new THREE.Vector3(),        // dolly 终点（发车格前左方）
  riseEnd: new THREE.Vector3(),  // 拉升终点 = 玩家车尾（与 snapCameraBehindKart 一致）
  lookGrid: new THREE.Vector3(), // dolly 段 lookAt（发车格中心）
  lookEnd: new THREE.Vector3(),  // 拉升末 lookAt（玩家车头前方）
  revTimes: [0, 0.62, 1.24, 1.86], // 经过四辆车的轰油时刻
  revCount: 0,
  doneGameTime: -1,               // DEBUG: finishParade 时的 gameTime（探针测巡游时长用）
};
const paradeLookTmp = new THREE.Vector3();
window.__mk.parade = parade; // DEBUG: parade-probe 读机位用

function computeParadePath() {
  const spawns = track.getSpawnPositions(); // 0=前左 1=前右(玩家) 2=后左 3=后右
  const playerSpawn = spawns[1];
  const r = playerSpawn.rotation;
  const fwd = new THREE.Vector3(-Math.sin(r), 0, -Math.cos(r));  // 行进方向
  const right = new THREE.Vector3(Math.cos(r), 0, -Math.sin(r)); // 车身右侧
  const center = new THREE.Vector3();
  for (const s of spawns) center.add(s.position);
  center.multiplyScalar(1 / spawns.length);
  // dolly 线：车群侧后方 3m、侧向 ±8m、离地 1.1m（车头高度低角度），从右滑到左；
  // 侧后机位使画面同时包含四车 + 发车格 + 前方起点拱门（验收同框要求）
  parade.a.copy(center).addScaledVector(fwd, -3).addScaledVector(right, -8);
  parade.b.copy(center).addScaledVector(fwd, -3).addScaledVector(right, 8);
  parade.a.y = center.y + 1.1;
  parade.b.y = center.y + 1.1;
  parade.lookGrid.copy(center);
  parade.lookGrid.y += 0.8;
  // 拉升终点与 snapCameraBehindKart 的落位公式完全一致 → 进倒计时零跳变
  const pp = playerSpawn.position;
  parade.riseEnd.set(
    pp.x + Math.sin(r) * cameraOffset.z,
    pp.y + cameraOffset.y,
    pp.z + Math.cos(r) * cameraOffset.z
  );
  parade.lookEnd.set(pp.x - Math.sin(r) * 5, pp.y + 1, pp.z - Math.cos(r) * 5);
}

function startParade() {
  splashFinished = true;
  state.paradeStartTime = gameTime;
  parade.revCount = 0;
}

function updateParade() {
  const t = gameTime - state.paradeStartTime;
  // 经过每辆车引擎渐起（audio 未 unlock 时安全 no-op）
  while (parade.revCount < parade.revTimes.length && t >= parade.revTimes[parade.revCount]) {
    audio.playRev();
    parade.revCount++;
  }
  if (t < PARADE_DOLLY) {
    const e = easeInOutCubic(THREE.MathUtils.clamp(t / PARADE_DOLLY, 0, 1));
    camera.position.lerpVectors(parade.a, parade.b, e);
    camera.lookAt(parade.lookGrid);
  } else if (t < PARADE_TOTAL) {
    const e = easeInOutCubic(THREE.MathUtils.clamp((t - PARADE_DOLLY) / PARADE_RISE, 0, 1));
    camera.position.lerpVectors(parade.b, parade.riseEnd, e);
    paradeLookTmp.lerpVectors(parade.lookGrid, parade.lookEnd, e);
    camera.lookAt(paradeLookTmp);
  } else {
    finishParade();
  }
}

function finishParade() {
  state.paradeMode = false;
  state.paradeDone = true;
  parade.doneGameTime = gameTime; // DEBUG: parade-probe 断言巡游真实时长用
  snapCameraBehindKart(); // 精确落位倒计时机位（零跳变）
  if (!countdownStarted) {
    countdownStarted = true;
    startCountdown().then(() => {
      state.running = true;
      state.started = true;
      announceRound('ROUND 1', false); // P18: 开赛播报
      kartPhysics.currentLapStart = gameTime;
      state.currentLapStart = kartPhysics.currentLapStart;
      countdownDone = true;
    });
  }
}

function skipParade() {
  if (state.paradeDone) return;
  finishParade();
}

// DEBUG: parade-probe 白盒单测开场时间线用（同 window.__ai 先例，不影响任何逻辑）
window.__mk.intro = {
  parade, updateParade, finishParade, skipParade,
  PARADE_DOLLY, PARADE_RISE, PARADE_TOTAL,
  setSplashFinished: (v) => { splashFinished = v; },
  isSplashFinished: () => splashFinished,
  // 把巡游时间轴摆到第 t 秒（并重置 parade 标志），供探针逐时刻断言机位
  setParadeTime: (t) => {
    state.paradeMode = true;
    state.paradeDone = false;
    state.paradeStartTime = gameTime - t;
  },
};

// P24: 启动即把玩家车摆上发车格（AI 车构造时已在格），相机冻结在巡游起始机位，
// splash 期间渲染的就是发车格画面，splash 结束巡游开始时画面零跳变。
placeKartAtStartLine(playerKart, kartPhysics, track, 1);
computeParadePath();
camera.position.copy(parade.a);
camera.lookAt(parade.lookGrid);

startSplash(startParade);

// 启动
requestAnimationFrame(gameLoop);