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
  const chassisGeo = new THREE.BoxGeometry(1.8, 0.4, 3.2);
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

  group.userData = { wheels, parts, driverGroup, isPlayer };
  return group;
}

/**
 * 为展示模式创建"爆炸视图"卡丁车
 * 所有部件沿轴向分离、悬浮、缓慢自转
 */
export function createShowcaseKart(color = 0xff3333) {
  const kart = createKart(color, false);
  const parts = kart.userData.parts;

  // 爆炸分离配置：每个部件沿特定轴向偏移
  const explosionOffsets = {
    chassis: new THREE.Vector3(0, -1.5, 0),
    nose: new THREE.Vector3(0, 1, 2.5),
    mid: new THREE.Vector3(-2, 1.5, 0),
    rear: new THREE.Vector3(0, 1, -2.5),
    wing: new THREE.Vector3(2, 2.5, -2),
    'strut_-0.6': new THREE.Vector3(-2.5, 2, -2),
    'strut_0.6': new THREE.Vector3(2.5, 2, -2),
    glass: new THREE.Vector3(-1.5, 2.5, 1),
    helmet: new THREE.Vector3(1.5, 3, 1),
    visor: new THREE.Vector3(1.5, 3, 1.3),
    torso: new THREE.Vector3(1.5, 2.5, 0.5),
    arm_L: new THREE.Vector3(-2.5, 2, 1),
    arm_R: new THREE.Vector3(2.5, 2, 1),
    wheel_FL: new THREE.Vector3(-3, 0, 3),
    wheel_FR: new THREE.Vector3(3, 0, 3),
    wheel_RL: new THREE.Vector3(-3, 0, -3),
    wheel_RR: new THREE.Vector3(3, 0, -3),
    exhaust: new THREE.Vector3(2.5, 1, -3),
  };

  // 应用爆炸偏移
  for (const [key, offset] of Object.entries(explosionOffsets)) {
    const mesh = parts[key];
    if (mesh) {
      mesh.userData.explodedPosition = offset.clone();
      mesh.userData.explodedRotation = new THREE.Euler(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      );
      mesh.userData.floatOffset = Math.random() * Math.PI * 2;
      mesh.userData.rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );
    }
  }

  kart.userData.isShowcase = true;
  return kart;
}

/**
 * 更新展示模式下的卡丁车动画
 * @param {THREE.Group} kart - 展示用卡丁车
 * @param {number} time - 总时间（秒）
 * @param {number} dt - 帧时间差
 * @param {number} progress - 0~1，从组装态到爆炸态的插值进度（已缓动）
 */
export function updateShowcaseKart(kart, time, dt, progress = 1) {
  const parts = kart.userData.parts;
  if (!kart.userData.isShowcase) return;

  // 应用 easeOutCubic 让分离更自然（进度可能已由外部缓动，这里再微调）
  const easedProgress = easeOutCubic(progress);

  for (const [key, mesh] of Object.entries(parts)) {
    if (!mesh || !(mesh instanceof THREE.Object3D)) continue;

    const origPos = mesh.userData.originalPosition || new THREE.Vector3();
    const explodedPos = mesh.userData.explodedPosition || new THREE.Vector3();
    const floatOffset = mesh.userData.floatOffset || 0;
    const rotSpeed = mesh.userData.rotationSpeed || new THREE.Vector3();

    // 位置插值：原位置 -> 爆炸位置（使用缓动后的进度）
    const targetPos = new THREE.Vector3().lerpVectors(origPos, explodedPos, easedProgress);
    // 悬浮动画：根据进度逐渐增强浮动幅度
    const floatAmount = 0.12 * easedProgress;
    targetPos.y += Math.sin(time * 0.7 + floatOffset) * floatAmount;
    // 添加轻微的左右摇摆
    targetPos.x += Math.cos(time * 0.5 + floatOffset) * 0.03 * easedProgress;
    targetPos.z += Math.sin(time * 0.6 + floatOffset) * 0.03 * easedProgress;

    // 使用平滑插值而非固定 0.05，随 dt 自适应
    const lerpFactor = 1 - Math.exp(-10 * dt);
    mesh.position.lerp(targetPos, lerpFactor);

    // 旋转：缓慢自转（仅在爆炸态接近完成时）
    if (easedProgress > 0.3) {
      const rotIntensity = THREE.MathUtils.clamp((easedProgress - 0.3) / 0.7, 0, 1);
      mesh.rotation.x += rotSpeed.x * dt * rotIntensity;
      mesh.rotation.y += rotSpeed.y * dt * rotIntensity;
      mesh.rotation.z += rotSpeed.z * dt * rotIntensity;
    } else {
      // 组装态时平滑归零旋转
      const origRot = mesh.userData.originalRotation || new THREE.Euler();
      const rotLerpFactor = 1 - Math.exp(-8 * dt);
      mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, origRot.x, rotLerpFactor);
      mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, origRot.y, rotLerpFactor);
      mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, origRot.z, rotLerpFactor);
    }
  }

  // 整体缓慢旋转
  kart.rotation.y += dt * 0.12;
}

/**
 * 重置卡丁车到比赛状态（收起爆炸视图）
 */
export function resetKartForRace(kart) {
  const parts = kart.userData.parts;
  for (const [key, mesh] of Object.entries(parts)) {
    if (mesh && mesh.userData.originalPosition) {
      mesh.position.copy(mesh.userData.originalPosition);
      mesh.rotation.copy(mesh.userData.originalRotation || new THREE.Euler());
    }
  }
  kart.userData.isShowcase = false;
  kart.rotation.set(0, 0, 0);
  return kart;
}

/**
 * 缓动函数导出（供其他模块使用）
 */
export { easeOutCubic, easeInOutCubic };