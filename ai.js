import * as THREE from 'three';
import { createKart, CHARACTERS } from './kart.js';

/**
 * AI 对手模块：3 台 AI 卡丁车沿赛车线跑，有速度差异 + 简单 rubber-band
 * P23：模型改用 kart.js 统一角车模型（createKart），三台 AI 分别开
 * 公主/恐龙/酷霸王三辆特征车（替代旧绿/蓝/纯色块车）。
 */

// AI 配置
const AI_CONFIG = {
  count: 3,
  baseMaxSpeed: 30,      // 基础最大速度
  speedVariance: 5,      // 速度差异范围
  acceleration: 35,      // 加速度
  brakeForce: 50,        // 刹车力
  friction: 0.97,        // 摩擦
  turnSpeed: 2.8,        // 转向速度
  // Rubber-band 参数
  rubberBandStrength: 0.15,  // 落后时的额外加速比例
  rubberBandMaxBoost: 1.3,   // 最大橡皮筋加速倍率
  // 赛车线偏移
  racingLineOffset: 0,   // 稍微偏离中心线（可为负或正）
  lookAhead: 8,          // 前瞻距离
  // 检查点同步
  checkpointThreshold: 12,
};


/**
 * AI 控制器类
 */
class AIKart {
  constructor(scene, track, charKey, index, playerKartPhysics) {
    this.scene = scene;
    this.track = track;
    this.playerKartPhysics = playerKartPhysics; // 引用玩家物理，用于 rubber-band
    this.index = index;
    // P23：角色键；P22 小地图圆点用 map 色（酷霸王纯黑车身在地图上改亮灰）
    this.charKey = charKey;
    const ch = CHARACTERS[charKey];
    this.color = ch ? (ch.map ?? ch.body) : 0x33ff33;
    
    // 物理状态
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rotation = 0;
    this.speed = 0;
    this.lap = 0;
    this.lapTimes = [];
    this.currentLapStart = 0;
    this.lastCheckpointIndex = -1;
    this.passedStartLine = false;
    this.finished = false;
    this.totalTime = 0;
    
    // 个性化参数（每辆车略有不同）
    const variance = (Math.random() - 0.5) * 2 * AI_CONFIG.speedVariance;
    this.maxSpeed = AI_CONFIG.baseMaxSpeed + variance;
    this.acceleration = AI_CONFIG.acceleration + (Math.random() - 0.5) * 5;
    this.brakeForce = AI_CONFIG.brakeForce;
    this.friction = AI_CONFIG.friction;
    this.turnSpeed = AI_CONFIG.turnSpeed + (Math.random() - 0.5) * 0.3;
    this.racingLineOffset = (Math.random() - 0.5) * 2; // -1 到 1 的偏移
    
    // 创建模型（P23：复用 kart.js 角色车，含皇冠/背鞍/尖刺壳特征部件）
    this.mesh = createKart(charKey, false);
    this.scene.add(this.mesh);
    
    // 初始位置：起点线后方按赛道方向错开
    this.placeAtStartLine(index);
  }

  /**
   * 更新 AI 逻辑
   * @param {number} dt - 时间增量
   */
  update(dt) {
    if (this.finished) return;
    if (!this.track || !this.position) return;
    
    // 获取当前在赛道上的进度 (t 值 0-1)
    const closest = this.track.getClosestPoint(this.position);
    let targetT = closest.t;
    
    // 前瞻：目标点在前方一定距离
    const lookAheadT = AI_CONFIG.lookAhead / this.track.getLength();
    targetT = (targetT + lookAheadT) % 1;
    
    // 获取目标点信息
    const targetInfo = this.track.getTrackInfoAt(targetT);
    
    // 赛车线：稍微偏离中心线（模拟入弯/出弯）
    // 简单策略：根据曲率调整偏移
    const tangent = targetInfo.tangent;
    const normal = targetInfo.normal;
    
    // 计算目标位置（带偏移的赛车线）
    const targetPos = targetInfo.position.clone().addScaledVector(normal, this.racingLineOffset);
    targetPos.y = 0;
    
    // 计算朝向目标的方向
    const toTarget = targetPos.clone().sub(this.position);
    toTarget.y = 0;
    // P24前置修复：前进方向 = (-sin r, 0, -cos r)，朝目标 (dx,dz) 的 heading
    // 应为 atan2(-dx, -dz)。旧式 atan2(dx,dz) 让 AI 背离前瞻点倒着跑（实测 t 递减）。
    const targetAngle = Math.atan2(-toTarget.x, -toTarget.z);
    
    // 角度差（归一化到 -PI 到 PI）
    let angleDiff = targetAngle - this.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    // 决定转向输入
    let turnInput = 0;
    if (Math.abs(angleDiff) > 0.05) {
      turnInput = angleDiff > 0 ? 1 : -1;
    }
    
    // 根据弯道锐度调整目标速度
    // 采样前方几个点估算曲率
    let curvature = 0;
    const curvatureSamples = 5;
    for (let i = 1; i <= curvatureSamples; i++) {
      const sampleT = (targetT + i * 0.01) % 1;
      const sampleInfo = this.track.getTrackInfoAt(sampleT);
      const angleChange = Math.abs(
        Math.atan2(sampleInfo.tangent.x, sampleInfo.tangent.z) - 
        Math.atan2(tangent.x, tangent.z)
      );
      curvature += angleChange;
    }
    curvature /= curvatureSamples;
    
    // 弯道减速
    const cornerSpeedFactor = THREE.MathUtils.clamp(1 - curvature * 3, 0.4, 1.0);
    let targetSpeed = this.maxSpeed * cornerSpeedFactor;
    
    // Rubber-band：落后于玩家时加速
    const playerProgress = this._getPlayerProgress();
    const myProgress = this.lap + closest.t;
    const progressDiff = playerProgress - myProgress;
    
    if (progressDiff > 0.02) { // 落后超过一点
      const rubberBoost = THREE.MathUtils.clamp(
        progressDiff * AI_CONFIG.rubberBandStrength, 
        0, 
        AI_CONFIG.rubberBandMaxBoost - 1
      );
      targetSpeed *= (1 + rubberBoost);
    } else if (progressDiff < -0.05) { // 领先太多，稍微减速
      targetSpeed *= 0.95;
    }
    
    // 当前速度
    this.speed = this.velocity.length();
    
    // 加速/刹车决定
    let accel = 0;
    if (this.speed < targetSpeed * 0.98) {
      accel = this.acceleration;
    } else if (this.speed > targetSpeed * 1.02) {
      accel = -this.brakeForce * 0.3;
    }
    
    // 前进方向
    const forward = new THREE.Vector3(
      -Math.sin(this.rotation),
      0,
      -Math.cos(this.rotation)
    );
    
    // 施加加速度
    this.velocity.addScaledVector(forward, accel * dt);
    
    // 摩擦
    this.velocity.multiplyScalar(Math.pow(this.friction, dt * 60));
    
    // 限制最大速度
    if (this.speed > this.maxSpeed * 1.2) { // 允许 rubber-band 略微超速
      this.velocity.normalize().multiplyScalar(this.maxSpeed * 1.2);
    }
    
    // 转向
    if (this.speed > 0.5) {
      const speedFactor = THREE.MathUtils.clamp(this.speed / this.maxSpeed, 0.3, 1.0);
      this.rotation += turnInput * this.turnSpeed * speedFactor * dt;
    }
    
    // 位置更新
    this.position.addScaledVector(this.velocity, dt);
    
    // 出界修正（同玩家）
    const onTrack = this.track.isOnTrack(this.position);
    const onRoad = this.track.isOnRoad(this.position);
    
    if (!onTrack) {
      this.velocity.multiplyScalar(0.6);
      const closest = this.track.getClosestPoint(this.position);
      const toCenter = closest.point.clone().sub(this.position);
      toCenter.y = 0;
      if (toCenter.length() > 0.1) {
        toCenter.normalize().multiplyScalar(40 * dt);
        this.velocity.add(toCenter);
      }
    } else if (!onRoad) {
      this.velocity.multiplyScalar(0.9);
    }
    
    // 加速带
    const boostMult = this.track.getBoostMultiplier(this.position);
    if (boostMult > 1.0) {
      this.velocity.multiplyScalar(1 + (boostMult - 1.0) * dt * 3);
    }
    
    // 边界限制
    const bound = 240;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -bound, bound);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -bound, bound);

    // P19c：车身 y 跟随路面高程（缓坡）
    this.position.y = this.track.getSurfaceY(this.position);
    
    // 同步模型
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    
    // 轮子转动 (新结构: wheel.tire 是轮胎网格)
    const wheelRotation = this.speed * dt * 5;
    for (const wheel of this.mesh.userData.wheels) {
      wheel.tire.rotation.x += wheelRotation;
    }
    
    // 更新圈数/检查点
    this._updateCheckpoints();
  }
  
  /**
   * 获取玩家进度（圈数 + 赛道进度 t）
   */
  _getPlayerProgress() {
    if (!this.playerKartPhysics || !this.playerKartPhysics.position) return 0;
    if (!this.track) return 0;
    const closest = this.track.getClosestPoint(this.playerKartPhysics.position);
    return (this.playerKartPhysics.lap || 0) + (closest?.t || 0);
  }
  
  /**
   * 更新检查点和圈数
   */
  _updateCheckpoints() {
    if (!this.track || !this.position) return;
    const pos = this.position;
    
    // 检查点
    if (this.track.checkCheckpoints) {
      const nextCpIndex = this.track.checkCheckpoints(pos, this.lastCheckpointIndex);
      if (nextCpIndex !== -1) {
        this.lastCheckpointIndex = nextCpIndex;
      }
    }
    
    // 起点线
    if (this.track.getStartLineInfo) {
      const startInfo = this.track.getStartLineInfo();
      if (startInfo && startInfo.position && startInfo.normal) {
        const toStart = pos.clone().sub(startInfo.position);
        const distToStart = toStart.length();
        const projected = toStart.dot(startInfo.normal);
        
        const allCheckpointsPassed = this.track.checkpoints && this.lastCheckpointIndex === this.track.checkpoints.length - 1;
        
        if (allCheckpointsPassed && distToStart < 15 && projected > 0 && !this.passedStartLine) {
          const now = performance.now() / 1000;
          const lapTime = now - this.currentLapStart;
          this.lapTimes.push(lapTime);
          this.lap++;
          this.currentLapStart = now;
          this.lastCheckpointIndex = -1;
          this.passedStartLine = true;
          
          if (this.lap >= 3) {
            this.finished = true;
            this.totalTime = this.lapTimes.reduce((a, b) => a + b, 0);
          }
        } else if (distToStart > 20) {
          this.passedStartLine = false;
        }
      }
    }
  }
  
  /**
   * 获取当前进度（用于排序名次）
   */
  getProgress() {
    if (this.finished) return 3 + this.totalTime / 1000; // 完成的排在前面，按总时间
    const closest = this.track.getClosestPoint(this.position);
    return this.lap + closest.t;
  }
  
  /**
   * 获取显示用数据
   */
  getDisplayData() {
    return {
      index: this.index,
      lap: this.lap,
      speed: Math.round(this.speed * 3.6),
      progress: this.getProgress(),
      finished: this.finished,
      totalTime: this.totalTime,
    };
  }
  
  /**
   * 在起点线处放置卡丁车（使用 2×2 错位排布）
   * AI 索引 0,1,2 对应生成位置索引 0,2,3（前左、后左、后右）
   * 玩家占据索引 1（前右）
   */
  placeAtStartLine(index) {
    if (!this.track || !this.track.getSpawnPositions) return;
    
    // AI 3 辆车映射到 2×2 排布的 3 个位置：0=前左, 2=后左, 3=后右
    const aiSpawnIndices = [0, 2, 3];
    const spawnIndex = aiSpawnIndices[index];
    const spawnPositions = this.track.getSpawnPositions();
    const spawn = spawnPositions[spawnIndex];
    
    this.position.copy(spawn.position);
    this.rotation = spawn.rotation;
    this.velocity.set(0, 0, 0);
    this.lastCheckpointIndex = -1;
    this.passedStartLine = false;
    this.lap = 0;
    this.lapTimes = [];
    this.currentLapStart = performance.now() / 1000;
    this.finished = false;
    this.totalTime = 0;
    
    // 同步模型
    if (this.mesh) {
      this.mesh.position.copy(spawn.position);
      this.mesh.rotation.y = spawn.rotation;
    }
  }

  /**
   * 重置（重新开始比赛）
   */
  reset() {
    this.placeAtStartLine(this.index);
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
 * AI 管理器
 */
export class AIManager {
  constructor(scene, track, playerKartPhysics) {
    this.scene = scene;
    this.track = track;
    this.playerKartPhysics = playerKartPhysics;
    this.aiKarts = [];
    this.rankings = [];
    
    // P23：三台 AI 角色车（公主/恐龙/酷霸王）
    const chars = ['peach', 'dino', 'bowser'];
    
    for (let i = 0; i < AI_CONFIG.count; i++) {
      const ai = new AIKart(scene, track, chars[i], i, playerKartPhysics);
      this.aiKarts.push(ai);
    }
    if (typeof window !== 'undefined') window.__ai = this; // DEBUG: 探针读 AI 数据用（同 main.js window.track 先例）
  }
  
  update(dt) {
    this.__gt = (this.__gt || 0) + dt; // DEBUG: 探针用游戏时间累加器
    for (const ai of this.aiKarts) {
      ai.update(dt);
    }
    this._updateRankings();
  }
  
  _updateRankings() {
    // 计算所有参赛者的进度（玩家 + AI）
    const playerLap = this.playerKartPhysics?.lap || 0;
    const playerFinished = this.playerKartPhysics?.finished || false;
    const playerTotalTime = this.playerKartPhysics?.totalTime || 0;
    const all = [
      {
        type: 'player',
        progress: this._getPlayerProgress(),
        lap: playerLap,
        finished: playerFinished,
        totalTime: playerTotalTime,
      }
    ];
    
    for (const ai of this.aiKarts) {
      const data = ai.getDisplayData();
      all.push({
        type: 'ai',
        index: data.index,
        progress: data.progress,
        lap: data.lap,
        finished: data.finished,
        totalTime: data.totalTime,
      });
    }
    
    // 排序：完成比赛的按总时间升序；未完成的按进度降序
    all.sort((a, b) => {
      if (a.finished && b.finished) return a.totalTime - b.totalTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    
    this.rankings = all;
  }
  
  _getPlayerProgress() {
    if (!this.playerKartPhysics || !this.playerKartPhysics.position || !this.track) return 0;
    const closest = this.track.getClosestPoint(this.playerKartPhysics.position);
    return (this.playerKartPhysics.lap || 0) + (closest?.t || 0);
  }
  
  /**
   * 获取玩家名次（1-based）
   */
  getPlayerRank() {
    for (let i = 0; i < this.rankings.length; i++) {
      if (this.rankings[i].type === 'player') {
        return i + 1;
      }
    }
    return 1;
  }
  
  /**
   * 获取所有名次数据（用于 HUD/结算）
   */
  getRankings() {
    return this.rankings.map((r, i) => ({
      rank: i + 1,
      ...r,
    }));
  }
  
  /**
   * 重置所有 AI
   */
  reset() {
    for (const ai of this.aiKarts) {
      ai.reset();
    }
    this.rankings = [];
  }
  
  dispose() {
    for (const ai of this.aiKarts) {
      ai.dispose();
    }
    this.aiKarts = [];
  }
}

export { AI_CONFIG };