import * as THREE from 'three';

/**
 * P15 道具加深 —— 弹体模块
 *
 * Shell：红龟壳（追踪弹）/ 绿龟壳（直线弹）
 * triggerLightningFlash：全屏白色闪电闪光
 *
 * 约定（与 kart 一致）：前进方向 = (-sin(rotation), 0, -cos(rotation))
 * 命中判定由调用方每帧读 shell.position 自行处理，本类只管飞。
 */

const SHELL_Y = 0.35;        // 飞行贴地高度
const ROLL_RADIUS = 1.0;     // 滚动观感用的虚拟半径
const RED_TURN_RATE = 3.5;   // 红龟壳偏航限速 rad/s

function normalizeAngle(a) {
  // 归一化到 -PI..PI
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class Shell {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts { type: 'red'|'green', position: THREE.Vector3,
   *                        rotation: number, speed: number, lifetime: number }
   */
  constructor(scene, opts) {
    this.type = opts.type === 'green' ? 'green' : 'red';
    this.position = opts.position.clone();
    this.position.y = SHELL_Y; // 弹体贴地飞行
    this.rotation = opts.rotation;
    this.speed = opts.speed;
    this.lifetime = opts.lifetime;

    this.radius = 1.6;   // 碰撞半径（外部读）
    this.active = true;
    this._disposed = false;
    this._rollAngle = 0;

    this.scene = scene;
    this.mesh = this._buildMesh();
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    scene.add(this.mesh);
  }

  _buildMesh() {
    const group = new THREE.Group();

    const shellColor = this.type === 'red' ? 0xdd2222 : 0x33cc44;
    const bellyColor = this.type === 'red' ? 0x551111 : 0x115522;

    // 1) 龟壳主体：压扁的球壳
    const bodyGeo = new THREE.SphereGeometry(1.2, 10, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: shellColor,
      roughness: 0.6,
      flatShading: true
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 0.7, 1);
    group.add(body);

    // 2) 深色腹面：压扁的圆盘/半球底
    const bellyGeo = new THREE.CylinderGeometry(1.05, 0.9, 0.3, 10);
    const bellyMat = new THREE.MeshStandardMaterial({
      color: bellyColor,
      roughness: 0.8,
      flatShading: true
    });
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.y = -0.55;
    group.add(belly);

    // 3) 顶部小凸点
    const knobGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const knobMat = new THREE.MeshStandardMaterial({
      color: bellyColor,
      roughness: 0.7,
      flatShading: true
    });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.y = 0.85;
    group.add(knob);

    // 外层 group 负责朝向（rotation.y = heading），
    // 内层 roll 组负责绕前进轴（局部 X）滚动。
    const roll = new THREE.Group();
    roll.add(group);
    this._rollGroup = roll;
    return roll;
  }

  /**
   * @param {number} dt 秒
   * @param {{position: THREE.Vector3}|null} target 红龟壳追踪目标
   */
  update(dt, target = null) {
    if (!this.active || this._disposed) return;

    // 红龟壳：朝目标平滑转向（偏航限速 RED_TURN_RATE rad/s）
    if (this.type === 'red' && target && target.position) {
      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      // 前进方向 = (-sin r, 0, -cos r) => r = atan2(-dx, -dz)
      const targetHeading = Math.atan2(-dx, -dz);
      const diff = normalizeAngle(targetHeading - this.rotation);
      const maxTurn = RED_TURN_RATE * dt;
      this.rotation += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
    // 绿龟壳 / 红龟壳无 target：直线飞

    // 前进
    this.position.x += -Math.sin(this.rotation) * this.speed * dt;
    this.position.z += -Math.cos(this.rotation) * this.speed * dt;
    this.position.y = SHELL_Y;

    // 寿命
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.active = false;
      this.mesh.visible = false;
    }

    // 同步 mesh：朝向 + 位置 + 绕前进轴滚动
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this._rollAngle -= (this.speed * dt) / ROLL_RADIUS; // 向前滚
    this._rollGroup.rotation.x = this._rollAngle;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.active = false;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.mesh = null;
    }
  }
}

/**
 * 全屏白色闪电闪光：白 -> 透明淡出约 duration 秒后移除。
 * 重复调用互不干扰；document 不可用时静默返回。
 */
export function triggerLightningFlash(duration = 0.8) {
  if (typeof document === 'undefined' || !document || !document.body) return;

  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.inset = '0';
  div.style.pointerEvents = 'none';
  div.style.zIndex = '9999';
  div.style.background = '#ffffff';
  div.style.opacity = '1';
  div.style.transition = 'opacity ' + duration + 's linear';
  document.body.appendChild(div);

  // 下一帧再置 0，确保 transition 生效
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      div.style.opacity = '0';
    });
  });

  setTimeout(() => {
    if (div.parentNode) div.parentNode.removeChild(div);
  }, duration * 1000 + 50);
}
