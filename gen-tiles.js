// 用 CogView-3-Flash（免费）生成卡卡颂地牌素材，存到 tiles/（项目根，不被 vite build 清空）
// 用法: BIGMODEL_API_KEY=你的key node gen-tiles.js   （PowerShell: 先 $env:BIGMODEL_API_KEY="你的key"）
const fs = require('fs');

const KEY = process.env.BIGMODEL_API_KEY;
if (!KEY) { console.error('缺少 BIGMODEL_API_KEY 环境变量，请到 https://bigmodel.cn 申请 API Key'); process.exit(1); }

// 风格锚点：扁平卡通、粗黑描边、青绿色调（对齐 Murdle 截图风格）
const STYLE = '桌游地图方块插画，扁平卡通风格，俯视图，正方形地块，粗黑描边，青绿色与草绿色配色，色彩简洁明快，边缘干净';
const TILES = {
  grass: '一块纯草地正方形地块，青绿色草地，表面有细小短草纹理，无其他物体',
  road: '正方形草地地块，一条米色砂石小路从底边中央通向地块中心',
  city: '正方形地块，上半是灰色石砖城墙带城垛和一扇木门，下半是草地',
  monastery: '正方形草地地块，正中央一座米色墙壁、灰色屋顶、带小钟楼的修道院教堂',
  river: '正方形河流地块，青绿色水面，浅白色波浪纹理横贯',
};

(async () => {
  fs.mkdirSync('tiles', { recursive: true });
  for (const [name, subject] of Object.entries(TILES)) {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'cogview-3-flash', prompt: `${subject}。${STYLE}`, size: '1024x1024' }),
    });
    const body = await res.json().catch(() => ({}));
    const url = body.data?.[0]?.url;
    if (!url) { console.error(`${name} 生成失败:`, body.error?.message || JSON.stringify(body)); continue; }
    const img = await fetch(url);
    fs.writeFileSync(`tiles/${name}.png`, Buffer.from(await img.arrayBuffer()));
    console.log('ok:', name);
  }
})();
