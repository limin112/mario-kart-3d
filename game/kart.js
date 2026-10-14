import * as THREE from 'three';

// 缓动函数
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/**
 * 创建卡丁车模型（P6 细化版 + P7 爆炸拆解支持）
 * 返回包含命名部件的 Group，便于展示模式下的分离动画
 */
export function createKart(color = 0xff3333, isPlayer = true) {
  const group = new THREE.Group();
  const parts = {};

  // --- 材质 ---
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
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
  const suitMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.7, metalness: 0.1 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.4, metalness: 0.3 });
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

  group.userData = { wheels, parts, driverGroup, isPlayer, nose: parts.nose };
  return group;
}

/**
 * 缓动函数导出（供其他模块使用）
 */
export { easeOutCubic, easeInOutCubic };