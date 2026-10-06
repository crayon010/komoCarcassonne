// 按牌组定义生成全部 33 种牌面图（72 张牌 = 33 种牌面 + 重复牌共用同图，起始牌与「城+直路」同面）
// 用法: npm run deck （Key 放 .env 的 BIGMODEL_API_KEY）。已存在的文件跳过，删掉单张重跑即可重造那张。
const fs = require('fs');

const KEY = process.env.BIGMODEL_API_KEY;
if (!KEY) { console.error('缺少 BIGMODEL_API_KEY（写进 .env 即可）'); process.exit(1); }

const STYLE = '极简扁平矢量风格棋盘地块插画，俯视正方形，纯色草绿色地面，白色细线网格边框，图形只用简单几何色块加细描边，无纹理无渐变无阴影无透视，背景纯白';
const DIRNAME = { N: '北边', E: '东边', S: '南边', W: '西边' };
const isAdj = (a, b) => (['N', 'E', 'S', 'W'].indexOf(a) + 1) % 4 === ['N', 'E', 'S', 'W'].indexOf(b);

function describe(d) {
  const parts = [];
  for (const seg of d.roads) {
    if (seg.length === 1) parts.push(`一条带浅棕描边的白色圆角粗线条道路，从${DIRNAME[seg[0]]}中央延伸到地块中心截止`);
    else if (seg.length === 2) parts.push(isAdj(...seg) ? `一条带浅棕描边的白色圆角粗线条道路，从${DIRNAME[seg[0]]}中央弯曲通到${DIRNAME[seg[1]]}中央` : `一条带浅棕描边的白色圆角粗线条道路，从${DIRNAME[seg[0]]}中央笔直贯穿到${DIRNAME[seg[1]]}中央`);
    else parts.push(`三条白色圆角道路从${seg.map(s => DIRNAME[s]).join('、')}通到地块中心汇成三岔路口`);
  }
  for (const seg of d.cities) {
    if (seg.length === 1) parts.push(`${DIRNAME[seg[0]]}一个带棕色描边的米黄色圆角城区色块`);
    else if (seg.length === 2) parts.push(isAdj(...seg) ? `带棕色描边的米黄色圆角城区色块占据${DIRNAME[seg[0]]}和${DIRNAME[seg[1]]}的转角` : `带棕色描边的米黄色圆角城区色块纵向贯穿${DIRNAME[seg[0]]}和${DIRNAME[seg[1]]}`);
    else if (seg.length === 3) parts.push(`带棕色描边的米黄色圆角城区色块环绕${seg.map(s => DIRNAME[s]).join('、')}三边`);
    else parts.push('带棕色描边的米黄色城区色块环绕整块地块');
  }
  if (d.cl) parts.push('地块正中央一座粉色屋顶的扁平小庙宇图标');
  if (d.p) parts.push('城区里一枚蓝色小盾牌图标');
  return parts.join('，');
}

(async () => {
  const Carc = (await import('./src/game.mjs')).default;
  const sig = d => d.e.join('') + '|' + JSON.stringify([d.cities, d.roads, d.cl, d.p]);
  const deck = Carc.makeDeck();
  const uniq = [...new Set(deck)]
    .sort((a, b) => sig(a).localeCompare(sig(b)))
    .map(d => ({
      d,
      count: deck.filter(t => t === d).length,
      name: `${d.e.join('')}${d.cl ? 'm' : ''}${d.p ? 'p' : ''}`,
    }));

  const DIR = 'tiles/deck';
  fs.mkdirSync(DIR, { recursive: true });

  for (let i = 0; i < uniq.length; i++) {
    const { d, count, name } = uniq[i];
    const file = `${String(i).padStart(2, '0')}_${name}.png`;
    uniq[i].file = file;
    if (fs.existsSync(`${DIR}/${file}`)) { console.log('跳过（已存在）:', file); continue; }
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'cogview-3-flash', prompt: `${describe(d)}。${STYLE}`, size: '1024x1024' }),
    });
    const body = await res.json().catch(() => ({}));
    const url = body.data?.[0]?.url;
    if (!url) { console.error(`${file} 生成失败:`, body.error?.message || JSON.stringify(body)); continue; }
    const img = await fetch(url);
    fs.writeFileSync(`${DIR}/${file}`, Buffer.from(await img.arrayBuffer()));
    console.log(`ok [${i + 1}/${uniq.length}]:`, file);
  }

  // 牌面总览页：每张图 + 边地形/张数标注
  fs.writeFileSync(`${DIR}/index.html`, `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>牌面总览</title>
<style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;background:#f4f1e8}#g{display:flex;flex-wrap:wrap;gap:1rem}figure{margin:0;text-align:center}img,.empty{width:150px;height:150px;border:3px solid #222;display:block;background:#fff}.empty{line-height:150px;color:#999;border-style:dashed;font-size:.8rem}figcaption{font-size:.75rem;margin-top:.3rem;max-width:150px}p{color:#666}code{background:#e8e4d8;padding:.1rem .4rem}</style></head><body>
<h1>牌面总览（33 种 = 72 张）</h1><p>重新生成某张：删掉对应 png 再跑 <code>npm run deck</code></p><div id="g"></div>
<script>const T = ${JSON.stringify(uniq.map(({ d, file, count }) => ({ e: d.e.join(''), cl: d.cl, p: d.p, file, count })))};
for (const t of T) { const f = document.createElement('figure'); const img = new Image(); img.src = t.file;
img.onerror = () => { const d = document.createElement('div'); d.className = 'empty'; d.textContent = '未生成'; img.replaceWith(d); };
f.append(img, Object.assign(document.createElement('figcaption'), { textContent: '边 ' + t.e + (t.cl ? ' 修道院' : '') + (t.p ? ' 纹章' : '') + ' ×' + t.count })); g.append(f); }</script></body></html>`);
  console.log('完成，总览: /tiles/deck/index.html');
})();
