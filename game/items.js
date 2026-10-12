import * as THREE from 'three';
import { Shell, triggerLightningFlash } from './projectiles.js';

/**
 * 道具系统模块：?道具箱、蘑菇加速、香蕉皮、红龟壳、绿龟壳、闪电
 */

// 道具配置
const ITEM_CONFIG = {
  boxCount: 8,              // 道具箱数量
  boxSize: 1.8,             // 箱子大小
  boxHeight: 2.5,           // 箱子高度（底部离地高度）
  respawnTime: 8,           // 重生时间（秒）
  items: {
    mushroom: { probability: 0.4, duration: 3.0, boostMultiplier: 1.8 }, // 蘑菇
    banana: { probability: 0.25, slipDuration: 1.5 },                     // 香蕉
    red_shell: { probability: 0.15, speed: 55, lifetime: 8 },             // 红龟壳
    green_shell: { probability: 0.1, speed: 60, lifetime: 6 },            // 绿龟壳
    lightning: { probability: 0.1, shrinkDuration: 4.0 },                 // 闪电
  },
  bananaLifetime: 30,       // 香蕉皮存活时间（秒）
  bananaSlipForce: 0.3,     // 打滑时的速度保留系数
  shellCollisionRadius: 1.6,
  shellHitStunDuration: 1.5,
  shellHitSpeedMult: 0.4,
};

/**
 * 道具类型枚举
 */
const ItemType = {
  NONE: 'none',
  MUSHROOM: 'mushroom',
  BANANA: 'banana',
  RED_SHELL: 'red_shell',
  GREEN_SHELL: 'green_shell',
  LIGHTNING: 'lightning',
};

/**
 * 道具箱类 (P6: 细化版)
 */
class ItemBox {
  constructor(scene, track, position, rotation) {
    this.scene = scene;
    this.track = track;
    this.position = position.clone();
    this.rotation = rotation;
    this.active = true;
    this.respawnTimer = 0;
    this.collectedBy = null;

    this.mesh = this._createMesh();
    this.scene.add(this.mesh);

    this.rotationSpeed = 1.2 + Math.random() * 0.5;
    this.bobOffset = Math.random() * Math.PI * 2;
    this.bobSpeed = 1.5 + Math.random() * 0.5;
  }

  _createMesh() {
    const group = new THREE.Group();
    const size = ITEM_CONFIG.boxSize;

    // --- 箱子主体：带倒角边缘的立方体 ---
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffdd00,
      roughness: 0.2,
      metalness: 0.3,
      emissive: 0x443300,
      emissiveIntensity: 0.3,
    });

    // 底座
    const baseGeo = new THREE.BoxGeometry(size, size * 0.15, size);
    const base = new THREE.Mesh(baseGeo, boxMat);
    base.position.y = -size * 0.425;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 主体
    const bodyGeo = new THREE.BoxGeometry(size * 0.9, size * 0.7, size * 0.9);
    const body = new THREE.Mesh(bodyGeo, boxMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 顶盖
    const lidGeo = new THREE.BoxGeometry(size, size * 0.15, size);
    const lidMat = new THREE.MeshStandardMaterial({
      color: 0xffee00,
      roughness: 0.1,
      metalness: 0.4,
      emissive: 0x554400,
      emissiveIntensity: 0.4,
    });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = size * 0.425;
    lid.castShadow = true;
    group.add(lid);

    // 发光内部 (透明盒子)
    const innerGeo = new THREE.BoxGeometry(size * 0.6, size * 0.5, size * 0.6);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffff88,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    group.add(inner);
    this.innerGlow = inner;

    // --- 问号标记 (六个面，稍微凸起) ---
    const markGeo = new THREE.PlaneGeometry(size * 0.5, size * 0.5);
    const markMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const faces = [
      { pos: [0, 0, size * 0.5 + 0.01], rot: [0, 0, 0] },
      { pos: [0, 0, -size * 0.5 - 0.01], rot: [0, Math.PI, 0] },
      { pos: [size * 0.5 + 0.01, 0, 0], rot: [0, -Math.PI / 2, 0] },
      { pos: [-size * 0.5 - 0.01, 0, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [0, size * 0.5 + 0.01, 0], rot: [-Math.PI / 2, 0, 0] },
      { pos: [0, -size * 0.5 - 0.01, 0], rot: [Math.PI / 2, 0, 0] },
    ];

    this.questionMarks = [];
    for (const face of faces) {
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.position.set(...face.pos);
      mark.rotation.set(...face.rot);
      group.add(mark);
      this.questionMarks.push(mark);
    }

    // 角落装饰螺丝
    const screwGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x888, roughness: 0.3, metalness: 0.8 });
    const screwOffset = size * 0.42;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (const y of [-0.35, 0, 0.35]) {
        const screw = new THREE.Mesh(screwGeo, screwMat);
        screw.position.set(x * screwOffset, y, z * screwOffset);
        screw.rotation.x = Math.PI / 2;
        group.add(screw);
      }
    }

    group.userData = { itemBox: this };
    return group;
  }

  update(dt) {
    if (!this.active) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.active = true;
        this.mesh.visible = true;
        this.collectedBy = null;
      }
      return;
    }

    // 悬浮旋转动画
    this.mesh.rotation.y += this.rotationSpeed * dt;
    const bobY = Math.sin(performance.now() / 1000 * this.bobSpeed + this.bobOffset) * 0.3;
    this.mesh.position.y = this.position.y + bobY;

    // 内部发光脉动
    if (this.innerGlow) {
      const pulse = (Math.sin(performance.now() / 1000 * 4) + 1) * 0.5;
      this.innerGlow.material.opacity = 0.15 + pulse * 0.25;
      this.innerGlow.scale.setScalar(0.9 + pulse * 0.2);
    }
  }

  tryCollect(kartPos, kart) {
    if (!this.active) return null;

    const dist = kartPos.distanceTo(this.position);
    if (dist < ITEM_CONFIG.boxSize * 1.2) {
      this.active = false;
      this.mesh.visible = false;
      this.respawnTimer = ITEM_CONFIG.respawnTime;
      this.collectedBy = kart;

      const rand = Math.random();
      const items = ITEM_CONFIG.items;
      let cumulative = 0;
      for (const [key, config] of Object.entries(items)) {
        cumulative += config.probability;
        if (rand < cumulative) {
          return ItemType[key.toUpperCase()];
        }
      }
      return ItemType.MUSHROOM; // fallback
    }
    return null;
  }

  dispose() {
    this.mesh.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
    this.scene.remove(this.mesh);
  }
}

/**
 * 蘑菇类 (P6: 3D 模型)
 */
class Mushroom {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.active = true;
    this.lifetime = 15; // 15秒后消失
    this.collected = false;

    this.mesh = this._createMesh();
    this.scene.add(this.mesh);

    this.bobOffset = Math.random() * Math.PI * 2;
    this.spinSpeed = 1.5 + Math.random() * 1.0;
  }

  _createMesh() {
    const group = new THREE.Group();

    // 蘑菇伞盖 (红色带白点)
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.4,
      metalness: 0.1,
    });
    const capGeo = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.7;
    cap.scale.set(1.2, 0.6, 1.2);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);

    // 伞盖底面
    const capBottomGeo = new THREE.CircleGeometry(0.6, 16);
    const capBottom = new THREE.Mesh(capBottomGeo, capMat);
    capBottom.rotation.x = -Math.PI / 2;
    capBottom.position.y = 0.4;
    capBottom.receiveShadow = true;
    group.add(capBottom);

    // 白点装饰
    const spotMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.0,
    });
    const spotGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const spots = [
      [0.3, 0.15, 0.3], [-0.3, 0.15, 0.25], [0.25, 0.15, -0.35],
      [-0.2, 0.15, -0.3], [0.4, 0.15, -0.1], [-0.4, 0.15, 0.1],
      [0, 0.25, 0.4], [0.1, 0.25, -0.45],
    ];
    for (const [x, y, z] of spots) {
      const spot = new THREE.Mesh(spotGeo, spotMat);
      spot.position.set(x, y + 0.7, z);
      spot.scale.set(1, 0.5, 1);
      group.add(spot);
    }

    // 蘑菇柄 (白色)
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      roughness: 0.6,
      metalness: 0.0,
    });
    const stemGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.8, 12);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.0;
    stem.castShadow = true;
    stem.receiveShadow = true;
    group.add(stem);

    // 发光效果
    const glowGeo = new THREE.SphereGeometry(0.8, 16, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6666,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 0.5;
    group.add(glow);
    this.glowMesh = glow;

    group.userData = { mushroom: this };
    return group;
  }

  update(dt) {
    if (!this.active) return false;

    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.active = false;
      return true;
    }

    // 旋转 + 上下浮动
    this.mesh.rotation.y += this.spinSpeed * dt;
    const bob = Math.sin(performance.now() / 1000 * 2.5 + this.bobOffset) * 0.15;
    this.mesh.position.y = this.position.y + bob;

    // 发光脉动
    if (this.glowMesh) {
      const pulse = (Math.sin(performance.now() / 1000 * 3) + 1) * 0.5;
      this.glowMesh.material.opacity = 0.05 + pulse * 0.1;
      this.glowMesh.scale.setScalar(0.9 + pulse * 0.2);
    }

    return false;
  }

  tryCollect(kartPos) {
    if (!this.active || this.collected) return false;
    const dist = kartPos.distanceTo(this.position);
    if (dist < 2.0) {
      this.collected = true;
      this.active = false;
      return true;
    }
    return false;
  }

  dispose() {
    this.mesh.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
    this.scene.remove(this.mesh);
  }
}

/**
 * 香蕉皮类 (P6: 细化版)
 */
class Banana {
  constructor(scene, position, rotation, owner) {
    this.scene = scene;
    this.position = position.clone();
    this.rotation = rotation;
    this.owner = owner;
    this.active = true;
    this.lifetime = ITEM_CONFIG.bananaLifetime;
    this.slipped = new Set();

    this.mesh = this._createMesh();
    this.scene.add(this.mesh);
  }

  _createMesh() {
    const group = new THREE.Group();

    // 香蕉皮主体 (弯曲的月牙形状)
    const bananaCurve = new THREE.CurvePath();
    // 使用简单的弯曲几何体
    const bananaGeo = new THREE.BufferGeometry();
    
    // 手动创建弯曲的香蕉皮形状
    const points = [];
    const width = 0.5;
    const length = 1.3;
    const segments = 16;
    const bend = 0.4; // 弯曲程度

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = (t - 0.5) * Math.PI * bend;
      const x = Math.sin(angle) * length * 0.5;
      const z = (t - 0.5) * length;
      
      // 上下边缘
      points.push(new THREE.Vector3(x - width * 0.5, 0, z));
      points.push(new THREE.Vector3(x + width * 0.5, 0, z));
    }

    // 创建三角形索引
    const vertices = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i < points.length; i += 2) {
      vertices.push(points[i].x, 0.02, points[i].z);
      vertices.push(points[i + 1].x, 0.02, points[i + 1].z);
      uvs.push(i / (points.length - 2), 0);
      uvs.push(i / (points.length - 2), 1);
    }

    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 2, base + 1, base + 3);
    }

    bananaGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    bananaGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bananaGeo.setIndex(indices);
    bananaGeo.computeVertexNormals();

    const bananaMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const bananaMesh = new THREE.Mesh(bananaGeo, bananaMat);
    bananaMesh.receiveShadow = true;
    group.add(bananaMesh);

    // 香蕉皮末端 (蒂)
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.25, 8);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.8,
      metalness: 0.0,
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(
      Math.sin(-Math.PI * bend * 0.5) * length * 0.5,
      0.15,
      -length * 0.5
    );
    stem.rotation.x = Math.PI / 2;
    stem.castShadow = true;
    group.add(stem);

    // 高光条纹
    const highlightGeo = new THREE.PlaneGeometry(length * 0.8, width * 0.15);
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const highlight = new THREE.Mesh(highlightGeo, highlightMat);
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = 0.03;
    group.add(highlight);

    group.userData = { banana: this };
    return group;
  }

  update(dt) {
    if (!this.active) return false;

    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.active = false;
      return true;
    }
    return false;
  }

  trySlip(kartPos, kart) {
    if (!this.active) return false;
    if (this.slipped.has(kart)) return false;

    const dist = kartPos.distanceTo(this.position);
    if (dist < 1.8) {
      this.slipped.add(kart);
      return true;
    }
    return false;
  }

  dispose() {
    this.mesh.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
    this.scene.remove(this.mesh);
  }
}

/**
 * 玩家道具管理器
 */
export class PlayerItemManager {
  constructor(scene, track, kartPhysics, audio, aiItemManager = null, particleSystem = null) {
    this.scene = scene;
    this.track = track;
    this.kartPhysics = kartPhysics;
    this.audio = audio;
    this.aiItemManager = aiItemManager;
    this.particleSystem = particleSystem;
    this.currentItem = ItemType.NONE;
    this.itemBoxes = [];
    this.bananas = [];
    this.mushrooms = []; // 地面上的蘑菇 (AI 拾取用)
    this.mushroomTimer = 0;
    this.slipTimer = 0;
    this.isSlipping = false;

    this._createItemBoxes();
  }

  _createItemBoxes() {
    const count = ITEM_CONFIG.boxCount;
    const trackLength = this.track.getLength();

    for (let i = 0; i < count; i++) {
      const baseT = (i + 0.5) / count;
      const t = (baseT + (Math.random() - 0.5) * 0.08 + 1) % 1;

      const info = this.track.getTrackInfoAt(t);
      const offset = (Math.random() - 0.5) * (ITEM_CONFIG.boxCount * 0.5);
      const pos = info.position.clone().addScaledVector(info.normal, offset);
      pos.y = info.position.y + ITEM_CONFIG.boxHeight; // P19c：跟路面高程

      const rotation = Math.atan2(info.tangent.x, info.tangent.z);
      const box = new ItemBox(this.scene, this.track, pos, rotation);
      this.itemBoxes.push(box);
    }
  }

  update(dt) {
    // 更新道具箱
    for (const box of this.itemBoxes) {
      box.update(dt);
      if (box.active) {
        const item = box.tryCollect(this.kartPhysics.position, this);
        if (item) {
          this._pickupItem(item);
        }
      }
    }

    // 更新地面上的蘑菇
    const mushroomsToRemove = [];
    for (let i = 0; i < this.mushrooms.length; i++) {
      const mushroom = this.mushrooms[i];
      const shouldRemove = mushroom.update(dt);
      if (shouldRemove) {
        mushroomsToRemove.push(i);
        continue;
      }

      // 玩家拾取蘑菇
      if (mushroom.tryCollect(this.kartPhysics.position)) {
        this._pickupItem(ItemType.MUSHROOM);
        mushroomsToRemove.push(i);
      }
    }
    for (let i = mushroomsToRemove.length - 1; i >= 0; i--) {
      const idx = mushroomsToRemove[i];
      this.mushrooms[idx].dispose();
      this.mushrooms.splice(idx, 1);
    }

    // 更新香蕉皮
    const bananasToRemove = [];
    for (let i = 0; i < this.bananas.length; i++) {
      const banana = this.bananas[i];
      const shouldRemove = banana.update(dt);
      if (shouldRemove) {
        bananasToRemove.push(i);
        continue;
      }

      if (banana.owner !== this || banana.lifetime < ITEM_CONFIG.bananaLifetime - 1) {
        if (banana.trySlip(this.kartPhysics.position, this)) {
          this._triggerSlip();
        }
      }
    }

    for (let i = bananasToRemove.length - 1; i >= 0; i--) {
      const idx = bananasToRemove[i];
      this.bananas[idx].dispose();
      this.bananas.splice(idx, 1);
    }

    // 更新蘑菇计时器
    if (this.mushroomTimer > 0) {
      this.mushroomTimer -= dt;
      if (this.mushroomTimer <= 0) {
        this.mushroomTimer = 0;
        this.kartPhysics.maxSpeed = this.kartPhysics.baseMaxSpeed || 35;
      }
    }

    // 更新打滑计时器
    if (this.slipTimer > 0) {
      this.slipTimer -= dt;
      if (this.slipTimer <= 0) {
        this.slipTimer = 0;
        this.isSlipping = false;
      }
    }

    // 更新龟壳
    if (this.shells) {
      const leader = this._findLeader();
      const shellsToRemove = [];
      for (let i = 0; i < this.shells.length; i++) {
        const shell = this.shells[i];
        shell.update(dt, shell.type === 'red' ? leader : null);
        if (!shell.active) {
          shellsToRemove.push(i);
        }
      }
      for (let i = shellsToRemove.length - 1; i >= 0; i--) {
        const idx = shellsToRemove[i];
        this.shells[idx].dispose();
        this.shells.splice(idx, 1);
      }
    }
  }

  _pickupItem(itemType) {
    this.currentItem = itemType;
    this._updateItemHUD();
    if (this.audio && this.audio.playPickup) {
      this.audio.playPickup();
    }
    // 拾取特效
    if (this.particleSystem) {
      this.particleSystem.emitPickup(this.kartPhysics.position.clone(), itemType);
    }
  }

  _updateItemHUD() {
    const el = document.getElementById('currentItem');
    if (el) {
      const names = {
        [ItemType.NONE]: '无',
        [ItemType.MUSHROOM]: '蘑菇',
        [ItemType.BANANA]: '香蕉',
        [ItemType.RED_SHELL]: '红龟壳',
        [ItemType.GREEN_SHELL]: '绿龟壳',
        [ItemType.LIGHTNING]: '闪电',
      };
      const icons = {
        [ItemType.NONE]: 'item-none',
        [ItemType.MUSHROOM]: 'item-mushroom',
        [ItemType.BANANA]: 'item-banana',
        [ItemType.RED_SHELL]: 'item-red-shell',
        [ItemType.GREEN_SHELL]: 'item-green-shell',
        [ItemType.LIGHTNING]: 'item-lightning',
      };
      el.textContent = names[this.currentItem] || '无';
      el.className = 'item-icon ' + (icons[this.currentItem] || 'item-none');
    }
  }

  useItem() {
    if (this.currentItem === ItemType.MUSHROOM) {
      this._useMushroom();
    } else if (this.currentItem === ItemType.BANANA) {
      this._useBanana();
    } else if (this.currentItem === ItemType.RED_SHELL) {
      this._useRedShell();
    } else if (this.currentItem === ItemType.GREEN_SHELL) {
      this._useGreenShell();
    } else if (this.currentItem === ItemType.LIGHTNING) {
      this._useLightning();
    }
    this.currentItem = ItemType.NONE;
    this._updateItemHUD();
  }

  _useMushroom() {
    if (!this.kartPhysics.baseMaxSpeed) {
      this.kartPhysics.baseMaxSpeed = this.kartPhysics.maxSpeed;
    }
    this.kartPhysics.maxSpeed = this.kartPhysics.baseMaxSpeed * ITEM_CONFIG.items.mushroom.boostMultiplier;
    this.mushroomTimer = ITEM_CONFIG.items.mushroom.duration;

    const forward = new THREE.Vector3(
      -Math.sin(this.kartPhysics.rotation),
      0,
      -Math.cos(this.kartPhysics.rotation)
    );
    this.kartPhysics.velocity.addScaledVector(forward, this.kartPhysics.acceleration * 0.5);

    if (this.audio && this.audio.playMushroom) {
      this.audio.playMushroom();
    }
  }

  _useBanana() {
    const behind = new THREE.Vector3(
      Math.sin(this.kartPhysics.rotation),
      0,
      Math.cos(this.kartPhysics.rotation)
    );
    const pos = this.kartPhysics.position.clone().addScaledVector(behind, 2.5);
    pos.y = this.kartPhysics.position.y + 0.05; // P19c：坡上出生贴住路面高程

    const banana = new Banana(this.scene, pos, this.kartPhysics.rotation, this);
    this.bananas.push(banana);
    if (this.aiItemManager) {
      this.aiItemManager.addBanana(banana);
    }

    if (this.audio && this.audio.playBanana) {
      this.audio.playBanana();
    }
  }

  _useRedShell() {
    // 红龟壳：追踪第一名
    const target = this._findLeader();
    const forward = new THREE.Vector3(
      -Math.sin(this.kartPhysics.rotation),
      0,
      -Math.cos(this.kartPhysics.rotation)
    );
    const pos = this.kartPhysics.position.clone().addScaledVector(forward, 2.5);
    pos.y = 0.5;

    const shell = new Shell(this.scene, {
      type: 'red',
      position: pos,
      rotation: this.kartPhysics.rotation,
      speed: ITEM_CONFIG.items.red_shell.speed,
      lifetime: ITEM_CONFIG.items.red_shell.lifetime,
    });
    shell.target = target;
    shell.surfaceFn = (p) => this.track.getSurfaceY(p); // P19c：坡上贴地
    this.shells = this.shells || [];
    this.shells.push(shell);

    if (this.audio && this.audio.playShell) {
      this.audio.playShell();
    }
  }

  _useGreenShell() {
    // 绿龟壳：直线飞行
    const forward = new THREE.Vector3(
      -Math.sin(this.kartPhysics.rotation),
      0,
      -Math.cos(this.kartPhysics.rotation)
    );
    const pos = this.kartPhysics.position.clone().addScaledVector(forward, 2.5);
    pos.y = 0.5;

    const shell = new Shell(this.scene, {
      type: 'green',
      position: pos,
      rotation: this.kartPhysics.rotation,
      speed: ITEM_CONFIG.items.green_shell.speed,
      lifetime: ITEM_CONFIG.items.green_shell.lifetime,
    });
    shell.surfaceFn = (p) => this.track.getSurfaceY(p); // P19c：坡上贴地
    this.shells = this.shells || [];
    this.shells.push(shell);

    if (this.audio && this.audio.playShell) {
      this.audio.playShell();
    }
  }

  _useLightning() {
    // 闪电：全体减速（除了自己）
    if (this.aiItemManager) {
      this.aiItemManager.triggerLightning(this.kartPhysics);
    }
    // 视觉特效
    triggerLightningFlash(0.8);

    if (this.audio && this.audio.playLightning) {
      this.audio.playLightning();
    }
  }

  _findLeader() {
    // 找到排名第一的卡丁车（玩家或 AI）
    let leader = null;
    let bestProgress = -1;
    
    // 检查玩家
    const playerProgress = this.kartPhysics.lap * 10000 + (this.kartPhysics.lastCheckpointIndex + 1);
    if (playerProgress > bestProgress) {
      bestProgress = playerProgress;
      leader = this.kartPhysics;
    }
    
    // 检查 AI
    if (this.aiItemManager && this.aiItemManager.aiKarts) {
      for (const ai of this.aiItemManager.aiKarts) {
        if (ai.finished) continue;
        const aiProgress = ai.lap * 10000 + (ai.lastCheckpointIndex + 1);
        if (aiProgress > bestProgress) {
          bestProgress = aiProgress;
          leader = ai;
        }
      }
    }
    
    return leader;
  }

  _triggerSlip() {
    this.isSlipping = true;
    this.slipTimer = ITEM_CONFIG.items.banana.slipDuration;
    this.kartPhysics.velocity.multiplyScalar(ITEM_CONFIG.bananaSlipForce);

    if (this.audio && this.audio.playSlip) {
      this.audio.playSlip();
    }
    // 打滑特效
    if (this.particleSystem) {
      this.particleSystem.emitSlip(this.kartPhysics.position.clone());
    }
  }

  getIsSlipping() {
    return this.isSlipping;
  }

  getMushroomTime() {
    return this.mushroomTimer;
  }

  /**
   * 道具箱生成蘑菇供 AI 拾取 (简化：直接给 AI 蘑菇效果，不生成实体)
   */
  spawnMushroomForAI() {
    // 由 AI 管理器直接处理蘑菇效果，不需要实体
  }

  reset() {
    this.currentItem = ItemType.NONE;
    this._updateItemHUD();
    this.mushroomTimer = 0;
    this.slipTimer = 0;
    this.isSlipping = false;
    if (this.kartPhysics.baseMaxSpeed) {
      this.kartPhysics.maxSpeed = this.kartPhysics.baseMaxSpeed;
    }

    for (const banana of this.bananas) {
      banana.dispose();
    }
    this.bananas = [];
    if (this.aiItemManager) {
      this.aiItemManager.bananas = [];
    }

    for (const mushroom of this.mushrooms) {
      mushroom.dispose();
    }
    this.mushrooms = [];

    if (this.shells) {
      for (const shell of this.shells) {
        shell.dispose();
      }
      this.shells = [];
    }

    for (const box of this.itemBoxes) {
      box.active = true;
      box.mesh.visible = true;
      box.respawnTimer = 0;
      box.collectedBy = null;
    }
  }

  dispose() {
    for (const box of this.itemBoxes) {
      box.dispose();
    }
    for (const banana of this.bananas) {
      banana.dispose();
    }
    for (const mushroom of this.mushrooms) {
      mushroom.dispose();
    }
    this.itemBoxes = [];
    this.bananas = [];
    this.mushrooms = [];
  }
}

/**
 * AI 道具管理器 (简化：只会用蘑菇加速，红龟壳追踪、绿龟壳直线、闪电)
 */
export class AIItemManager {
  constructor(scene, track, aiKarts, audio, particleSystem = null) {
    this.scene = scene;
    this.track = track;
    this.aiKarts = aiKarts;
    this.audio = audio;
    this.particleSystem = particleSystem;
    this.itemBoxes = [];
    this.bananas = [];
    this.shells = [];
    this.lightningActive = false;
    this.lightningTimer = 0;
    this.aiItemState = new Map();

    for (const ai of this.aiKarts) {
      this.aiItemState.set(ai, {
        mushroomTimer: 0,
        slipTimer: 0,
        isSlipping: false,
        baseMaxSpeed: ai.maxSpeed,
        lightningTimer: 0,
        lightningShrunk: false,
      });
    }
  }

  setItemBoxes(itemBoxes) {
    this.itemBoxes = itemBoxes;
  }

  update(dt) {
    // 更新龟壳
    if (this.shells) {
      const leader = this._findLeader();
      const shellsToRemove = [];
      for (let i = 0; i < this.shells.length; i++) {
        const shell = this.shells[i];
        shell.update(dt, shell.type === 'red' ? leader : null);
        if (!shell.active) {
          shellsToRemove.push(i);
        }
      }
      for (let i = shellsToRemove.length - 1; i >= 0; i--) {
        const idx = shellsToRemove[i];
        this.shells[idx].dispose();
        this.shells.splice(idx, 1);
      }
    }

    // 更新闪电效果
    if (this.lightningActive) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningActive = false;
        // 恢复所有 AI 的大小和速度
        for (const ai of this.aiKarts) {
          if (ai.finished) continue;
          const state = this.aiItemState.get(ai);
          if (state && state.lightningShrunk) {
            ai.scale.set(1, 1, 1);
            ai.maxSpeed = state.baseMaxSpeed;
            state.lightningShrunk = false;
          }
        }
      }
    }

    for (const ai of this.aiKarts) {
      if (ai.finished) continue;
      const state = this.aiItemState.get(ai);
      if (!state) continue;

      // AI 闪电缩小效果
      if (state.lightningTimer > 0) {
        state.lightningTimer -= dt;
        if (state.lightningTimer <= 0) {
          state.lightningTimer = 0;
          if (state.lightningShrunk) {
            ai.scale.set(1, 1, 1);
            ai.maxSpeed = state.baseMaxSpeed;
            state.lightningShrunk = false;
          }
        }
      }

      // AI 拾取道具箱
      for (const box of this.itemBoxes) {
        if (box.active) {
          const item = box.tryCollect(ai.position, ai);
          if (item === ItemType.MUSHROOM) {
            this._aiUseMushroom(ai, state);
            break;
          } else if (item === ItemType.RED_SHELL) {
            this._aiUseRedShell(ai);
            break;
          } else if (item === ItemType.GREEN_SHELL) {
            this._aiUseGreenShell(ai);
            break;
          } else if (item === ItemType.LIGHTNING) {
            this._aiUseLightning();
            break;
          } else if (item === ItemType.BANANA) {
            box.active = true;
            box.mesh.visible = true;
            box.respawnTimer = 0;
          }
        }
      }

      // 更新 AI 的蘑菇效果
      if (state.mushroomTimer > 0) {
        state.mushroomTimer -= dt;
        if (state.mushroomTimer <= 0) {
          state.mushroomTimer = 0;
          if (!state.lightningShrunk) {
            ai.maxSpeed = state.baseMaxSpeed;
          }
        }
      }

      // 更新 AI 打滑状态
      if (state.slipTimer > 0) {
        state.slipTimer -= dt;
        if (state.slipTimer <= 0) {
          state.slipTimer = 0;
          state.isSlipping = false;
        }
      }

      // 检测 AI 碰到香蕉皮
      for (const banana of this.bananas) {
        if (banana.trySlip(ai.position, ai)) {
          this._aiTriggerSlip(ai, state);
        }
      }

      // 检测 AI 碰到龟壳
      if (this.shells) {
        for (const shell of this.shells) {
          if (shell.active && shell.type !== 'green') { // 绿龟壳不追踪，但也会碰撞
            const dist = ai.position.distanceTo(shell.position);
            if (dist < ITEM_CONFIG.shellCollisionRadius) {
              this._aiHitByShell(ai, state);
              shell.active = false;
              shell.mesh.visible = false;
            }
          }
        }
      }
    }

    // 检测玩家碰到 AI 的龟壳（由 PlayerItemManager 处理，这里只处理 AI 碰到玩家的龟壳）
    // 清理过期香蕉
    const bananasToRemove = [];
    for (let i = 0; i < this.bananas.length; i++) {
      if (this.bananas[i].lifetime <= 0) {
        bananasToRemove.push(i);
      }
    }
    for (let i = bananasToRemove.length - 1; i >= 0; i--) {
      const idx = bananasToRemove[i];
      this.bananas[idx].dispose();
      this.bananas.splice(idx, 1);
    }
  }

  _aiUseMushroom(ai, state) {
    ai.maxSpeed = state.baseMaxSpeed * ITEM_CONFIG.items.mushroom.boostMultiplier;
    state.mushroomTimer = ITEM_CONFIG.items.mushroom.duration;

    const forward = new THREE.Vector3(
      -Math.sin(ai.rotation),
      0,
      -Math.cos(ai.rotation)
    );
    ai.velocity.addScaledVector(forward, ai.acceleration * 0.5);

    if (this.audio && this.audio.playMushroom) {
      this.audio.playMushroom();
    }
  }

  _aiTriggerSlip(ai, state) {
    state.isSlipping = true;
    state.slipTimer = ITEM_CONFIG.items.banana.slipDuration;
    ai.velocity.multiplyScalar(ITEM_CONFIG.bananaSlipForce);

    if (this.audio && this.audio.playSlip) {
      this.audio.playSlip();
    }
    // 打滑特效
    if (this.particleSystem) {
      this.particleSystem.emitSlip(ai.position.clone());
    }
  }

  _aiUseRedShell(ai) {
    // AI 使用红龟壳：追踪第一名（通常是玩家）
    const target = this._findLeader();
    if (!target) return;

    const forward = new THREE.Vector3(
      -Math.sin(ai.rotation),
      0,
      -Math.cos(ai.rotation)
    );
    const pos = ai.position.clone().addScaledVector(forward, 2.5);
    pos.y = 0.5;

    const shell = new Shell(this.scene, {
      type: 'red',
      position: pos,
      rotation: ai.rotation,
      speed: ITEM_CONFIG.items.red_shell.speed,
      lifetime: ITEM_CONFIG.items.red_shell.lifetime,
    });
    shell.target = target;
    shell.surfaceFn = (p) => this.track.getSurfaceY(p); // P19c：坡上贴地
    this.shells.push(shell);

    if (this.audio && this.audio.playShell) {
      this.audio.playShell();
    }
  }

  _aiUseGreenShell(ai) {
    // AI 使用绿龟壳：直线飞行
    const forward = new THREE.Vector3(
      -Math.sin(ai.rotation),
      0,
      -Math.cos(ai.rotation)
    );
    const pos = ai.position.clone().addScaledVector(forward, 2.5);
    pos.y = 0.5;

    const shell = new Shell(this.scene, {
      type: 'green',
      position: pos,
      rotation: ai.rotation,
      speed: ITEM_CONFIG.items.green_shell.speed,
      lifetime: ITEM_CONFIG.items.green_shell.lifetime,
    });
    shell.surfaceFn = (p) => this.track.getSurfaceY(p); // P19c：坡上贴地
    this.shells.push(shell);

    if (this.audio && this.audio.playShell) {
      this.audio.playShell();
    }
  }

  _aiUseLightning() {
    // AI 使用闪电：全体减速（除了自己）
    this.lightningActive = true;
    this.lightningTimer = 4.0;
    
    for (const ai of this.aiKarts) {
      if (ai.finished) continue;
      const state = this.aiItemState.get(ai);
      if (!state) continue;
      
      // 缩小 AI 自己（视觉效果）
      ai.scale.set(0.5, 0.5, 0.5);
      state.lightningShrunk = true;
      // 速度减半
      if (state.mushroomTimer > 0) {
        ai.maxSpeed = state.baseMaxSpeed * ITEM_CONFIG.items.mushroom.boostMultiplier * 0.5;
      } else {
        ai.maxSpeed = state.baseMaxSpeed * 0.5;
      }
      state.lightningTimer = 4.0;
    }
    
    // 玩家也会被影响（由 PlayerItemManager.triggerLightning 处理）
    // 这里触发视觉特效
    triggerLightningFlash(0.8);

    if (this.audio && this.audio.playLightning) {
      this.audio.playLightning();
    }
  }

  _aiHitByShell(ai, state) {
    // AI 被龟壳击中
    state.isSlipping = true;
    state.slipTimer = ITEM_CONFIG.shellHitStunDuration;
    ai.velocity.multiplyScalar(ITEM_CONFIG.shellHitSpeedMult);

    if (this.audio && this.audio.playSlip) {
      this.audio.playSlip();
    }
    if (this.particleSystem) {
      this.particleSystem.emitSlip(ai.position.clone());
    }
  }

  _findLeader() {
    // 找到排名第一的卡丁车（玩家或 AI）
    let leader = null;
    let bestProgress = -1;

    // 检查玩家（需要从外部传入 kartPhysics）
    // 这里简化：通常玩家是主要目标
    // 实际游戏中可以通过 aiItemManager.playerKartPhysics 访问
    // 暂时返回目标最近的 AI 或玩家
    
    // 检查 AI
    for (const ai of this.aiKarts) {
      if (ai.finished) continue;
      const aiProgress = ai.lap * 10000 + (ai.lastCheckpointIndex + 1);
      if (aiProgress > bestProgress) {
        bestProgress = aiProgress;
        leader = ai;
      }
    }

    // 玩家通常在第一名，这里返回 null 让调用方处理玩家作为目标
    return leader;
  }

  /**
   * 触发闪电效果（由玩家使用闪电时调用）
   */
  triggerLightning(playerKartPhysics) {
    this.lightningActive = true;
    this.lightningTimer = ITEM_CONFIG.items.lightning.shrinkDuration;

    for (const ai of this.aiKarts) {
      if (ai.finished) continue;
      const state = this.aiItemState.get(ai);
      if (!state) continue;

      // 缩小 AI
      ai.scale.set(0.5, 0.5, 0.5);
      state.lightningShrunk = true;
      // 速度减半
      if (state.mushroomTimer > 0) {
        ai.maxSpeed = state.baseMaxSpeed * ITEM_CONFIG.items.mushroom.boostMultiplier * 0.5;
      } else {
        ai.maxSpeed = state.baseMaxSpeed * 0.5;
      }
      state.lightningTimer = ITEM_CONFIG.items.lightning.shrinkDuration;
    }

    // 视觉特效
    triggerLightningFlash(0.8);

    if (this.audio && this.audio.playLightning) {
      this.audio.playLightning();
    }
  }

  getAIItemState(ai) {
    return this.aiItemState.get(ai);
  }

  addBanana(banana) {
    this.bananas.push(banana);
  }

  reset() {
    for (const ai of this.aiKarts) {
      const state = this.aiItemState.get(ai);
      if (state) {
        state.mushroomTimer = 0;
        state.slipTimer = 0;
        state.isSlipping = false;
        state.lightningTimer = 0;
        state.lightningShrunk = false;
        ai.maxSpeed = state.baseMaxSpeed;
        ai.scale.set(1, 1, 1);
      }
    }

    for (const banana of this.bananas) {
      banana.dispose();
    }
    this.bananas = [];

    if (this.shells) {
      for (const shell of this.shells) {
        shell.dispose();
      }
      this.shells = [];
    }

    this.lightningActive = false;
    this.lightningTimer = 0;
  }

  dispose() {
    for (const banana of this.bananas) {
      banana.dispose();
    }
    this.bananas = [];

    if (this.shells) {
      for (const shell of this.shells) {
        shell.dispose();
      }
      this.shells = [];
    }
  }
}

export { ItemType, ITEM_CONFIG };