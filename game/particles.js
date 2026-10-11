import * as THREE from 'three';

/**
 * 粒子系统模块：轮胎烟雾、加速带粒子、道具拾取特效、打滑特效
 * 使用 InstancedMesh 批量渲染，减少 draw call
 */

// 粒子配置
const PARTICLE_CONFIG = {
  // 轮胎烟雾
  tireSmoke: {
    maxParticles: 200,
    spawnRate: 0.08,
    lifetime: 1.2,
    startSize: 0.6,
    endSize: 2.0,
    startOpacity: 0.6,
    endOpacity: 0.0,
    color: 0xcccccc,
    gravity: -0.5,
    turbulence: 0.8,
  },
  // 加速带粒子
  boost: {
    maxParticles: 150,
    spawnRate: 0.03,
    lifetime: 1.5,
    startSize: 0.4,
    endSize: 1.2,
    startOpacity: 0.8,
    endOpacity: 0.0,
    color: 0x00aaff,
    gravity: -1.2,
    turbulence: 0.5,
  },
  // 蘑菇拾取特效（红/橙）
  pickupMushroom: {
    maxParticles: 80,
    lifetime: 0.8,
    startSize: 0.5,
    endSize: 1.5,
    startOpacity: 1.0,
    endOpacity: 0.0,
    colorStart: 0xff6666,
    colorEnd: 0xffdd00,
    gravity: -2.0,
    turbulence: 1.5,
  },
  // 香蕉拾取特效（黄/金）
  pickupBanana: {
    maxParticles: 80,
    lifetime: 0.8,
    startSize: 0.5,
    endSize: 1.5,
    startOpacity: 1.0,
    endOpacity: 0.0,
    colorStart: 0xffdd00,
    colorEnd: 0xffaa00,
    gravity: -2.0,
    turbulence: 1.5,
  },
  // 打滑特效
  slip: {
    maxParticles: 80,
    lifetime: 0.6,
    startSize: 0.3,
    endSize: 0.8,
    startOpacity: 0.9,
    endOpacity: 0.0,
    color: 0xffff00,
    gravity: 0.5,
    turbulence: 1.0,
  },
};

class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    
    // 粒子池
    this.pools = {
      tireSmoke: this._createSimplePool('tireSmoke', PARTICLE_CONFIG.tireSmoke.maxParticles),
      boost: this._createSimplePool('boost', PARTICLE_CONFIG.boost.maxParticles),
      pickupMushroom: this._createColorPool('pickupMushroom', PARTICLE_CONFIG.pickupMushroom.maxParticles),
      pickupBanana: this._createColorPool('pickupBanana', PARTICLE_CONFIG.pickupBanana.maxParticles),
      slip: this._createSimplePool('slip', PARTICLE_CONFIG.slip.maxParticles),
    };
    
    // 生成计时器
    this.spawnTimers = {
      tireSmoke: 0,
      boost: {},
    };
    
    // 粒子纹理（程序化生成）
    this.particleTexture = this._createParticleTexture();
  }

  /**
   * 创建单色粒子池（InstancedMesh）
   */
  _createSimplePool(name, maxCount) {
    const config = PARTICLE_CONFIG[name];
    
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.particleTexture,
      transparent: true,
      opacity: config.startOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: config.color,
    });
    
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    
    const instances = [];
    for (let i = 0; i < maxCount; i++) {
      instances.push({
        active: false,
        age: 0,
        lifetime: config.lifetime,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: config.startSize,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 2,
        config,
      });
    }
    
    return { mesh, instances, config, dummy: new THREE.Object3D() };
  }

  /**
   * 创建双色渐变粒子池（使用 ShaderMaterial 支持实例化颜色）
   */
  _createColorPool(name, maxCount) {
    const config = PARTICLE_CONFIG[name];
    
    const geo = new THREE.PlaneGeometry(1, 1);
    // 添加实例化颜色属性
    const colorArray = new Float32Array(maxCount * 3);
    const colorAttr = new THREE.InstancedBufferAttribute(colorArray, 3);
    geo.setAttribute('particleColor', colorAttr);
    
    const vertexShader = `
      attribute vec3 particleColor;
      varying vec3 vParticleColor;
      varying vec2 vUv;
      void main() {
        vParticleColor = particleColor;
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    const fragmentShader = `
      uniform sampler2D map;
      varying vec3 vParticleColor;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(map, vUv);
        gl_FragColor = vec4(vParticleColor, tex.a);
      }
    `;
    
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.particleTexture },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = colorAttr;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    
    const instances = [];
    for (let i = 0; i < maxCount; i++) {
      instances.push({
        active: false,
        age: 0,
        lifetime: config.lifetime,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: config.startSize,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 2,
        config,
      });
    }
    
    return { mesh, instances, config, dummy: new THREE.Object3D(), isColorPool: true };
  }

  /**
   * 创建粒子圆形纹理
   */
  _createParticleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * 生成轮胎烟雾
   */
  emitTireSmoke(position, velocity, intensity = 1.0) {
    const pool = this.pools.tireSmoke;
    const config = pool.config;
    const timer = this.spawnTimers.tireSmoke;
    
    if (timer > config.spawnRate / Math.max(0.3, intensity)) {
      this.spawnTimers.tireSmoke = 0;
      
      for (const inst of pool.instances) {
        if (!inst.active) {
          inst.active = true;
          inst.age = 0;
          inst.lifetime = config.lifetime * (0.8 + Math.random() * 0.4);
          
          inst.position.set(
            position.x + (Math.random() - 0.5) * 0.4,
            position.y + 0.05,
            position.z + (Math.random() - 0.5) * 0.4
          );
          
          const speed = velocity.length();
          const backward = velocity.clone().normalize().multiplyScalar(-speed * 0.3);
          inst.velocity.set(
            backward.x + (Math.random() - 0.5) * config.turbulence,
            Math.random() * 1.5 + 0.5,
            backward.z + (Math.random() - 0.5) * config.turbulence
          );
          
          inst.size = config.startSize * (0.7 + Math.random() * 0.6) * intensity;
          inst.rotation = Math.random() * Math.PI * 2;
          inst.rotationSpeed = (Math.random() - 0.5) * 3;
          break;
        }
      }
    }
  }

  /**
   * 生成加速带粒子
   */
  emitBoost(position) {
    const pool = this.pools.boost;
    const config = pool.config;
    
    const key = `${Math.round(position.x)}_${Math.round(position.z)}`;
    if (!this.spawnTimers.boost[key]) this.spawnTimers.boost[key] = 0;
    
    if (this.spawnTimers.boost[key] > config.spawnRate) {
      this.spawnTimers.boost[key] = 0;
      
      for (const inst of pool.instances) {
        if (!inst.active) {
          inst.active = true;
          inst.age = 0;
          inst.lifetime = config.lifetime * (0.7 + Math.random() * 0.6);
          
          inst.position.set(
            position.x + (Math.random() - 0.5) * 3,
            position.y + 0.1,
            position.z + (Math.random() - 0.5) * 3
          );
          
          inst.velocity.set(
            (Math.random() - 0.5) * config.turbulence,
            Math.random() * 3 + 2,
            (Math.random() - 0.5) * config.turbulence
          );
          
          inst.size = config.startSize * (0.8 + Math.random() * 0.4);
          inst.rotation = Math.random() * Math.PI * 2;
          inst.rotationSpeed = (Math.random() - 0.5) * 2;
          break;
        }
      }
    }
  }

  /**
   * 生成道具拾取特效
   * @param {THREE.Vector3} position - 拾取位置
   * @param {string} type - 道具类型 ('mushroom' | 'banana')
   */
  emitPickup(position, type = 'mushroom') {
    const poolName = type === 'banana' ? 'pickupBanana' : 'pickupMushroom';
    const pool = this.pools[poolName];
    const config = pool.config;
    const count = 15 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < count; i++) {
      for (const inst of pool.instances) {
        if (!inst.active) {
          inst.active = true;
          inst.age = 0;
          inst.lifetime = config.lifetime * (0.5 + Math.random() * 0.5);
          
          const angle = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const speed = 3 + Math.random() * 5;
          
          inst.position.set(
            position.x,
            position.y + 1,
            position.z
          );
          
          inst.velocity.set(
            Math.sin(phi) * Math.cos(angle) * speed,
            Math.cos(phi) * speed + 2,
            Math.sin(phi) * Math.sin(angle) * speed
          );
          
          inst.size = config.startSize * (0.6 + Math.random() * 0.8);
          inst.rotation = Math.random() * Math.PI * 2;
          inst.rotationSpeed = (Math.random() - 0.5) * 6;
          break;
        }
      }
    }
  }

  /**
   * 生成打滑特效
   */
  emitSlip(position) {
    const pool = this.pools.slip;
    const config = pool.config;
    const count = 8 + Math.floor(Math.random() * 6);
    
    for (let i = 0; i < count; i++) {
      for (const inst of pool.instances) {
        if (!inst.active) {
          inst.active = true;
          inst.age = 0;
          inst.lifetime = config.lifetime * (0.6 + Math.random() * 0.4);
          
          inst.position.set(
            position.x + (Math.random() - 0.5) * 1.5,
            position.y + 0.2,
            position.z + (Math.random() - 0.5) * 1.5
          );
          
          inst.velocity.set(
            (Math.random() - 0.5) * config.turbulence,
            Math.random() * 1 + 0.5,
            (Math.random() - 0.5) * config.turbulence
          );
          
          inst.size = config.startSize * (0.8 + Math.random() * 0.4);
          inst.rotation = Math.random() * Math.PI * 2;
          inst.rotationSpeed = (Math.random() - 0.5) * 4;
          break;
        }
      }
    }
  }

  /**
   * 更新所有粒子
   */
  update(dt, camera) {
    this.time += dt;
    
    this.spawnTimers.tireSmoke += dt;
    for (const key in this.spawnTimers.boost) {
      this.spawnTimers.boost[key] += dt;
    }
    
    for (const [name, pool] of Object.entries(this.pools)) {
      this._updatePool(pool, dt, camera);
    }
  }

  _updatePool(pool, dt, camera) {
    const { mesh, instances, config, dummy, isColorPool } = pool;
    const matrixArray = mesh.instanceMatrix.array;
    let activeCount = 0;
    
    // 颜色数组（用于双色池）
    const colorArray = isColorPool ? mesh.instanceColor.array : null;
    const colorStart = new THREE.Color(config.colorStart);
    const colorEnd = new THREE.Color(config.colorEnd);
    
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      if (!inst.active) continue;
      
      inst.age += dt;
      if (inst.age >= inst.lifetime) {
        inst.active = false;
        continue;
      }
      
      activeCount++;
      
      inst.velocity.y += config.gravity * dt;
      inst.position.addScaledVector(inst.velocity, dt);
      inst.rotation += inst.rotationSpeed * dt;
      
      const t = inst.age / inst.lifetime;
      
      const size = THREE.MathUtils.lerp(config.startSize, config.endSize, t) * inst.size / config.startSize;
      const opacity = THREE.MathUtils.lerp(config.startOpacity, config.endOpacity, t);
      
      // 更新实例矩阵
      dummy.position.copy(inst.position);
      dummy.rotation.set(0, camera.rotation.y, 0);
      dummy.rotation.z = inst.rotation;
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      
      const offset = i * 16;
      for (let j = 0; j < 16; j++) {
        matrixArray[offset + j] = dummy.matrix.elements[j];
      }
      
      // 更新实例颜色（双色池）
      if (isColorPool && colorArray) {
        const color = new THREE.Color().lerpColors(colorStart, colorEnd, t);
        colorArray[i * 3] = color.r;
        colorArray[i * 3 + 1] = color.g;
        colorArray[i * 3 + 2] = color.b;
      }
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    if (isColorPool) mesh.instanceColor.needsUpdate = true;
    mesh.count = activeCount;
  }

  dispose() {
    for (const [name, pool] of Object.entries(this.pools)) {
      pool.mesh.geometry.dispose();
      pool.mesh.material.dispose();
      if (pool.mesh.material.uniforms?.map?.value) {
        pool.mesh.material.uniforms.map.value.dispose();
      }
      this.scene.remove(pool.mesh);
    }
    this.particleTexture.dispose();
  }
}

export { ParticleSystem, PARTICLE_CONFIG };