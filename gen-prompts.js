// 按牌组定义生成 33 张牌面的「4×4 网格规范」提示词，输出 tiles/prompts.md
// 用法: node gen-prompts.js。边型分类与 game.mjs 的 TYPE_DEFS 一一对应，改牌表重跑即可。
const fs = require('fs');

const D = { N: '北', E: '东', S: '南', W: '西' };
const isAdj = (a, b) => (['N', 'E', 'S', 'W'].indexOf(a) + 1) % 4 === ['N', 'E', 'S', 'W'].indexOf(b);
const HEAD = '极简扁平矢量桌游地块：正方形俯视，纯草绿色底，白色细线网格边框，色块只用几何形状加棕色细描边，道路为1格宽白色圆角条带加浅棕描边，无纹理无渐变无透视无文字，纯白背景。';

function citySpec(seg) {
  const a = D[seg[0]], b = D[seg[1] ?? seg[0]];
  if (seg.length === 1) return `${a}边缘一个梯形城区：底边贴${a}边居中宽2格，向内收窄到1格，深2格，面积3/16`;
  if (seg.length === 2) return isAdj(...seg)
    ? `${a}${b}转角一个直角等腰三角形城区：两条直角边分别贴满${a}边和${b}边，斜边连接两边远端，面积8/16（恰好一半）`
    : `城区为${a}${b}向贯穿带：两端各贴一个2格宽梯形并在地块中部连通，面积6/16`;
  if (seg.length === 3) return `城区为贴${seg.map(s => D[s]).join('、')}三边的U形色带：每段2格宽，面积9/16`;
  return `城区为环绕地块四周的环形色带：外缘贴满四条边，面积12/16`;
}
function roadSpec(seg) {
  const a = D[seg[0]], b = D[seg[1] ?? seg[0]];
  if (seg.length === 1) return `一条道路从${a}边中点延伸到地块中心截止（尽头路）`;
  if (seg.length === 2) return isAdj(...seg)
    ? `一条道路从${a}边中点经四分之一圆弧弯到${b}边中点`
    : `一条道路从${a}边中点笔直贯通到${b}边中点`;
  if (seg.length === 3) return `三条道路分别从${seg.map(s => D[s]).join('、')}三边中点汇聚到地块中心（三岔口）`;
  return `四条道路分别从四边中点汇聚到地块中心（十字口）`;
}

(async () => {
  const Carc = (await import('./src/game.mjs')).default;
  const sig = d => d.e.join('') + '|' + JSON.stringify([d.cities, d.roads, d.cl, d.p]);
  const deck = Carc.makeDeck();
  const uniq = [...new Set(deck)]
    .sort((a, b) => sig(a).localeCompare(sig(b)))
    .map(d => ({ d, count: deck.filter(t => t === d).length }));

  const byEdge = new Map();
  for (const u of uniq) {
    if (!byEdge.has(u.d.e.join(''))) byEdge.set(u.d.e.join(''), []);
    byEdge.get(u.d.e.join('')).push(u);
  }

  let md = `# 卡卡颂牌面提示词（4×4 网格规范）\n\n> 规范：地块 = 4×4 = 16 格；边中点 = 北(2,0)、东(4,2)、南(2,4)、西(0,2)。\n> 城区：单边梯形 3/16 · 转角三角 8/16 · 对边贯穿带 6/16 · 三边U形 9/16 · 全环 12/16。\n> 道路：1 格宽白色圆角条带，连接相应边中点。修道院：中心 2×2 图标。纹章：1×1 蓝盾。\n> 每条提示词 = 通用风格头 + 几何句。72 张牌 = 33 种牌面（重复牌共用同图），起始牌与「城+直路」同面。\n`;

  let i = 0;
  for (const [edge, list] of byEdge) {
    md += `\n## 边型 ${edge}（共 ${list.reduce((n, u) => n + u.count, 0)} 张）\n`;
    for (const { d, count } of list) {
      const parts = [...d.cities.map(citySpec), ...d.roads.map(roadSpec)];
      if (d.cl) parts.push('地块正中央一个2×2格粉色屋顶小庙宇图标（面积4/16）');
      if (d.p) parts.push('城区内一枚1×1格蓝色小盾牌图标');
      md += `\n### ${++i}. ${edge}${d.cl ? '+修道院' : ''}${d.p ? '+纹章' : ''}（×${count}）\n\n\`\`\`\n${HEAD}${parts.join('；')}。\n\`\`\`\n`;
    }
  }
  fs.writeFileSync('tiles/prompts.md', md);
  console.log(`ok: ${i} 条提示词 → tiles/prompts.md`);
})();
