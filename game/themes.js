/**
 * P14 主题配色模块：纯数据，零 import、零副作用。
 * 主题对象字段由 track.js / main.js 消费；缺省字段消费端自行兜底。
 * 新增主题 = 在这里加一个条目 + trackdefs.js 里配一条布局。
 */

export const TRACK_THEMES = {
  // 经典草原（现有默认，颜色与 P13 前完全一致，保证零视觉回归）
  classic: {
    name: '经典草原',
    // main.js 场景/灯光/地面
    sceneBg: 0x87ceeb,
    ground: 0x3a5f0b,
    grid: 0x2d4a08,
    hemiSky: 0xffeedd,
    hemiGround: 0x445566,
    hemiIntensity: 1.0,
    sunColor: 0xffffee,
    sunIntensity: 2.0,
    // track.js 赛道元素
    roadColor: 0x444444,
    edgeLine: 0xffffff,
    curbA: '#ffffff',      // 路肩条纹 A（canvas 色串）
    curbB: '#cc0000',      // 路肩条纹 B
    stripeA: 0xffffff,     // 起点线地面条纹 A
    stripeB: 0xff0000,     // 起点线地面条纹 B
    rail: 0xcccccc,
    post: 0x888888,
    arch: 0xffdd00,
    archEmissive: 0x443300,
    trunkColors: [0x3d2a1a, 0x4a2f1a, 0x8b7355],
    crownColors: [0x0d4010, 0x1b5e20, 0x2d5a1a],
    concrete: 0x999999,
    seat: 0xcc0000,
    boostColor: 0x00aaff,
    cloudOpacity: 0.7,
    // 天空盒渐变（offset, css color）
    skyStops: [
      [0, '#001a33'],
      [0.4, '#003d66'],
      [0.6, '#4a90d9'],
      [0.8, '#ff8c42'],
      [1, '#ff6b35'],
    ],
    sunDisc: 'rgba(255, 255, 200, 0.9)',
    sunGlowInner: 'rgba(255, 255, 150, 0.4)',
    sunGlowOuter: 'rgba(255, 200, 100, 0)',
  },

  // 沙漠黄昏
  desert: {
    name: '沙漠黄昏',
    sceneBg: 0xe8b56a,
    ground: 0xd9a95c,
    grid: 0xb8894a,
    hemiSky: 0xffe4bb,
    hemiGround: 0x8a6a3a,
    hemiIntensity: 1.1,
    sunColor: 0xffe0b0,
    sunIntensity: 2.3,
    roadColor: 0x5a5248,        // 暖灰铺装
    edgeLine: 0xfff4d6,
    curbA: '#ffffff',
    curbB: '#e0662a',           // 橙陶土路肩
    stripeA: 0xfff4d6,
    stripeB: 0xd4551f,
    rail: 0xd8c9a8,
    post: 0x9a8560,
    arch: 0xe0782a,
    archEmissive: 0x402008,
    trunkColors: [0x8b7355, 0x7a6248, 0x8b7355],   // 棕榈/仙人掌木
    crownColors: [0x4d7a1a, 0x6a8f2a, 0x3f6a15],   // 绿洲绿
    concrete: 0xc8b48e,
    seat: 0x1f8fa8,             // 绿松石座椅对比
    boostColor: 0x00aaff,
    cloudOpacity: 0.45,
    skyStops: [
      [0, '#3a2a5e'],
      [0.35, '#8a4a6a'],
      [0.6, '#e08a4a'],
      [0.8, '#f7c06a'],
      [1, '#ffe0a0'],
    ],
    sunDisc: 'rgba(255, 235, 180, 0.95)',
    sunGlowInner: 'rgba(255, 210, 120, 0.5)',
    sunGlowOuter: 'rgba(255, 170, 80, 0)',
  },

  // 雪山极地
  snow: {
    name: '雪山极地',
    sceneBg: 0xbcd4e0,
    ground: 0xe8eef2,
    grid: 0xa8c2d2,
    hemiSky: 0xdfeef8,
    hemiGround: 0x6a7a8a,
    hemiIntensity: 1.2,
    sunColor: 0xf0f6ff,
    sunIntensity: 1.8,
    roadColor: 0x3f4650,        // 冷灰柏油
    edgeLine: 0xffffff,
    curbA: '#ffffff',
    curbB: '#1f5fa8',           // 冰蓝路肩
    stripeA: 0xffffff,
    stripeB: 0x2a6fc0,
    rail: 0xdfe6ea,
    post: 0x8a99a4,
    arch: 0x3a8ad0,
    archEmissive: 0x0a2440,
    trunkColors: [0x4a3a2a, 0x5a4a38, 0x6a5a48],
    crownColors: [0x1d4a3a, 0xdfe8ea, 0x2e5a48],   // 雪松/积雪冠
    concrete: 0xb8c2c8,
    seat: 0xcc2222,
    boostColor: 0x00ddff,
    cloudOpacity: 0.85,
    skyStops: [
      [0, '#071228'],
      [0.4, '#1c3a6e'],
      [0.65, '#5a92c0'],
      [0.85, '#a8cce0'],
      [1, '#d8ecf5'],
    ],
    sunDisc: 'rgba(240, 248, 255, 0.9)',
    sunGlowInner: 'rgba(200, 230, 255, 0.4)',
    sunGlowOuter: 'rgba(160, 200, 240, 0)',
  },
};

/** 取主题（未知名字兜底 classic） */
export function getTheme(name) {
  return TRACK_THEMES[name] || TRACK_THEMES.classic;
}
