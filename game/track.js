import * as THREE from 'three';

/**
 * 赛道模块：基于 CatmullRom 样条的闭环赛道
 * 提供：中心线样条、路面网格、护栏、起终点线、装饰物、检查点、出界检测
 */

/**
 * 创建程序化沥青纹理
 * @returns {THREE.CanvasTexture}
 */
function createAsphaltTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // 基础沥青色
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, size, size);
  
  // 添加噪点
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 30;
    data[i] = Math.max(0, Math.min(255, 42 + noise));     // R
    data[i + 1] = Math.max(0, Math.min(255, 42 + noise)); // G
    data[i + 2] = Math.max(0, Math.min(255, 42 + noise)); // B
    data[i + 3] = 255; // A
  }
  ctx.putImageData(imageData, 0, 0);
  
  // 添加一些较大的斑点
  ctx.fillStyle = 'rgba(60,60,60,0.5)';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 8 + 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.fillStyle = 'rgba(20,20,20,0.3)';
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 5 + 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 创建红白路肩纹理
 * @returns {THREE.CanvasTexture}
 */
function createCurbTexture() {
  const size = 512;
  const stripeWidth = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // 红白相间条纹（沿 UV 的 V 方向）
  for (let y = 0; y < size; y += stripeWidth * 2) {
    // 白色条纹
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, y, size, stripeWidth);
    // 红色条纹
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(0, y + stripeWidth, size, stripeWidth);
  }
  
  // 添加磨损效果
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 4 + 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 创建广告牌纹理
 * @returns {THREE.CanvasTexture}
 */
function createBillboardTexture(seed = 0) {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  
  // 伪随机
  let rand = seed || Math.random();
  function nextRand() {
    rand = (rand * 1664525 + 1013904223) % 4294967296;
    return rand / 4294967296;
  }
  
  // 背景色
  const bgColors = ['#1a1a2e', '#1a2e1a', '#2e1a1a', '#2e2e1a', '#1a2e2e'];
  ctx.fillStyle = bgColors[Math.floor(nextRand() * bgColors.length)];
  ctx.fillRect(0, 0, w, h);
  
  // 边框
  ctx.strokeStyle = '#ffdd00';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  
  // 标题
  ctx.fillStyle = '#ffdd00';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  const titles = ['SPEED', 'RACE', 'BOOST', 'WIN', 'GO!', 'NITRO'];
  ctx.fillText(titles[Math.floor(nextRand() * titles.length)], w / 2, 40);
  
  // 装饰线
  ctx.strokeStyle = '#ff6600';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, 50);
  ctx.lineTo(w - 30, 50);
  ctx.stroke();
  
  // 副标题
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px Arial';
  const subtitles = ['CHAMPIONSHIP', 'GRAND PRIX', 'TIME TRIAL', 'VS MODE'];
  ctx.fillText(subtitles[Math.floor(nextRand() * subtitles.length)], w / 2, 80);
  
  // 底部品牌
  ctx.fillStyle = '#ffdd00';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('MARIO KART 3D', w / 2, h - 15);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 创建云朵纹理
 * @returns {THREE.CanvasTexture}
 */
function createCloudTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // 透明背景
  ctx.fillStyle = 'rgba(255,255,255,0)';
  ctx.fillRect(0, 0, size, size);
  
  // 绘制柔和云朵形状
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(size/2, size/2, size/2 * 0.9, size/2 * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 创建观众纹理（简单的色块人形）
 * @returns {THREE.CanvasTexture}
 */
function createSpectatorTexture(seed = 0) {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  
  // 伪随机
  let rand = seed || Math.random();
  function nextRand() {
    rand = (rand * 1664525 + 1013904223) % 4294967296;
    return rand / 4294967296;
  }
  
  // 透明背景
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, w, h);
  
  // 身体颜色
  const shirtColors = ['#ff3333', '#33ff33', '#3366ff', '#ffff33', '#ff33ff', '#ff9933', '#ffffff', '#cccccc'];
  const skinColors = ['#ffdbac', '#e8b88c', '#d4a574', '#c68e5e'];
  const hairColors = ['#1a1a1a', '#3d2b1f', '#8b4513', '#ffd700', '#c0c0c0'];
  
  const shirtColor = shirtColors[Math.floor(nextRand() * shirtColors.length)];
  const skinColor = skinColors[Math.floor(nextRand() * skinColors.length)];
  const hairColor = hairColors[Math.floor(nextRand() * hairColors.length)];
  
  // 头部
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.ellipse(w/2, 18, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // 头发
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.ellipse(w/2, 12, 13, 10, 0, 0, Math.PI);
  ctx.fill();
  
  // 身体
  ctx.fillStyle = shirtColor;
  ctx.fillRect(w/2 - 14, 32, 28, 50);
  
  // 手臂
  ctx.fillStyle = shirtColor;
  ctx.fillRect(w/2 - 22, 32, 8, 35);
  ctx.fillRect(w/2 + 14, 32, 8, 35);
  
  // 手
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.ellipse(w/2 - 18, 67, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w/2 + 18, 67, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // 腿
  const pantColor = '#333333';
  ctx.fillStyle = pantColor;
  ctx.fillRect(w/2 - 12, 82, 10, 35);
  ctx.fillRect(w/2 + 2, 82, 10, 35);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

/**
 * 创建轮胎堆纹理
 * @returns {THREE.CanvasTexture}
 */
function createTireStackTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  
  // 轮胎横截面纹理
  for (let y = 0; y < size; y += 8) {
    ctx.strokeStyle = 'rgba(40,40,40,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  
  // 高光
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, 'rgba(60,60,60,0.3)');
  grad.addColorStop(0.5, 'rgba(20,20,20,0)');
  grad.addColorStop(1, 'rgba(60,60,60,0.3)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 创建路灯/路标纹理
 * @returns {THREE.CanvasTexture}
 */
function createSignTexture(text, bgColor = '#0033aa', textColor = '#ffffff') {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  
  // 背景
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  
  // 边框
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  
  // 文字
  ctx.fillStyle = textColor;
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w/2, h/2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 赛道配置
const TRACK_CONFIG = {
  // 赛道中心线控制点（闭环）
  controlPoints: [
    new THREE.Vector3(0, 0, 50),    // 起点附近
    new THREE.Vector3(40, 0, 30),   // 右弯
    new THREE.Vector3(60, 0, -10),  // 右弯
    new THREE.Vector3(50, 0, -50),  // 发夹弯
    new THREE.Vector3(20, 0, -70),  // 左弯
    new THREE.Vector3(-20, 0, -70), // 左弯
    new THREE.Vector3(-50, 0, -50), // 发夹弯
    new THREE.Vector3(-60, 0, -10), // 左弯
    new THREE.Vector3(-40, 0, 30),  // 右弯
  ],
  roadWidth: 12,          // 路面半宽（总宽 24）
  shoulderWidth: 4,       // 路肩宽度
  guardrailHeight: 1.2,   // 护栏高度
  guardrailOffset: 0.5,   // 护栏距离路面边缘
  segments: 200,          // 样条细分段数
  // 装饰物配置
  treeDensity: 0.15,      // 每单位长度的树木数量
  treeMinDist: 18,        // 树距离中心线最小距离
  treeMaxDist: 35,        // 树距离中心线最大距离
  // 加速带配置
  boostZones: [
    { center: 0.15, length: 0.03 },  // 相对赛道长度的位置
    { center: 0.45, length: 0.03 },
    { center: 0.75, length: 0.03 },
  ],
  boostWidth: 6,          // 加速带宽度
  // 检查点配置
  checkpointCount: 8,     // 检查点数量（均匀分布）
};

class Track {
  constructor(scene) {
    this.scene = scene;
    this.spline = null;
    this.roadMesh = null;
    this.shoulderMeshes = [];
    this.guardrails = [];
    this.startLine = null;
    this.trees = [];
    this.boostZones = [];
    this.checkpoints = [];
    this.trackLength = 0;

    this._build();
  }

  _build() {
    this._createSpline();
    this._createRoad();
    this._createShoulders();
    this._createGuardrails();
    this._createStartLine();
    this._createTrees();
    this._createGrandstands();
    this._createTracksideDecorations();
    this._createBoostZones();
    this._createCheckpoints();
    this._createSkybox();
  }

  _createSpline() {
    // 创建闭环 CatmullRom 样条
    const points = TRACK_CONFIG.controlPoints;
    this.spline = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
    this.trackLength = this.spline.getLength();
  }

  _createRoad() {
    // 生成路面几何体：沿样条挤出矩形
    const segments = TRACK_CONFIG.segments;
    const halfWidth = TRACK_CONFIG.roadWidth;

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x); // 左侧法线

      // 左右两个顶点
      const left = pt.clone().addScaledVector(normal, halfWidth);
      const right = pt.clone().addScaledVector(normal, -halfWidth);
      left.y = 0.01; // 略高于地面避免 z-fighting
      right.y = 0.01;

      const idx = positions.length / 3;
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(t, 0, t, 1);

      if (i < segments) {
        // 两个三角形组成一个四边形（绕序：从上方看为逆时针，法线朝上）
        indices.push(idx, idx + 2, idx + 1);
        indices.push(idx + 2, idx + 3, idx + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    // 程序化沥青纹理
    const asphaltTex = createAsphaltTexture();
    // UV 缩放：沿赛道方向重复
    asphaltTex.repeat.set(TRACK_CONFIG.segments / 8, 1);
    
    const mat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      color: 0x444444,
      roughness: 0.9,
      metalness: 0.1,
      // P13: 路面与地面几乎共面，polygonOffset 保证路面深度始终压过地面（远距也稳定）
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.roadMesh = new THREE.Mesh(geo, mat);
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);
    
    // 存储纹理引用以便清理
    this.asphaltTexture = asphaltTex;

    // 白色边线
    this._createEdgeLines(halfWidth);
  }

  _createEdgeLines(halfWidth) {
    const segments = TRACK_CONFIG.segments;
    const linePositions = [[], []]; // 左、右边线

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

      const left = pt.clone().addScaledVector(normal, halfWidth);
      const right = pt.clone().addScaledVector(normal, -halfWidth);
      // P13: 抬高到路肩(0.04)之上，避免与路面/路肩共面闪烁
      left.y = 0.06;
      right.y = 0.06;

      linePositions[0].push(left.x, left.y, left.z);
      linePositions[1].push(right.x, right.y, right.z);
    }

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.9, transparent: true });

    for (let side = 0; side < 2; side++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions[side], 3));
      const line = new THREE.Line(geo, lineMat);
      this.scene.add(line);
    }
  }

  _createShoulders() {
    // 路肩（草地/泥土带）——路面两侧各 4 米
    const segments = TRACK_CONFIG.segments;
    const roadHalf = TRACK_CONFIG.roadWidth;
    const shoulderW = TRACK_CONFIG.shoulderWidth;

    for (let side = -1; side <= 1; side += 2) {
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

        const inner = pt.clone().addScaledVector(normal, side * roadHalf);
        const outer = pt.clone().addScaledVector(normal, side * (roadHalf + shoulderW));
        // P13: 原来 y=0 与地面完全共面导致红白路肩 Z-fighting 闪烁；抬高 4cm
        inner.y = 0.04;
        outer.y = 0.04;

        const idx = positions.length / 3;
        positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
        normals.push(0, 1, 0, 0, 1, 0);
        uvs.push(t, 0, t, 1);

        if (i < segments) {
          indices.push(idx, idx + 1, idx + 2);
          indices.push(idx + 2, idx + 1, idx + 3);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);

      // 红白路肩纹理
      const curbTex = createCurbTexture();
      curbTex.repeat.set(TRACK_CONFIG.segments / 4, 1);
      
      const mat = new THREE.MeshStandardMaterial({
        map: curbTex,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0,
        // P13: 双保险——深度偏移，保证路肩永远压过其下的地面
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.shoulderMeshes.push(mesh);
      
      // 存储纹理引用（只存一次）
      if (side === -1) this.curbTexture = curbTex;
    }
  }

  _createGuardrails() {
    // 护栏：在路肩外侧
    const segments = TRACK_CONFIG.segments;
    const roadHalf = TRACK_CONFIG.roadWidth;
    const shoulderW = TRACK_CONFIG.shoulderWidth;
    const guardrailOffset = TRACK_CONFIG.guardrailOffset;
    const guardrailHeight = TRACK_CONFIG.guardrailHeight;
    const postSpacing = 4; // 柱子间距

    const railGeo = new THREE.BoxGeometry(1, guardrailHeight, 0.15);
    const postGeo = new THREE.BoxGeometry(0.2, guardrailHeight + 0.3, 0.2);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.7 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.5 });

    for (let side = -1; side <= 1; side += 2) {
      const railGroup = new THREE.Group();

      // 连续横梁（分段近似）
      const railCount = Math.ceil(this.trackLength / 3);
      for (let i = 0; i < railCount; i++) {
        const t = (i + 0.5) / railCount;
        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

        const pos = pt.clone().addScaledVector(normal, side * (roadHalf + shoulderW + guardrailOffset));
        pos.y = guardrailHeight / 2;

        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.copy(pos);
        rail.rotation.y = Math.atan2(tangent.x, tangent.z);
        rail.castShadow = true;
        rail.receiveShadow = true;
        railGroup.add(rail);
      }

      // 立柱 + 广告牌
      const postCount = Math.ceil(this.trackLength / postSpacing);
      for (let i = 0; i < postCount; i++) {
        const t = i / postCount;
        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

        const pos = pt.clone().addScaledVector(normal, side * (roadHalf + shoulderW + guardrailOffset));
        pos.y = (guardrailHeight + 0.3) / 2;

        const post = new THREE.Mesh(postGeo, postMat);
        post.position.copy(pos);
        post.castShadow = true;
        post.receiveShadow = true;
        railGroup.add(post);

        // 每 5 个立柱放一个广告牌（在外侧）
        if (i % 5 === 0) {
          const billboardGeo = new THREE.PlaneGeometry(4, 2);
          const billboardTex = createBillboardTexture(i * side * 17);
          const billboardMat = new THREE.MeshBasicMaterial({
            map: billboardTex,
            transparent: true,
            side: THREE.DoubleSide,
          });
          const billboard = new THREE.Mesh(billboardGeo, billboardMat);
          billboard.position.copy(pos);
          billboard.position.y += guardrailHeight + 1.5;
          billboard.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
          // 广告牌朝向赛道内侧
          if (side === 1) billboard.rotation.y += Math.PI;
          billboard.castShadow = true;
          railGroup.add(billboard);
          
          // 存储纹理引用以便清理
          if (!this.billboardTextures) this.billboardTextures = [];
          this.billboardTextures.push(billboardTex);
        }
      }

      this.scene.add(railGroup);
      this.guardrails.push(railGroup);
    }
  }

  _createStartLine() {
    // 起终点线（红白相间）
    const halfWidth = TRACK_CONFIG.roadWidth;
    const pt = this.spline.getPointAt(0);
    const tangent = this.spline.getTangentAt(0).normalize(); // 前进方向（切线）
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x); // 左侧法线

    const group = new THREE.Group();
    group.position.copy(pt); // 组位于起点线位置
    // 旋转组：局部 +Z = 前进切线，局部 +X = 右侧（旧版多转了 PI/2，把横/纵轴搞反，
    // 导致整个拱门躺倒立在路中间）
    group.rotation.y = Math.atan2(tangent.x, tangent.z);
    const stripeCount = 12;
    const stripeWidth = (halfWidth * 2) / stripeCount;

    for (let i = 0; i < stripeCount; i++) {
      const color = i % 2 === 0 ? 0xffffff : 0xff0000;
      const offset = (i - stripeCount / 2 + 0.5) * stripeWidth;
      // 相对于组的局部坐标：X轴为左法线方向（组已旋转），Y向上
      const pos = new THREE.Vector3(-offset, 0.03, 0); // -offset 因为局部+X是左法线

      const geo = new THREE.PlaneGeometry(stripeWidth * 0.9, 0.6);
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const stripe = new THREE.Mesh(geo, mat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.copy(pos);
      group.add(stripe);
    }

    // 起点拱门：更详细的结构
    const archRadius = halfWidth + 2.5;
    const archHeight = 8;
    
    // 拱门主体（拱形管）
    const archCurve = new THREE.EllipseCurve(0, 0, archRadius, archHeight, Math.PI, 0, false, 0);
    const archPoints = archCurve.getPoints(32);
    const archGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPoints.map(p => new THREE.Vector3(p.x, p.y, 0))), 32, 0.35, 8, false);
    const archMat = new THREE.MeshStandardMaterial({ 
      color: 0xffdd00, 
      emissive: 0x443300, 
      roughness: 0.3, 
      metalness: 0.5 
    });
    const arch = new THREE.Mesh(archGeo, archMat);
    // 椭圆曲线本身就在 XY 平面：X=横向(±archRadius 跨路)、Y=高度(0~archHeight)，
    // 不要再旋转（旧版 rotation.z=-PI/2 会把拱门放倒成路中间的竖直半环，即"路中间的柱子"）
    arch.castShadow = true;
    group.add(arch);
    
    // 拱门立柱
    const columnGeo = new THREE.CylinderGeometry(0.5, 0.6, archHeight, 8);
    const columnMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.6 });
    for (const side of [-1, 1]) {
      const column = new THREE.Mesh(columnGeo, columnMat);
      const offset = side * archRadius;
      column.position.set(-offset, archHeight / 2, 0); // 局部坐标：-offset 因为局部+X是左法线
      column.castShadow = true;
      group.add(column);
    }
    
    // 起点旗帜
    const flagGeo = new THREE.PlaneGeometry(1.5, 1);
    const flagMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < 6; i++) {
      const flag = new THREE.Mesh(flagGeo, flagMat.clone());
      // 沿拱形曲线悬挂（贴合拱门，不再平飘在半空）
      const angle = ((i + 1) / 7) * Math.PI;
      flag.position.set(
        -Math.cos(angle) * archRadius, // -cos 因为局部+X是左法线
        Math.sin(angle) * archHeight * 0.82,
        0
      );
      flag.rotation.y = 0; // 旗面朝前（对着来车方向）
      flag.userData = { baseRotation: flag.rotation.y, index: i };
      group.add(flag);
    }
    
    // 起点灯光（红/黄/绿）
    const lightColors = [0xff0000, 0xffaa00, 0x00ff00];
    for (let i = 0; i < 3; i++) {
      const lightGeo = new THREE.SphereGeometry(0.25, 8, 6);
      const lightMat = new THREE.MeshBasicMaterial({ 
        color: lightColors[i],
        transparent: true,
        opacity: 0.8,
      });
      const light = new THREE.Mesh(lightGeo, lightMat);
      const lightOffset = (i - 1) * 2;
      light.position.set(-lightOffset, archHeight * 0.5, 0); // 局部坐标
      light.userData = { isStartLight: true, index: i };
      group.add(light);
    }

    // 存储：position 是世界坐标起点，normal 是前进切线（供生成点使用）
    this.startLine = { group, position: pt.clone(), normal: tangent.clone() };
    this.scene.add(group);
  }

  _createTrees() {
    // 沿赛道两侧生成树木
    const segments = TRACK_CONFIG.segments;
    const roadHalf = TRACK_CONFIG.roadWidth;
    const shoulderW = TRACK_CONFIG.shoulderWidth;
    const minDist = TRACK_CONFIG.treeMinDist;
    const maxDist = TRACK_CONFIG.treeMaxDist;

    // 树木类型：松树(圆锥)、阔叶树(球体)、棕榈树
    const treeTypes = [
      { // 松树
        trunkGeo: new THREE.CylinderGeometry(0.25, 0.35, 2.5, 6),
        crownGeo: new THREE.ConeGeometry(1.5, 5, 6),
        trunkColor: 0x3d2a1a,
        crownColor: 0x0d4010,
        crownOffsetY: 3.5,
        scale: 1.0,
      },
      { // 阔叶树
        trunkGeo: new THREE.CylinderGeometry(0.4, 0.5, 2, 6),
        crownGeo: new THREE.SphereGeometry(2, 8, 6),
        trunkColor: 0x4a2f1a,
        crownColor: 0x1b5e20,
        crownOffsetY: 3,
        scale: 1.2,
      },
      { // 棕榈树
        trunkGeo: new THREE.CylinderGeometry(0.2, 0.3, 4, 6),
        crownGeo: new THREE.ConeGeometry(2.5, 1.5, 6),
        trunkColor: 0x8b7355,
        crownColor: 0x2d5a1a,
        crownOffsetY: 4.5,
        scale: 0.8,
      },
    ];

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      // 概率生成
      if (Math.random() > TRACK_CONFIG.treeDensity) continue;

      for (let side = -1; side <= 1; side += 2) {
        if (Math.random() > 0.5) continue; // 进一步稀疏

        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

        const dist = minDist + Math.random() * (maxDist - minDist);
        const pos = pt.clone().addScaledVector(normal, side * dist);
        pos.y = 0;

        // 随机选择树木类型
        const type = treeTypes[Math.floor(Math.random() * treeTypes.length)];
        const scale = type.scale * (0.8 + Math.random() * 0.4);
        
        const trunkMat = new THREE.MeshStandardMaterial({ color: type.trunkColor, roughness: 0.9 });
        const crownMat = new THREE.MeshStandardMaterial({ color: type.crownColor, roughness: 0.9 });

        const trunk = new THREE.Mesh(type.trunkGeo, trunkMat);
        trunk.position.copy(pos);
        trunk.position.y = (type.trunkGeo.parameters.height || 2) / 2;
        trunk.scale.set(scale, scale, scale);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        this.scene.add(trunk);
        this.trees.push(trunk);

        const crown = new THREE.Mesh(type.crownGeo, crownMat);
        crown.position.copy(pos);
        crown.position.y = type.crownOffsetY * scale;
        crown.scale.set(scale, scale, scale);
        crown.castShadow = true;
        crown.receiveShadow = true;
        this.scene.add(crown);
        this.trees.push(crown);
      }
    }
  }

  _createSkybox() {
    // 创建天空盒（大球体，内侧渲染）
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    skyGeo.scale(-1, 1, 1); // 翻转法线朝内
    
    // 程序化天空渐变纹理
    const skyTex = this._createSkyTexture();
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
    });
    
    this.skybox = new THREE.Mesh(skyGeo, skyMat);
    this.skybox.renderOrder = -100; // 最先渲染
    this.scene.add(this.skybox);
    
    // 云朵层
    this._createClouds();
    
    this.skyTexture = skyTex;
  }

  _createSkyTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2; // 全景比例
    const ctx = canvas.getContext('2d');
    
    // 天空渐变：顶部深蓝 -> 地平线浅蓝/橙
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#001a33');      // 头顶深蓝
  gradient.addColorStop(0.4, '#003d66');    // 中上部
  gradient.addColorStop(0.6, '#4a90d9');    // 地平线附近
  gradient.addColorStop(0.8, '#ff8c42');    // 夕阳色
  gradient.addColorStop(1, '#ff6b35');      // 地平线
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 太阳
  ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
  ctx.beginPath();
  ctx.arc(canvas.width * 0.8, canvas.height * 0.3, 60, 0, Math.PI * 2);
  ctx.fill();
  
  // 太阳光晕
  const sunGlow = ctx.createRadialGradient(
    canvas.width * 0.8, canvas.height * 0.3, 0,
    canvas.width * 0.8, canvas.height * 0.3, 120
  );
  sunGlow.addColorStop(0, 'rgba(255, 255, 150, 0.4)');
  sunGlow.addColorStop(1, 'rgba(255, 200, 100, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(canvas.width * 0.8, canvas.height * 0.3, 120, 0, Math.PI * 2);
  ctx.fill();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
  }

  _createClouds() {
    const cloudTex = createCloudTexture();
    this.cloudMeshes = [];
    
    for (let i = 0; i < 20; i++) {
      const cloudGeo = new THREE.PlaneGeometry(80, 40);
      const cloudMat = new THREE.MeshBasicMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      
      // 随机位置在天空中
      const radius = 300 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1) * 0.5; // 上半球
      
      cloud.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      
      // 云朵朝向中心
      cloud.lookAt(0, 0, 0);
      cloud.rotation.x += Math.PI / 2;
      
      cloud.userData = {
        baseY: cloud.position.y,
        speedX: (Math.random() - 0.5) * 0.5,
        speedZ: (Math.random() - 0.5) * 0.5,
        radius,
        theta,
        phi,
      };
      
      this.scene.add(cloud);
      this.cloudMeshes.push(cloud);
    }
    this.cloudTexture = cloudTex;
  }

  /**
   * 创建看台/观众
   * 在赛道直道段放置分层看台，上面坐满低多边形观众
   */
  _createGrandstands() {
    this.grandstands = [];
    this.spectators = [];
    this.spectatorTextures = [];
    
    // 看台配置：在赛道的直道段放置
    // 我们在几个关键 t 值位置放置看台
    const grandstandPositions = [
      { t: 0.05, side: 1, length: 40, rows: 6, name: 'start' },    // 起点附近外侧
      { t: 0.25, side: -1, length: 30, rows: 5, name: 'turn1' },    // 第1弯内侧
      { t: 0.5, side: 1, length: 35, rows: 5, name: 'backstraight' }, // 后直道外侧
      { t: 0.75, side: -1, length: 30, rows: 5, name: 'turn3' },    // 第3弯内侧
    ];
    
    const roadHalf = TRACK_CONFIG.roadWidth;
    const shoulderW = TRACK_CONFIG.shoulderWidth;
    const guardrailOffset = TRACK_CONFIG.guardrailOffset;
    const baseOffset = roadHalf + shoulderW + guardrailOffset + 3; // 看台起始距离
    
    // 看台材质
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.8,
      metalness: 0.1,
    });
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.7,
      metalness: 0.1,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.4,
      metalness: 0.7,
    });
    
    for (const gs of grandstandPositions) {
      const group = new THREE.Group();
      
      // 计算看台中心位置和朝向
      const centerT = gs.t;
      const centerPt = this.spline.getPointAt(centerT);
      const tangent = this.spline.getTangentAt(centerT).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      
      // 看台尺寸
      const rowDepth = 1.2;
      const rowHeight = 0.5;
      const seatWidth = 0.45;
      const seatsPerRow = Math.floor(gs.length / seatWidth);
      
      // 基础平台（地面基座）
      const baseGeo = new THREE.BoxGeometry(gs.length + 2, 0.5, gs.rows * rowDepth + 2);
      const base = new THREE.Mesh(baseGeo, concreteMat);
      const basePos = centerPt.clone().addScaledVector(normal, gs.side * (baseOffset + gs.rows * rowDepth / 2));
      basePos.y = 0.25;
      base.position.copy(basePos);
      base.rotation.y = Math.atan2(tangent.x, tangent.z);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
      
      // 分层座位
      for (let row = 0; row < gs.rows; row++) {
        const rowY = 0.5 + row * rowHeight;
        const rowZOffset = row * rowDepth;
        
        // 座位板
        const seatGeo = new THREE.BoxGeometry(gs.length, 0.15, rowDepth * 0.6);
        for (let s = 0; s < seatsPerRow; s++) {
          const seatX = (s - seatsPerRow / 2 + 0.5) * seatWidth;
          const seat = new THREE.Mesh(seatGeo, seatMat);
          seat.position.set(seatX, rowY + 0.075, rowZOffset);
          seat.castShadow = true;
          group.add(seat);
        }
        
        // 踏板/台阶
        const stepGeo = new THREE.BoxGeometry(gs.length, rowHeight, 0.2);
        const step = new THREE.Mesh(stepGeo, concreteMat);
        step.position.set(0, rowY / 2, rowZOffset + rowDepth * 0.4);
        step.castShadow = true;
        step.receiveShadow = true;
        group.add(step);
      }
      
      // 扶手/栏杆
      const railGeo = new THREE.CylinderGeometry(0.05, 0.05, gs.rows * rowDepth + 1, 8);
      for (const sideX of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, metalMat);
        rail.position.set(sideX * (gs.length / 2 + 0.5), (gs.rows * rowHeight) / 2 + 0.5, 0);
        rail.rotation.x = Math.PI / 2;
        rail.castShadow = true;
        group.add(rail);
      }
      
      // 后部挡板
      const backGeo = new THREE.BoxGeometry(gs.length + 1, gs.rows * rowHeight + 1, 0.2);
      const back = new THREE.Mesh(backGeo, concreteMat);
      back.position.set(0, (gs.rows * rowHeight) / 2 + 0.25, -gs.rows * rowDepth / 2 - 1);
      back.castShadow = true;
      back.receiveShadow = true;
      group.add(back);
      
      // 支撑柱
      const columnGeo = new THREE.CylinderGeometry(0.3, 0.4, gs.rows * rowHeight + 0.5, 8);
      for (let colX = -1; colX <= 1; colX += 2) {
        for (let colZ = 0; colZ <= 1; colZ++) {
          const column = new THREE.Mesh(columnGeo, concreteMat);
          column.position.set(colX * (gs.length / 2), (gs.rows * rowHeight + 0.5) / 2, (colZ - 0.5) * gs.rows * rowDepth);
          column.castShadow = true;
          group.add(column);
        }
      }
      
      // 放置观众
      this._populateGrandstand(group, gs, centerPt, tangent, normal, baseOffset, seatsPerRow, seatWidth, rowDepth, rowHeight);
      
      // 将整个看台组旋转并定位
      group.rotation.y = Math.atan2(tangent.x, tangent.z);
      group.position.copy(basePos);
      // 注意：上面已经设置过位置了，这里需要调整
      group.position.y = 0;
      
      this.scene.add(group);
      this.grandstands.push(group);
    }
  }

  /**
   * 在看台上填充观众
   */
  _populateGrandstand(group, gs, centerPt, tangent, normal, baseOffset, seatsPerRow, seatWidth, rowDepth, rowHeight) {
    // 每个座位有 70% 概率坐人
    for (let row = 0; row < gs.rows; row++) {
      for (let s = 0; s < seatsPerRow; s++) {
        if (Math.random() > 0.7) continue;
        
        const spectatorTex = createSpectatorTexture(Math.random() * 1000);
        this.spectatorTextures.push(spectatorTex);
        
        // 观众用 Plane + 透明纹理（Billboard 风格，始终面向赛道）
        const specGeo = new THREE.PlaneGeometry(0.7, 1.4);
        const specMat = new THREE.MeshBasicMaterial({
          map: spectatorTex,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide,
        });
        const spectator = new THREE.Mesh(specGeo, specMat);
        
        // 局部坐标（看台组内）
        const localX = (s - seatsPerRow / 2 + 0.5) * seatWidth;
        const localY = 0.5 + row * rowHeight + 0.7; // 坐在座位上
        const localZ = row * rowDepth - 0.2;
        
        spectator.position.set(localX, localY, localZ);
        
        // 观众朝向赛道中心（看台内侧）
        spectator.rotation.y = gs.side === 1 ? Math.PI : 0;
        
        // 轻微随机旋转增加自然感
        spectator.rotation.y += (Math.random() - 0.5) * 0.3;
        
        // 动画数据
        spectator.userData = {
          baseRotation: spectator.rotation.y,
          row,
          seat: s,
          wavePhase: Math.random() * Math.PI * 2,
          waveSpeed: 0.5 + Math.random() * 0.5,
        };
        
        group.add(spectator);
        this.spectators.push(spectator);
      }
    }
  }

  /**
   * 创建赛道侧装饰物：路灯、路标、轮胎堆
   */
  _createTracksideDecorations() {
    this.tracksideDecorations = [];
    this.decorationTextures = [];
    
    const roadHalf = TRACK_CONFIG.roadWidth;
    const shoulderW = TRACK_CONFIG.shoulderWidth;
    const guardrailOffset = TRACK_CONFIG.guardrailOffset;
    const baseOffset = roadHalf + shoulderW + guardrailOffset + 2;
    
    // --- 路灯 ---
    // 在赛道两侧每隔一段距离放置路灯
    const lampSpacing = 25;
    const lampCount = Math.ceil(this.trackLength / lampSpacing);
    
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.2, 6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.5 });
    const armGeo = new THREE.BoxGeometry(3, 0.1, 0.15);
    const lightGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7, transparent: true, opacity: 0.9 });
    const glowGeo = new THREE.SphereGeometry(0.5, 8, 6);
    
    for (let i = 0; i < lampCount; i++) {
      const t = i / lampCount;
      // 只在直道段放路灯（避免弯道内侧）
      const tangent = this.spline.getTangentAt(t).normalize();
      const nextTangent = this.spline.getTangentAt((t + 0.02) % 1).normalize();
      const curvature = tangent.angleTo(nextTangent);
      if (curvature > 0.15) continue; // 弯道太急，不放路灯
      
      for (let side = -1; side <= 1; side += 2) {
        if (Math.random() > 0.6) continue; // 稀疏放置
        
        const pt = this.spline.getPointAt(t);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        
        const pos = pt.clone().addScaledVector(normal, side * (baseOffset + Math.random() * 3));
        
        const lampGroup = new THREE.Group();
        
        // 灯柱
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 3;
        pole.castShadow = true;
        lampGroup.add(pole);
        
        // 横臂
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(0, 5.8, 0);
        arm.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
        if (side === -1) arm.rotation.y += Math.PI; // 内侧路灯臂朝向赛道
        arm.castShadow = true;
        lampGroup.add(arm);
        
        // 灯头
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(side * 1.5, 5.85, 0);
        light.castShadow = false;
        lampGroup.add(light);
        
        // 发光球（视觉效果）
        const glowMat = new THREE.MeshBasicMaterial({ 
          color: 0xfff8e7, 
          transparent: true, 
          opacity: 0.15,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(light.position);
        glow.scale.set(1, 1, 1);
        lampGroup.add(glow);
        
        // 存储发光球用于动画
        glow.userData = { isLampGlow: true, phase: Math.random() * Math.PI * 2 };
        
        // 添加 Three.js 点光源（可选，影响性能，这里用 emissive 模拟）
        const pointLight = new THREE.PointLight(0xfff8e7, 0.8, 15, 2);
        pointLight.position.copy(light.position);
        pointLight.castShadow = false;
        lampGroup.add(pointLight);
        
        lampGroup.position.copy(pos);
        lampGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
        
        this.scene.add(lampGroup);
        this.tracksideDecorations.push(lampGroup);
      }
    }
    
    // --- 路标标志 ---
    const signPositions = [
      { t: 0.12, side: 1, text: 'TURN →', bg: '#aa4400' },
      { t: 0.38, side: -1, text: 'HAIRPIN', bg: '#aa0000' },
      { t: 0.62, side: 1, text: '↑ BOOST', bg: '#0066aa' },
      { t: 0.88, side: -1, text: 'FINISH →', bg: '#006600' },
    ];
    
    const signPoleGeo = new THREE.CylinderGeometry(0.1, 0.12, 4, 8);
    const signPoleMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5, metalness: 0.5 });
    const signBoardGeo = new THREE.PlaneGeometry(3, 1.5);
    
    for (const sp of signPositions) {
      const pt = this.spline.getPointAt(sp.t);
      const tangent = this.spline.getTangentAt(sp.t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      
      const pos = pt.clone().addScaledVector(normal, sp.side * (baseOffset + 1));
      pos.y = 0;
      
      const signGroup = new THREE.Group();
      
      // 立柱
      const pole = new THREE.Mesh(signPoleGeo, signPoleMat);
      pole.position.y = 2;
      pole.castShadow = true;
      signGroup.add(pole);
      
      // 标志牌
      const signTex = createSignTexture(sp.text, sp.bg);
      this.decorationTextures.push(signTex);
      const signMat = new THREE.MeshBasicMaterial({
        map: signTex,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const board = new THREE.Mesh(signBoardGeo, signMat);
      board.position.y = 3.5;
      board.rotation.y = Math.atan2(tangent.x, tangent.z) + (sp.side === 1 ? Math.PI / 2 : -Math.PI / 2);
      board.castShadow = true;
      signGroup.add(board);
      
      signGroup.position.copy(pos);
      this.scene.add(signGroup);
      this.tracksideDecorations.push(signGroup);
    }
    
    // --- 轮胎堆（护栏外侧，作为缓冲/装饰）---
    const tireStackPositions = [
      { t: 0.15, side: 1, count: 3 },
      { t: 0.35, side: -1, count: 4 },
      { t: 0.55, side: 1, count: 3 },
      { t: 0.78, side: -1, count: 4 },
    ];
    
    const tireTex = createTireStackTexture();
    this.decorationTextures.push(tireTex);
    const tireGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16);
    const tireMat = new THREE.MeshStandardMaterial({ map: tireTex, color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
    
    for (const tp of tireStackPositions) {
      const pt = this.spline.getPointAt(tp.t);
      const tangent = this.spline.getTangentAt(tp.t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      
      const stackGroup = new THREE.Group();
      
      for (let row = 0; row < tp.count; row++) {
        const tiresInRow = tp.count - row;
        for (let i = 0; i < tiresInRow; i++) {
          const tire = new THREE.Mesh(tireGeo, tireMat);
          tire.rotation.z = Math.PI / 2;
          
          const xOffset = (i - (tiresInRow - 1) / 2) * 1.3;
          const zOffset = row * 0.42;
          const yOffset = 0.2 + row * 0.42;
          
          tire.position.set(xOffset, yOffset, zOffset);
          tire.castShadow = true;
          tire.receiveShadow = true;
          stackGroup.add(tire);
        }
      }
      
      const pos = pt.clone().addScaledVector(normal, tp.side * (baseOffset - 1));
      stackGroup.position.copy(pos);
      stackGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
      
      this.scene.add(stackGroup);
      this.tracksideDecorations.push(stackGroup);
    }
  }

  _createBoostZones() {
    // 蓝色加速带
    const halfWidth = TRACK_CONFIG.roadWidth;
    const boostWidth = TRACK_CONFIG.boostWidth;

    for (const zone of TRACK_CONFIG.boostZones) {
      const tCenter = zone.center;
      const tHalfLen = zone.length / 2;
      const tStart = (tCenter - tHalfLen + 1) % 1;
      const tEnd = (tCenter + tHalfLen + 1) % 1;

      // 处理跨越 0/1 边界的情况
      const ranges = tStart < tEnd ? [[tStart, tEnd]] : [[tStart, 1], [0, tEnd]];

      for (const [ts, te] of ranges) {
        const segments = Math.max(4, Math.round((te - ts) * TRACK_CONFIG.segments));
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
          const t = ts + (te - ts) * (i / segments);
          const pt = this.spline.getPointAt(t);
          const tangent = this.spline.getTangentAt(t).normalize();
          const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

          const left = pt.clone().addScaledVector(normal, boostWidth / 2);
          const right = pt.clone().addScaledVector(normal, -boostWidth / 2);
          // P13: 抬高，与路面拉开 4cm，避免远距闪烁
          left.y = 0.05;
          right.y = 0.05;

          const idx = positions.length / 3;
          positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
          uvs.push(i / segments, 0, i / segments, 1);

          if (i < segments) {
            indices.push(idx, idx + 1, idx + 2);
            indices.push(idx + 2, idx + 1, idx + 3);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeBoundingSphere();

        const mat = new THREE.MeshBasicMaterial({
          color: 0x00aaff,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { isBoostZone: true, boostPower: 1.5 };
        this.scene.add(mesh);
        this.boostZones.push(mesh);
      }
    }
  }

  _createCheckpoints() {
    // 均匀分布的检查点，防止切弯
    const count = TRACK_CONFIG.checkpointCount;
    const halfWidth = TRACK_CONFIG.roadWidth * 1.5; // 检查点比路面宽，防止漏判

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

      // 检查点是一个不可见的平面触发器
      const geo = new THREE.PlaneGeometry(halfWidth * 2, 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        visible: false,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.position.copy(pt);
      plane.position.y = 1;
      plane.lookAt(pt.clone().add(tangent));
      plane.rotation.y += Math.PI / 2;

      plane.userData = { checkpointIndex: i, t };
      this.scene.add(plane);
      this.checkpoints.push(plane);
    }
  }

  /**
   * 获取距离赛道中心线的最近距离和对应的 t 值
   * @param {THREE.Vector3} position - 世界坐标位置
   * @returns {Object} { distance, t, point, tangent, normal }
   */
  getClosestPoint(position) {
    // 采样法：在样条上均匀采样找最近点（足够精确且简单）
    const samples = 200;
    let minDist = Infinity;
    let bestT = 0;
    let bestPoint = new THREE.Vector3();
    let bestTangent = new THREE.Vector3();
    let bestNormal = new THREE.Vector3();

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const pt = this.spline.getPointAt(t);
      const dist = position.distanceTo(pt);
      if (dist < minDist) {
        minDist = dist;
        bestT = t;
        bestPoint.copy(pt);
        bestTangent.copy(this.spline.getTangentAt(t)).normalize();
        bestNormal.set(-bestTangent.z, 0, bestTangent.x);
      }
    }

    return { distance: minDist, t: bestT, point: bestPoint, tangent: bestTangent, normal: bestNormal };
  }

  /**
   * 判断是否在赛道上（路面+路肩范围内）
   * @param {THREE.Vector3} position
   * @returns {boolean}
   */
  isOnTrack(position) {
    const { distance } = this.getClosestPoint(position);
    const maxDist = TRACK_CONFIG.roadWidth + TRACK_CONFIG.shoulderWidth;
    return distance <= maxDist;
  }

  /**
   * 判断是否在路面上（不含路肩）
   * @param {THREE.Vector3} position
   * @returns {boolean}
   */
  isOnRoad(position) {
    const { distance } = this.getClosestPoint(position);
    return distance <= TRACK_CONFIG.roadWidth;
  }

  /**
   * 判断是否在加速带上
   * @param {THREE.Vector3} position
   * @returns {number} 加速倍率（1 = 无加速，>1 = 有加速）
   */
  getBoostMultiplier(position) {
    for (const zone of this.boostZones) {
      // 简单的 AABB 检测（近似）
      const box = new THREE.Box3().setFromObject(zone);
      if (box.containsPoint(position)) {
        return zone.userData.boostPower;
      }
    }
    return 1.0;
  }

  /**
   * 检查检查点通过
   * @param {THREE.Vector3} position
   * @param {number} lastCheckpointIndex - 上一个通过的检查点索引
   * @returns {number} 新的检查点索引（-1 表示未通过新检查点）
   */
  checkCheckpoints(position, lastCheckpointIndex) {
    const nextIndex = (lastCheckpointIndex + 1) % this.checkpoints.length;
    const cp = this.checkpoints[nextIndex];

    // 简单距离检测
    const dist = position.distanceTo(cp.position);
    if (dist < TRACK_CONFIG.roadWidth * 2) {
      return nextIndex;
    }
    return -1;
  }

  /**
   * 获取起点线信息（用于判圈）
   * @returns {Object} { position, normal, t }
   * 注意：normal 是左侧法线（指向赛道左侧），用于判断穿越方向
   */
  getStartLineInfo() {
    const pt = this.spline.getPointAt(0);
    const tangent = this.spline.getTangentAt(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x); // 左侧法线
    return {
      position: pt.clone(),
      normal: normal,
      t: 0,
    };
  }

  /**
   * 获取指定 t 处的位置和切线（用于 AI 赛车线）
   * @param {number} t - 0~1
   * @returns {Object} { position, tangent, normal }
   */
  getTrackInfoAt(t) {
    const pt = this.spline.getPointAt(t);
    const tangent = this.spline.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    return { position: pt, tangent, normal };
  }

  /**
   * 获取赛道总长度
   * @returns {number}
   */
    /**
   * 获取起点线后方指定距离的生成位置（沿样条逆向采样）
   * @param {number} distanceBack - 距起点线后方的距离（米）
   * @param {number} lateralOffset - 横向偏移（米，正=左侧法线方向）
   * @returns {Object} { position, rotation, onRoad }
   */
  getSpawnPosition(distanceBack, lateralOffset = 0) {
    const trackLength = this.trackLength;
    // 起点在 u=0，后方距离对应沿样条前进 trackLength - distanceBack
    // 使用 getUtoTmapping 将弧长距离转换为样条参数（修正非均匀参数化）
    const u = this.spline.getUtoTmapping(0, trackLength - distanceBack);
    const info = this.getTrackInfoAt(u);
    
    const position = info.position.clone().addScaledVector(info.normal, lateralOffset);
    position.y = 0.5;
    const rotation = Math.atan2(info.tangent.x, info.tangent.z);
    
    // 验证是否在路面内（到中心线距离 < 路面半宽 - 1 米安全边距）
    const onRoad = this.isOnRoad(position);
    
    return { position, rotation, onRoad, u };
  }

  /**
   * 获取 4 个起点生成位置（2×2 错位排布，纵向错开 4 米）
   * 返回数组 [前左, 前右, 后左, 后右]，均保证在路面内
   * @returns {Array<Object>} 每项 { position, rotation, onRoad }
   */
  getSpawnPositions() {
    const positions = [];
    // 两行：前排距起点线 8 米，后排 12 米
    const rowDistances = [8, 12];
    // 横向偏移：左 -2.5，右 +2.5（路面半宽 12，留足安全边距）
    const lateralOffsets = [-2.5, 2.5];
    
    for (const distBack of rowDistances) {
      for (const latOffset of lateralOffsets) {
        const spawn = this.getSpawnPosition(distBack, latOffset);
        // 若超出路面，向中心线修正
        if (!spawn.onRoad) {
          const clamped = THREE.MathUtils.clamp(latOffset, -TRACK_CONFIG.roadWidth + 1, TRACK_CONFIG.roadWidth - 1);
          const corrected = this.getSpawnPosition(distBack, clamped);
          positions.push(corrected);
        } else {
          positions.push(spawn);
        }
      }
    }
    return positions;
  }

  getLength() {
    return this.trackLength;
  }

  /**
   * 每帧更新：云朵飘动、观众挥手、路灯呼吸
   * @param {number} dt - 时间增量（秒）
   * @param {number} time - 总时间（秒）
   */
  update(dt, time) {
    // 云朵飘动
    if (this.cloudMeshes) {
      for (const cloud of this.cloudMeshes) {
        const ud = cloud.userData;
        ud.theta += ud.speedX * dt * 0.02;
        ud.phi += ud.speedZ * dt * 0.01;
        // 限制在上半球
        ud.phi = THREE.MathUtils.clamp(ud.phi, 0.1, Math.PI / 2 - 0.1);
        cloud.position.set(
          ud.radius * Math.sin(ud.phi) * Math.cos(ud.theta),
          ud.radius * Math.cos(ud.phi),
          ud.radius * Math.sin(ud.phi) * Math.sin(ud.theta)
        );
        cloud.lookAt(0, 0, 0);
        cloud.rotation.x += Math.PI / 2;
      }
    }
    
    // 观众挥手/身体晃动动画
    if (this.spectators) {
      for (const spec of this.spectators) {
        const ud = spec.userData;
        // 呼吸式晃动
        const wave = Math.sin(time * ud.waveSpeed + ud.wavePhase) * 0.15;
        spec.rotation.y = ud.baseRotation + wave;
        // 偶尔的挥手（缩放 Y 模拟）
        if (Math.random() < 0.002) {
          spec.scale.y = 1.2;
          setTimeout(() => { spec.scale.y = 1; }, 200);
        }
      }
    }
    
    // 路灯发光呼吸动画
    if (this.tracksideDecorations) {
      for (const deco of this.tracksideDecorations) {
        deco.traverse(obj => {
          if (obj.userData?.isLampGlow) {
            const ud = obj.userData;
            ud.phase += dt * 2;
            const pulse = 0.85 + Math.sin(ud.phase) * 0.15;
            obj.scale.setScalar(pulse);
            obj.material.opacity = 0.1 * pulse;
          }
        });
      }
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.roadMesh) {
      this.roadMesh.geometry.dispose();
      this.roadMesh.material.dispose();
      if (this.roadMesh.material.map) this.roadMesh.material.map.dispose();
      this.scene.remove(this.roadMesh);
    }
    if (this.asphaltTexture) this.asphaltTexture.dispose();
    for (const mesh of this.shoulderMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      this.scene.remove(mesh);
    }
    if (this.curbTexture) this.curbTexture.dispose();
    for (const rail of this.guardrails) {
      rail.traverse(obj => {
        if (obj.isMesh) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      this.scene.remove(rail);
    }
    if (this.startLine) {
      this.startLine.group.traverse(obj => {
        if (obj.isMesh) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      this.scene.remove(this.startLine.group);
    }
    for (const tree of this.trees) {
      tree.geometry.dispose();
      tree.material.dispose();
      this.scene.remove(tree);
    }
    for (const zone of this.boostZones) {
      zone.geometry.dispose();
      zone.material.dispose();
      this.scene.remove(zone);
    }
    for (const cp of this.checkpoints) {
      cp.geometry.dispose();
      cp.material.dispose();
      this.scene.remove(cp);
    }
    // 清理看台
    if (this.grandstands) {
      for (const gs of this.grandstands) {
        gs.traverse(obj => {
          if (obj.isMesh) {
            obj.geometry.dispose();
            obj.material.dispose();
          }
        });
        this.scene.remove(gs);
      }
    }
    // 清理观众纹理
    if (this.spectatorTextures) {
      for (const tex of this.spectatorTextures) tex.dispose();
    }
    // 清理赛道侧装饰物
    if (this.tracksideDecorations) {
      for (const deco of this.tracksideDecorations) {
        deco.traverse(obj => {
          if (obj.isMesh) {
            obj.geometry.dispose();
            obj.material.dispose();
            if (obj.material.map) obj.material.map.dispose();
          }
          if (obj.isLight) {
            this.scene.remove(obj);
          }
        });
        this.scene.remove(deco);
      }
    }
    // 清理装饰物纹理
    if (this.decorationTextures) {
      for (const tex of this.decorationTextures) tex.dispose();
    }
    // 清理天空盒
    if (this.skybox) {
      this.skybox.geometry.dispose();
      this.skybox.material.dispose();
      if (this.skyTexture) this.skyTexture.dispose();
      this.scene.remove(this.skybox);
    }
    // 清理云朵
    if (this.cloudMeshes) {
      for (const cloud of this.cloudMeshes) {
        cloud.geometry.dispose();
        cloud.material.dispose();
      }
      if (this.cloudTexture) this.cloudTexture.dispose();
    }
    // 清理广告牌纹理
    if (this.billboardTextures) {
      for (const tex of this.billboardTextures) tex.dispose();
    }
  }
}

export { Track, TRACK_CONFIG };