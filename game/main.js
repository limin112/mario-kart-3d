import * as THREE from 'three';
import { Track } from './track.js';
import { AIManager } from './ai.js';
import { PlayerItemManager, AIItemManager } from './items.js';
import { ParticleSystem } from './particles.js';
import { createKart, createShowcaseKart, updateShowcaseKart, resetKartForRace } from './kart.js';
import { AudioManager } from './audio.js';
import { startSplash } from './splash.js';
import { showRoundBanner } from './rounds.js';

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
  // P7: 展示模式
  showcaseMode: true,
  showcaseProgress: 0, // 0~1 爆炸动画进度
  showcaseStartTime: 0,
  showcaseKart: null,
  showcaseCameraAngle: 0,
  showcasePhase: 'intro', // 'intro' | 'explode' | 'exit'
  showcasePhaseStartTime: 0,
  showcaseTransitionProgress: 0,
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
scene.background = new THREE.Color(0x87ceeb); // 天空蓝（比赛模式）

const showcaseScene = new THREE.Scene();
showcaseScene.background = new THREE.Color(0x0a0a12); // 深色舞台背景

// 相机
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
// P16 第二步：初始相机位 = 展示 intro 起手位（angle 0、radius 30、height 12），
// splash 期间冻结渲染的就是这一帧，解冻进 intro 时零跳变。
camera.position.set(0, 12, 30);
camera.lookAt(0, 1.5, 0);

// 灯光（P6 优化：更真实的日照、更大范围阴影、环境光增强）
const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x445566, 1.0); // 略带暖色的天光 + 冷色地反射
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffee, 2.0); // 暖白色阳光，强度提升
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
  color: 0x3a5f0b,
  roughness: 0.9,
  metalness: 0.1,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 网格辅助线
const gridHelper = new THREE.GridHelper(500, 50, 0x2d4a08, 0x2d4a08);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const playerKart = createKart(0xff3333);
playerKart.position.set(0, 0, 5);
scene.add(playerKart);

// ============ P7: 展示模式场景搭建 ============
function setupShowcaseScene() {
  // 蓝图风格网格地面
  const gridSize = 40;
  const gridDivisions = 40;
  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x00ffff, 0x004466);
  gridHelper.position.y = 0;
  showcaseScene.add(gridHelper);

  // 次级细网格
  const fineGrid = new THREE.GridHelper(gridSize, gridDivisions * 2, 0x002244, 0x001133);
  fineGrid.position.y = 0.01;
  showcaseScene.add(fineGrid);

  // 舞台灯光：暗蓝色环境光
  const showcaseAmbient = new THREE.AmbientLight(0x112244, 0.8);
  showcaseScene.add(showcaseAmbient);

  // 主光源：从左上方打亮
  const showcaseKeyLight = new THREE.DirectionalLight(0x88ccff, 1.5);
  showcaseKeyLight.position.set(-20, 30, 20);
  showcaseKeyLight.castShadow = true;
  showcaseKeyLight.shadow.mapSize.width = 2048;
  showcaseKeyLight.shadow.mapSize.height = 2048;
  showcaseKeyLight.shadow.camera.near = 1;
  showcaseKeyLight.shadow.camera.far = 100;
  showcaseKeyLight.shadow.camera.left = -25;
  showcaseKeyLight.shadow.camera.right = 25;
  showcaseKeyLight.shadow.camera.top = 25;
  showcaseKeyLight.shadow.camera.bottom = -25;
  showcaseScene.add(showcaseKeyLight);

  // 补光：对侧柔光
  const showcaseFillLight = new THREE.DirectionalLight(0xff8844, 0.5);
  showcaseFillLight.position.set(20, 15, -20);
  showcaseScene.add(showcaseFillLight);

  // 顶光：边缘勾勒
  const showcaseRimLight = new THREE.DirectionalLight(0xffffff, 0.3);
  showcaseRimLight.position.set(0, 40, 0);
  showcaseScene.add(showcaseRimLight);

  // 点光源装饰：舞台四角微弱发光球
  for (const [x, z] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
    const glowGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(x, 2, z);
    showcaseScene.add(glow);
    glow.userData = { baseY: 2, phase: Math.random() * Math.PI * 2 };
  }

  // 车辆标题文本（用 Sprite 实现）
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 512;
  titleCanvas.height = 128;
  const ctx = titleCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 20, 40, 0.6)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.font = 'bold 64px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00ffff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 20;
  ctx.fillText('KART RACER', 256, 70);
  ctx.font = '24px "Courier New", monospace';
  ctx.fillStyle = '#88ccff';
  ctx.shadowBlur = 10;
  ctx.fillText('PRESS ANY KEY TO START', 256, 105);
  const titleTexture = new THREE.CanvasTexture(titleCanvas);
  const titleMat = new THREE.SpriteMaterial({ map: titleTexture, transparent: true, depthTest: false });
  const titleSprite = new THREE.Sprite(titleMat);
  titleSprite.position.set(0, 6, 0);
  titleSprite.scale.set(16, 4, 1);
  titleSprite.renderOrder = 999;
  titleSprite.material.opacity = 0; // 初始隐藏，淡入
  titleSprite.userData = { targetY: 6, targetScale: 16 };
  showcaseScene.add(titleSprite);
  state.showcaseTitle = titleSprite;

  // 创建展示用卡丁车（爆炸视图）
  const showcaseKart = createShowcaseKart(0xff3333);
  showcaseKart.position.set(0, 0.5, 0);
  showcaseScene.add(showcaseKart);
  state.showcaseKart = showcaseKart;
  state.showcaseStartTime = 0;
  state.showcasePhaseStartTime = 0;
  state.showcasePhase = 'intro';
}

setupShowcaseScene();

// ============ 赛道系统 (P2) ============
const track = new Track(scene);
window.track = track; // DEBUG

// ============ 粒子系统 (P6: 收尾) ============
const particleSystem = new ParticleSystem(scene);

// ============ 输入处理 ============
const keys = { forward: false, backward: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
  // P7: 展示模式下任意键进入比赛；P16: 开屏 splash 期间吞掉按键（交给 splash 自己的监听器）
  if (state.showcaseMode && !showcaseDone) {
    if (splashFinished) {
      state.showcasePhase = 'exit';
      state.showcasePhaseStartTime = performance.now() / 1000;
    }
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

// 点击也可跳过展示模式
window.addEventListener('click', () => {
  if (state.showcaseMode && !showcaseDone && splashFinished) {
    state.showcasePhase = 'exit';
    state.showcasePhaseStartTime = performance.now() / 1000;
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
let showcaseDone = false;
let countdownStarted = false;
// P16: 开屏 splash 是否已播完（播完前展示舞台冻结在组装态，不开始动画）
let splashFinished = false;

// 缓动函数
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

async function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 1 / 30); // 限制最大 dt
  lastTime = time;
  gameTime = time / 1000; // 全局游戏时间（秒），基于 rAF 时间戳

  // P16: 开屏 splash 播放期间——只渲染冻结的展示背景，不推进展示时间线
  if (state.showcaseMode && !showcaseDone && !splashFinished) {
    renderer.render(showcaseScene, camera);
    requestAnimationFrame(gameLoop);
    return;
  }

  // P7: 展示模式
  if (state.showcaseMode && !showcaseDone) {
    const showcaseElapsed = gameTime - state.showcaseStartTime;
    const phaseElapsed = gameTime - state.showcasePhaseStartTime;
    
    // 阶段状态机
    if (state.showcasePhase === 'intro') {
      // 0-0.6s: 标题淡入 + 相机从远处推进
      const introProgress = THREE.MathUtils.clamp(phaseElapsed / 0.6, 0, 1);
      const easedIntro = easeOutExpo(introProgress);
      
      // 标题淡入 + 从下方滑入
      if (state.showcaseTitle) {
        state.showcaseTitle.material.opacity = easedIntro;
        state.showcaseTitle.position.y = 6 + (1 - easedIntro) * 2;
        state.showcaseTitle.scale.x = 16 * easedIntro;
        state.showcaseTitle.scale.y = 4 * easedIntro;
      }
      
      // 相机从远距离推进
      const startRadius = 30;
      const endRadius = 18;
      const camRadius = THREE.MathUtils.lerp(startRadius, endRadius, easedIntro);
      const camHeight = 12 * (1 - easedIntro) + 8 * easedIntro;
      state.showcaseCameraAngle += dt * 0.15;
      camera.position.x = Math.sin(state.showcaseCameraAngle) * camRadius;
      camera.position.z = Math.cos(state.showcaseCameraAngle) * camRadius;
      camera.position.y = camHeight;
      camera.lookAt(0, 1.5, 0);
      
      if (introProgress >= 1) {
        state.showcasePhase = 'explode';
        state.showcasePhaseStartTime = gameTime;
        // P16 第二步：引擎轰鸣与爆炸峰值对齐——"看到车散开的同时听到转速起来"
        // （playRev ~1.1s 两段扫频，恰好盖住 1.2s 爆炸段；未 unlock 时安全 no-op）
        audio.playRev();
      }
    } else if (state.showcasePhase === 'explode') {
      // 0.6-1.8s: 爆炸动画（组装态 -> 爆炸态），使用 easeOutCubic 平滑过渡
      const phaseElapsed = gameTime - state.showcasePhaseStartTime;
      const explodeProgress = THREE.MathUtils.clamp(phaseElapsed / 1.2, 0, 1);
      const easedExplode = easeOutCubic(explodeProgress);
      state.showcaseProgress = easedExplode;
      
      // 更新展示卡丁车动画
      if (state.showcaseKart) {
        updateShowcaseKart(state.showcaseKart, showcaseElapsed, dt, easedExplode);
      }
      
      // 标题呼吸动画（爆炸阶段开始呼吸）
      if (state.showcaseTitle) {
        state.showcaseTitle.position.y = 6 + Math.sin(showcaseElapsed * 1.5) * 0.15;
        state.showcaseTitle.material.opacity = 0.9 + Math.sin(showcaseElapsed * 2) * 0.1;
      }
      
      // 相机继续环绕，缓慢推近
      const camRadius = THREE.MathUtils.lerp(18, 14, easedExplode * 0.5);
      const camHeight = 8;
      state.showcaseCameraAngle += dt * 0.25;
      camera.position.x = Math.sin(state.showcaseCameraAngle) * camRadius;
      camera.position.z = Math.cos(state.showcaseCameraAngle) * camRadius;
      // 晃动幅度随爆炸进度起振（×easedExplode），intro 末→explode 初相机 y 连续不跳变
      camera.position.y = camHeight + Math.sin(showcaseElapsed * 0.5) * 0.5 * easedExplode;
      camera.lookAt(0, 1.5, 0);
      
      if (explodeProgress >= 1) {
        state.showcasePhase = 'exit';
        state.showcasePhaseStartTime = gameTime;
      }
    } else if (state.showcasePhase === 'exit') {
      // P16 第二步：退出过渡 0.2s（原 0.3→0.25→0.2，splash→GO 总时长压进 5~6s）
      const phaseElapsed = gameTime - state.showcasePhaseStartTime;
      const exitProgress = THREE.MathUtils.clamp(phaseElapsed / 0.2, 0, 1);
      const easedExit = easeInOutCubic(exitProgress);
      state.showcaseTransitionProgress = easedExit;
      
      // 标题淡出 + 缩放消失
      if (state.showcaseTitle) {
        state.showcaseTitle.material.opacity = 1 - easedExit;
        state.showcaseTitle.scale.x = 16 * (1 - easedExit * 0.5);
        state.showcaseTitle.scale.y = 4 * (1 - easedExit * 0.5);
        state.showcaseTitle.position.y = 6 - easedExit * 2;
      }
      
      // 相机拉远（起点 16/8 与 explode 末态衔接，不跳变）
      const camRadius = THREE.MathUtils.lerp(16, 24, easedExit);
      const camHeight = THREE.MathUtils.lerp(8, 12, easedExit);
      state.showcaseCameraAngle += dt * 0.4;
      camera.position.x = Math.sin(state.showcaseCameraAngle) * camRadius;
      camera.position.z = Math.cos(state.showcaseCameraAngle) * camRadius;
      // 沿用 explode 末态的晃动项（同相位同幅），explode 末→exit 初相机 y 连续
      camera.position.y = camHeight + Math.sin(showcaseElapsed * 0.5) * 0.5;
      camera.lookAt(0, 1.5, 0);
      
      if (exitProgress >= 1) {
        state.showcaseMode = false;
        if (state.showcaseTitle) state.showcaseTitle.visible = false;
        // 清理展示场景（释放内存、避免残留）——完整清理包括 GridHelper 等非 Mesh 对象
        showcaseScene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
          if (obj.material?.map) obj.material.map.dispose();
        });
        showcaseScene.clear();
        showcaseDone = true;
        // P16 第二步：倒计时开始前先把玩家车摆上发车格、相机贴到车尾——
        // 倒计时画面即发车视角（AI 已在格），消除"倒计时看原点、GO 后相机飞越 50m"的衔接断裂
        placeKartAtStartLine(playerKart, kartPhysics, track, 1);
        snapCameraBehindKart();
        // 启动倒计时
        if (!countdownStarted) {
          countdownStarted = true;
          startCountdown().then(() => {
            // P16 第二步：出生点放置已提前到倒计时之前，这里只启动比赛
            state.running = true;
            state.started = true;
            announceRound('ROUND 1', false); // P18: 开赛播报
            kartPhysics.currentLapStart = gameTime;
            state.currentLapStart = kartPhysics.currentLapStart;
            countdownDone = true;
          });
        }
      }
    }
    
    // 舞台装饰灯光呼吸
    showcaseScene.children.forEach(child => {
      if (child.userData.baseY !== undefined) {
        child.position.y = child.userData.baseY + Math.sin(showcaseElapsed * 1.2 + child.userData.phase) * 0.3;
        child.material.opacity = 0.2 + Math.sin(showcaseElapsed * 1.5 + child.userData.phase) * 0.15;
      }
    });
    
    renderer.render(showcaseScene, camera);
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

// ============ P16: 开屏 splash ============
// 流程：logo 大字开屏（splash.js 自绘 DOM，约 2.4s，可任意键/点击跳过）
// → 播完/跳过后解冻 P7 展示舞台 → intro 末引擎轰油门（与爆炸对齐）→ 倒计时 → 比赛。
function startShowcaseAfterSplash() {
  const now = performance.now() / 1000;
  state.showcaseStartTime = now;
  state.showcasePhaseStartTime = now;
  state.showcasePhase = 'intro';
  splashFinished = true;
  // P16 第二步：playRev 挪到 intro→explode 切换点（与爆炸视觉峰值对齐），此处不再轰
}

startSplash(startShowcaseAfterSplash);

// 启动
requestAnimationFrame(gameLoop);