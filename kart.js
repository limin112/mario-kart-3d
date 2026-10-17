import * as THREE from 'three';

// 缓动函数
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/**
 * P23 角色系统：四名车手（致敬马里奥赛车）
 *  - body: 车身色；suit/helmet: 驾驶员服装/头部色
 *  - signature: 特征部件类型（皇冠/背鞍/尖刺壳）
 *  - map: 小地图圆点色（酷霸王车身纯黑，地图上改用亮灰保证可见）
 */
export const CHARACTERS = {
  mario:  { name: '马里奥', body: 0xff3333, suit: 0xcc2222, helmet: 0xff3333, signature: null,  map: 0xff3333 },
  peach:  { name: '公主',   body: 0xff8fc8, suit: 0xffc0dd, helmet: 0xffe9f5, signature: 'crown', map: 0xff8fc8 },
  dino:   { name: '恐龙',   body: 0x33bb44, suit: 0x2f9e3f, helmet: 0x69d44a, signature: 'saddle', map: 0x33bb44 },
  bowser: { name: '酷霸王', body: 0x1a1a1a, suit: 0x9c4a1a, helmet: 0xf5a623, signature: 'shell', map: 0xb0b0b0 },
};

/**
 * 创建卡丁车模型（P6 细化版 + P23 角色特征部件）
 * @param {number|string} charOrColor - 角色键（CHARACTERS 键名）或旧版 hex 车身色
 *        （hex 调用 = 旧 API 零回归，角色按 mario）
 * @param {boolean} isPlayer
 * 返回包含命名部件的 Group；group.userData.character = 角色键，
 * group.userData.parts 含特征部件（peach: crown/dress；dino: saddle + dinoHead；
 * bowser: shell/mane + bowserHead）
 */
export function createKart(charOrColor = 0xff3333, isPlayer = true) {
  const group = new THREE.Group();
  const parts = {};

  // P23：角色解析（字符串=角色键，未知键/旧 hex 数字 → mario 配色语义 + 原色车身）
  const charKey = (typeof charOrColor === 'string' && CHARACTERS[charOrColor]) ? charOrColor : 'mario';
  const char = CHARACTERS[charKey];
  const bodyColor = typeof charOrColor === 'number' ? charOrColor : char.body;

  // --- 材质 ---
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.5,
    metalness: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.4,
    metalness: 0.6,
  });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x444, roughness: 0.3, metalness: 0.7 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a2e,
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.6,
    thickness: 0.5,
    ior: 1.5,
    transparent: true,
    opacity: 0.7,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.8, metalness: 0.0 });
  const suitMat = new THREE.MeshStandardMaterial({ color: char.suit, roughness: 0.7, metalness: 0.1 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: char.helmet, roughness: 0.4, metalness: 0.3 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x000, roughness: 0.1, metalness: 0.9 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.8 });
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x553333, roughness: 0.5, metalness: 0.6 });
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x444, roughness: 0.3, metalness: 0.8 });

  // --- 底盘 ---
  const chassisGeo = new THREE.BoxGeometry(2.2, 0.3, 3.8);
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  chassis.position.y = 0.5;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);
  parts.chassis = chassis;

  // --- 前鼻 ---
  const noseGeo = new THREE.CylinderGeometry(0.7, 0.9, 1.2, 12);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.7, 1.4);
  nose.castShadow = true;
  nose.scale.set(1, 0.8, 1);
  group.add(nose);
  parts.nose = nose;

  // --- 中部（坐舱区） ---
  const midGeo = new THREE.BoxGeometry(1.4, 0.6, 1.6);
  const mid = new THREE.Mesh(midGeo, bodyMat);
  mid.position.set(0, 1.1, 0.2);
  mid.castShadow = true;
  group.add(mid);
  parts.mid = mid;

  // --- 尾部 ---
  const rearGeo = new THREE.BoxGeometry(1.5, 0.5, 1.0);
  const rear = new THREE.Mesh(rearGeo, bodyMat);
  rear.position.set(0, 1.0, -1.3);
  rear.castShadow = true;
  group.add(rear);
  parts.rear = rear;

  // --- 尾翼 ---
  const wingGeo = new THREE.BoxGeometry(1.6, 0.08, 0.6);
  const wing = new THREE.Mesh(wingGeo, darkMat);
  wing.position.set(0, 1.6, -1.6);
  wing.castShadow = true;
  group.add(wing);
  parts.wing = wing;

  // --- 尾翼支柱 ---
  const strutGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
  for (const x of [-0.6, 0.6]) {
    const strut = new THREE.Mesh(strutGeo, strutMat);
    strut.position.set(x, 1.3, -1.5);
    strut.castShadow = true;
    group.add(strut);
    parts[`strut_${x}`] = strut;
  }

  // --- 挡风玻璃 ---
  const glassGeo = new THREE.BoxGeometry(1.0, 0.5, 0.8);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 1.55, 0.4);
  glass.castShadow = true;
  group.add(glass);
  parts.glass = glass;

  // --- 驾驶员 ---
  const driverGroup = new THREE.Group();

  const helmetGeo = new THREE.SphereGeometry(0.35, 12, 10);
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.set(0, 1.85, 0.3);
  helmet.scale.set(1, 0.9, 1.1);
  helmet.castShadow = true;
  driverGroup.add(helmet);
  parts.helmet = helmet;

  // P23：驾驶员头部特征（恐龙=绿色长吻头、酷霸王=橙头+白骨尖角）
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xf2ecd8, roughness: 0.6, metalness: 0.1 });
  if (charKey === 'dino') {
    helmet.userData.partName = 'dinoHead';
    helmet.scale.set(0.95, 0.95, 1.45); // 拉长成吻部
  } else if (charKey === 'bowser') {
    helmet.userData.partName = 'bowserHead';
    const hornGeo = new THREE.ConeGeometry(0.07, 0.22, 6);
    for (const hx of [-0.22, 0.22]) {
      const horn = new THREE.Mesh(hornGeo, boneMat);
      horn.position.set(hx, 0.3, -0.02);
      horn.rotation.z = hx < 0 ? 0.35 : -0.35;
      horn.castShadow = true;
      helmet.add(horn); // 角作为头部子件，随头动
    }
  }

  const visorGeo = new THREE.BoxGeometry(0.35, 0.2, 0.05);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.82, 0.55);
  driverGroup.add(visor);
  parts.visor = visor;

  const torsoGeo = new THREE.BoxGeometry(0.55, 0.5, 0.3);
  const torso = new THREE.Mesh(torsoGeo, suitMat);
  torso.position.set(0, 1.4, 0.2);
  torso.castShadow = true;
  driverGroup.add(torso);
  parts.torso = torso;

  const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.45, 8);
  for (const [x, z, side] of [[-0.35, 0.6, 'L'], [0.35, 0.6, 'R']]) {
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.set(x, 1.45, z);
    arm.rotation.x = -0.3;
    arm.rotation.z = x < 0 ? 0.2 : -0.2;
    arm.castShadow = true;
    driverGroup.add(arm);
    parts[`arm_${side}`] = arm;
  }

  driverGroup.position.y = 0;
  group.add(driverGroup);
  parts.driverGroup = driverGroup;

  // --- P23 角色特征部件（低多边形几何体拼，致敬马里奥赛车） ---
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.25, metalness: 0.85 });
  if (charKey === 'peach') {
    // 公主：金色皇冠（冠环+4尖锥）戴在头盔上方 + 粉色蓬蓬裙摆
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 8), goldMat);
    crown.name = 'crown';
    crown.position.set(0, 2.24, 0.3);
    crown.castShadow = true;
    const spikeGeo = new THREE.ConeGeometry(0.055, 0.14, 6);
    for (const [sx, sz] of [[0, 0.16], [0.16, 0], [0, -0.16], [-0.16, 0]]) {
      const spike = new THREE.Mesh(spikeGeo, goldMat);
      spike.position.set(sx, 0.11, sz);
      crown.add(spike);
    }
    driverGroup.add(crown);
    parts.crown = crown;

    const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.72, 0.62, 10), new THREE.MeshStandardMaterial({ color: 0xff7fb8, roughness: 0.75, metalness: 0.05 }));
    dress.name = 'dress';
    dress.position.set(0, 1.18, 0.25);
    dress.castShadow = true;
    driverGroup.add(dress);
    parts.dress = dress;
  } else if (charKey === 'dino') {
    // 恐龙：红色背鞍（鞍座+前拱）放在驾驶员身后尾部
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 0.85), new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.6, metalness: 0.1 }));
    saddle.name = 'saddle';
    saddle.position.set(0, 1.42, -1.25);
    saddle.castShadow = true;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 10, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.4, metalness: 0.3 }));
    arch.position.set(0, 0.22, 0.42);
    arch.rotation.y = Math.PI / 2;
    saddle.add(arch);
    group.add(saddle);
    parts.saddle = saddle;
  } else if (charKey === 'bowser') {
    // 酷霸王：尖刺龟壳（墨绿壳+白骨尖锥）背在车后 + 红色鬃毛在头后
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e6b1f, roughness: 0.6, metalness: 0.15 }));
    shell.name = 'shell';
    shell.scale.set(1, 0.62, 1);
    shell.position.set(0, 1.28, -1.2);
    shell.castShadow = true;
    const shellSpikeGeo = new THREE.ConeGeometry(0.09, 0.26, 6);
    for (const [sx, sz] of [[0, 0.42], [0, -0.42], [0.42, 0], [-0.42, 0]]) {
      const s = new THREE.Mesh(shellSpikeGeo, boneMat);
      s.position.set(sx, 0.34, sz);
      shell.add(s);
    }
    group.add(shell);
    parts.shell = shell;

    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.22), new THREE.MeshStandardMaterial({ color: 0xcc2200, roughness: 0.85, metalness: 0.0 }));
    mane.name = 'mane';
    mane.position.set(0, 1.82, -0.02);
    mane.castShadow = true;
    const tuftGeo = new THREE.ConeGeometry(0.07, 0.2, 6);
    for (const [tx, ty] of [[-0.1, 0.3], [0.1, 0.32], [0, 0.36]]) {
      const tuft = new THREE.Mesh(tuftGeo, mane.material);
      tuft.position.set(tx, ty, 0);
      tuft.rotation.x = 0.5;
      mane.add(tuft);
    }
    driverGroup.add(mane);
    parts.mane = mane;
  }

  // --- 轮子 ---
  const wheelPositions = [
    { name: 'wheel_FL', x: -1.15, y: 0.5, z: 1.25 },
    { name: 'wheel_FR', x: 1.15, y: 0.5, z: 1.25 },
    { name: 'wheel_RL', x: -1.15, y: 0.5, z: -1.25 },
    { name: 'wheel_RR', x: 1.15, y: 0.5, z: -1.25 },
  ];
  const wheels = [];
  for (const wp of wheelPositions) {
    const wheelGroup = new THREE.Group();

    const tireGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.38, 16);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    wheelGroup.add(tire);

    const rimGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(0, 0, 0.19);
    rim.castShadow = true;
    wheelGroup.add(rim);

    const rimInner = new THREE.Mesh(rimGeo, rimMat);
    rimInner.rotation.z = Math.PI / 2;
    rimInner.position.set(0, 0, -0.19);
    rimInner.castShadow = true;
    wheelGroup.add(rimInner);

    const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12);
    const hub = new THREE.Mesh(hubGeo, rimMat);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    const rotorGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.set(0, 0, 0.2);
    wheelGroup.add(rotor);

    wheelGroup.position.set(wp.x, wp.y, wp.z);
    group.add(wheelGroup);
    wheels.push({ group: wheelGroup, tire, rim, rotor, name: wp.name });
    parts[wp.name] = wheelGroup;
  }

  // --- 排气管 ---
  const exhaustGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8);
  const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaust.position.set(0.8, 0.6, -1.7);
  exhaust.rotation.x = -0.3;
  exhaust.castShadow = true;
  group.add(exhaust);
  parts.exhaust = exhaust;

  // 保存原始位置（用于爆炸动画复位）
  for (const [key, mesh] of Object.entries(parts)) {
    if (mesh instanceof THREE.Object3D) {
      mesh.userData.originalPosition = mesh.position.clone();
      mesh.userData.originalRotation = mesh.rotation.clone();
    }
  }

  // P24 前置（车头朝向统一）：逻辑层约定"车头 = 局部 -Z"（前进方向 =
  // (-sin r, 0, -cos r)，见 main.js updatePhysics / ai.js / items.js / projectiles.js），
  // 而本模型零件按"车头 = 局部 +Z"搭建（nose z=+1.4、尾翼 z=-1.6）。
  // 用一层 flip 容器把整套零件绕 Y 转 180°，车看起来就是往它真正在开的方向跑；
  // parts / wheels 引用不变（仅换父级），世界坐标由 group.rotation.y 决定，不受影响。
  const facing = new THREE.Group();
  facing.name = 'facingFix';
  facing.rotation.y = Math.PI;
  for (const child of [...group.children]) facing.add(child);
  group.add(facing);

  group.userData = { wheels, parts, driverGroup, isPlayer, nose: parts.nose, character: charKey };
  return group;
}

/**
 * 缓动函数导出（供其他模块使用）
 */
export { easeOutCubic, easeInOutCubic };