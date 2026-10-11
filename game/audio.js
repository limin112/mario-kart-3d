// audio.js — WebAudio 程序化音效模块
//
// 用途：为游戏提供全部音效，纯 WebAudio 合成，不依赖任何外部音频文件，
// 也不 import 任何第三方库（本文件零 import）。
//
// API 契约（与 main.js 集成方约定，方法名/签名固定）：
//   new AudioManager()                     构造时不创建 AudioContext（自动播放策略），不抛错
//   unlock()                               首次用户手势时调用：创建并 resume AudioContext；幂等；静默失败
//   setEngine(speedRatio, accelInput, boost)  每帧调用；speedRatio 0~1.3 车速比（可超 1 表示蘑菇超速），accelInput -1|0|1，boost 1=蘑菇加速中；未 unlock 时 no-op
//   stopEngine()                           引擎音量立即归零
//   playCountdownBeep(step)                3/2/1 短促 beep，step 0/1/2 音高递增（缺省 2）
//   playGoBeep()                           GO 长音
//   playPickup()                           道具箱拾取：双音上行
//   playMushroom()                         蘑菇加速：快速上行扫频
//   playBanana()                           扔香蕉：噪声 whoosh
//   playSlip()                             打滑：下行滑音 + 短促警报感
//   playBoostPad()                         加速带：上行 whoosh + 嗖音
//   playRev()                              引擎轰鸣轰油门（开屏动画用），~1.1s 两段式转速扫频
//   toggleMute() / setMuted(m) / isMuted() 静音开关（M 键），返回静音状态
//
// 红线：headless 浏览器里 AudioContext 可能永远 suspended 或创建失败——
// 所有方法在 ctx 为 null / 不可用时必须安全 no-op，绝不 throw、绝不 console.error。

export class AudioManager {
  constructor() {
    this.ctx = null;        // AudioContext，构造时不创建（自动播放策略）
    this.master = null;     // 总音量
    this.engineOsc1 = null; // 引擎主振荡器（sawtooth）
    this.engineOsc2 = null; // 引擎低八度（triangle）
    this.engineFilter = null;
    this.engineGain = null;
    this.unlocked = false;  // 是否已成功 unlock
    this.muted = false;     // M 键静音状态（unlock 前也可设置，unlock 时生效）
    this.baseVolume = 0.5;  // 非静音总音量
  }

  // 首次用户手势时调用：创建并 resume AudioContext。幂等，全程静默失败。
  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // 环境不支持，永久静默
      if (!this.ctx) {
        this.ctx = new AC();
        // 总音量
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.baseVolume;
        this.master.connect(this.ctx.destination);
        // 引擎持续音链路：两个振荡器 → lowpass → engineGain → master
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 800;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.master);

        this.engineOsc1 = this.ctx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc1.frequency.value = 55;
        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc1.start();

        this.engineOsc2 = this.ctx.createOscillator();
        this.engineOsc2.type = 'triangle';
        this.engineOsc2.frequency.value = 27.5; // 低八度
        this.engineOsc2.connect(this.engineFilter);
        this.engineOsc2.start();
      }
      // resume 可能被拒绝（无手势），不 await 失败——catch 掉保持静默
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      // resume 是异步的，state 可能仍是 suspended；只要 ctx 建好即视为可用，
      // 后续方法内部再按 state 做安全判断。
      if (this.ctx.state !== 'closed') this.unlocked = true;
    } catch (e) {
      // 静默失败，绝不打扰游戏主流程
      this.ctx = null;
    }
  }

  // ctx 不可用（未创建 / 已关闭）时所有发声方法都应 no-op。
  // 注意：suspended 状态也允许排程——resume 后事件会照常执行，不报错。
  _ready() {
    return this.unlocked && this.ctx !== null && this.ctx.state !== 'closed';
  }

  // 每帧调用：speedRatio 0~1.3（车速/基础最大车速，>1 为蘑菇超速），accelInput -1|0|1，
  // boost 非 0 表示蘑菇加速中（额外上扬+音量+一点亮度）。
  // 用 setTargetAtTime 平滑改频率/音量，避免 zippering。
  setEngine(speedRatio, accelInput, boost) {
    if (!this._ready()) return;
    try {
      const t = this.ctx.currentTime;
      const r = Math.max(0, Math.min(1.3, speedRatio || 0));
      const accel = accelInput || 0;
      const bs = boost ? 1 : 0;
      // 基频约 55~190Hz（超速可到 ~230Hz），加速时略微上扬（引擎"轰"一下的感觉），
      // 蘑菇加速中再叠一层上扬，听感上"冲"出去
      const freq = 55 + r * 135 + accel * 8 + bs * 22;
      // 音量：静止趋近 0，行驶后随速度上升；留一点底噪感；boost 中略响
      const vol = r <= 0.001 ? 0 : 0.05 + r * 0.18 + bs * 0.05;
      this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(freq / 2, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(400 + r * 1600 + bs * 700, t, 0.08);
      this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    } catch (e) { /* 静默 */ }
  }

  // 引擎音量立即归零（节点保留，下次 setEngine 会重新拉起）
  stopEngine() {
    if (!this._ready()) return;
    try {
      const t = this.ctx.currentTime;
      this.engineGain.gain.cancelScheduledValues(t);
      this.engineGain.gain.setValueAtTime(0, t);
    } catch (e) { /* 静默 */ }
  }

  // 通用：发一个带包络的音调，播完自动断开（不泄漏节点）
  _tone(type, freqStart, freqEnd, duration, volume, delay) {
    if (!this._ready()) return;
    try {
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, t0);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
      }
      // 短 attack/decay 防爆音
      const atk = 0.012;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(volume, t0 + atk);
      g.gain.setValueAtTime(volume, t0 + duration * 0.7);
      g.gain.linearRampToValueAtTime(0, t0 + duration);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
      osc.onended = () => {
        try { osc.disconnect(); g.disconnect(); } catch (e) { /* 静默 */ }
      };
    } catch (e) { /* 静默 */ }
  }

  // 通用：白噪声 + 可选带通滤波，播完自动断开
  _noise(duration, volume, filterType, fStart, fEnd, delay) {
    if (!this._ready()) return;
    try {
      const t0 = this.ctx.currentTime + (delay || 0);
      const sr = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(sr * duration));
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      const atk = Math.min(0.02, duration * 0.15);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(volume, t0 + atk);
      g.gain.linearRampToValueAtTime(0, t0 + duration);
      let node = src;
      if (filterType) {
        const f = this.ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.setValueAtTime(fStart, t0);
        f.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd), t0 + duration);
        f.Q.value = 1.2;
        src.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(this.master);
      src.start(t0);
      src.stop(t0 + duration + 0.02);
      src.onended = () => {
        try { src.disconnect(); node.disconnect(); g.disconnect(); } catch (e) { /* 静默 */ }
      };
    } catch (e) { /* 静默 */ }
  }

  // 3/2/1 短促 beep：方波，音高随倒数递增（step 0="3"→520Hz，1="2"→650Hz，2="1"→780Hz），
  // 最后一步略长一点，向 GO 的 900Hz 长音做阶梯式过渡。
  playCountdownBeep(step) {
    const s = Math.max(0, Math.min(2, Number.isFinite(step) ? step : 2));
    const freq = 520 + s * 130;
    const dur = s === 2 ? 0.16 : 0.12;
    this._tone('square', freq, freq, dur, 0.35, 0);
  }

  // GO 长音：方波 900Hz、0.4s
  playGoBeep() {
    this._tone('square', 900, 900, 0.4, 0.35, 0);
  }

  // 道具箱拾取：双音上行 660 → 880Hz
  playPickup() {
    this._tone('square', 660, 660, 0.09, 0.3, 0);
    this._tone('square', 880, 880, 0.12, 0.3, 0.09);
  }

  // 蘑菇加速：sawtooth 300→1200Hz 快速上行扫频，约 0.35s
  playMushroom() {
    this._tone('sawtooth', 300, 1200, 0.35, 0.28, 0);
  }

  // 扔香蕉：白噪声 whoosh（bandpass 扫频）
  playBanana() {
    this._noise(0.3, 0.4, 'bandpass', 400, 3200, 0);
  }

  // 打滑：800→200Hz 下行滑音 0.4s + 两声短促警报感
  playSlip() {
    this._tone('sawtooth', 800, 200, 0.4, 0.3, 0);
    this._tone('square', 1000, 1000, 0.06, 0.2, 0.05);
    this._tone('square', 800, 800, 0.06, 0.2, 0.15);
  }

  // 加速带：噪声带通上行 whoosh + 三角波上行嗖音，短促有冲感
  playBoostPad() {
    this._noise(0.28, 0.35, 'bandpass', 350, 2800, 0);
    this._tone('triangle', 400, 1400, 0.22, 0.22, 0.02);
  }

  // 引擎轰鸣（开屏动画）：轰两脚油门。sawtooth 主振 + 低八度 triangle，
  // 频率两段式扫频（轰→落→再轰→落），lowpass 随转速开合，外加一层低通噪声
  // 做排气质感。约 1.1s 播完自动断开节点。未 unlock 时安全 no-op。
  playRev() {
    if (!this._ready()) return;
    try {
      const t0 = this.ctx.currentTime;
      const dur = 1.1;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 3;
      const g = this.ctx.createGain();
      // 音量包络：快起、中段维持、尾段收掉
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.06);
      g.gain.setValueAtTime(0.5, t0 + dur * 0.75);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      filter.connect(g);
      g.connect(this.master);
      // 两段轰油门的频率轮廓（Hz）：70 轰到 210 落 110，再轰到 250 落 90
      const profile = (base) => [[0, base], [0.18, base * 3.0], [0.38, base * 1.6], [0.6, base * 3.6], [0.85, base * 1.3], [1, base * 1.1]];
      const oscs = [];
      const layers = [
        { type: 'sawtooth', base: 70 },
        { type: 'triangle', base: 35 },
      ];
      for (const L of layers) {
        const osc = this.ctx.createOscillator();
        osc.type = L.type;
        const pts = profile(L.base);
        osc.frequency.setValueAtTime(pts[0][1], t0);
        for (let i = 1; i < pts.length; i++) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, pts[i][1]), t0 + pts[i][0] * dur * 0.9);
        }
        osc.connect(filter);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
        oscs.push(osc);
      }
      // 滤波随转速开合（用同一轮廓的近似：三段扫）
      filter.frequency.setValueAtTime(350, t0);
      filter.frequency.exponentialRampToValueAtTime(2400, t0 + 0.2 * dur);
      filter.frequency.exponentialRampToValueAtTime(900, t0 + 0.42 * dur);
      filter.frequency.exponentialRampToValueAtTime(2800, t0 + 0.62 * dur);
      filter.frequency.exponentialRampToValueAtTime(500, t0 + dur * 0.9);
      // 排气噪声层：低通白噪声垫在底下
      this._noise(dur * 0.9, 0.12, 'lowpass', 900, 300, 0);
      let done = 0;
      oscs[0].onended = () => {
        if (++done < oscs.length) return;
        try { oscs.forEach(o => o.disconnect()); filter.disconnect(); g.disconnect(); } catch (e) { /* 静默 */ }
      };
    } catch (e) { /* 静默 */ }
  }

  // 静音开关：切换主音量（0 ↔ baseVolume），返回切换后的静音状态。
  // unlock 之前也可以调用——只记录状态，unlock 时随 master.gain 生效。
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(m) {
    this.muted = !!m;
    if (!this._ready()) return; // 未 unlock：状态已记录，无节点可调
    try {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.baseVolume, t, 0.02);
    } catch (e) { /* 静默 */ }
  }
}
