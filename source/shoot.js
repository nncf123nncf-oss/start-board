// 投稿カード用の素材を撮る（架空の値。2026-11-04 8:05 を今日として撮る）。実行: node source/shoot.js <出力フォルダ>
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8789, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const KEY = 'start-board-v1';
const MEMO = '・10時 体験の方 1名\n・チラシの写真を撮り直す\n・請求書 今週中に3件';
const rect = sel => `(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`;

(async () => {
  const b = await launch(9443);
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  const prep = async (w, hgt) => {
    await b.send('Page.navigate', { url: 'about:blank' }); await b.sleep(100);
    await b.open(ORIGIN, w, hgt, 2, w < 768, 'light');
    await b.ev(`SB.now=new Date(2026,10,4,8,5);SBUI.render()`); await b.sleep(150);
  };
  // サンプル＋今日のメモを入れておく
  await b.open(ORIGIN, 900, 1000, 2, false, 'light');
  await b.ev(`localStorage.clear()`);
  await prep(900, 1000);
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').click()`);
  await b.ev(`SBUI.store.memos['2026-11-04']=${JSON.stringify(MEMO)};localStorage.setItem('${KEY}',JSON.stringify(SBUI.store))`);

  // Card1: 幅900・2列。見出しから、まとまりの欄の下まで
  for (const w of [900, 1000]) {
    await prep(w, 1100);
    const top = await b.ev(rect('h1')), g = await b.ev(rect('.o-groups')), mm = await b.ev(rect('.o-memo'));
    const y0 = Math.max(0, top.y - 12), y1 = Math.max(g.y + g.h, mm.y + mm.h) + 12;
    const clip = { x: 0, y: y0, width: w, height: Math.round(y1 - y0) };
    const file = path.join(OUT, `card1-${w}.png`);
    await b.shot(file, clip);
    console.log('Card1', w, '縦横比', (clip.width / clip.height).toFixed(2), clip);
  }

  // Card2: 別の端末（スマホ幅）で読み込んだ直後。お知らせから「毎朝ひらく」の最後のボタンまで。
  // 375pxでは縦に長すぎる（縦横比0.55）ので、幅600pxでも撮って比べる
  const code = await b.ev(`SB.encodeMove(SBUI.store.groups)`);
  for (const w of [375, 600]) {
    await prep(w, 900);
    await b.ev(`localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[],memos:{}}))`);
    await prep(w, 900);
    await b.ev(`(()=>{const t=[...document.querySelectorAll('textarea')].find(x=>x.placeholder==='SB1. で始まる文字を貼る');t.value=${JSON.stringify(code)};[...document.querySelectorAll('button')].find(x=>x.textContent==='読み込む').click()})()`);
    await b.sleep(50);
    await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='入れる').click()`); await b.sleep(80);
    await b.ev(`scrollTo(0,0)`);
    const n = await b.ev(rect('.notice'));
    const last = await b.ev(`(()=>{const a=[...document.querySelectorAll('.group')][0].querySelectorAll('a.lk');const r=a[a.length-1].getBoundingClientRect();return r.bottom+scrollY})()`);
    const clip2 = { x: 0, y: Math.round(n.y - 12), width: w, height: Math.round(last + 16 - (n.y - 12)) };
    await b.shot(path.join(OUT, `card2-import-${w}.png`), clip2);
    console.log('Card2 読み込み', w, '縦横比', (clip2.width / clip2.height).toFixed(2), clip2);
  }
  // Card2 の代わりの候補: まとめて開くで2つ目を止められ「次を開く」が出たところ（幅600）
  await prep(600, 900);
  await b.ev(`(()=>{window.__n=0;window.open=function(){if(window.__n++>=1)return null;return {opener:window,location:{replace(){}},close(){}}};document.querySelector('.g-head button').click()})()`); await b.sleep(80);
  const g0 = await b.ev(rect('.group'));
  const clip3 = { x: 0, y: Math.round(g0.y), width: 600, height: Math.round(g0.h - 2) };
  await b.shot(path.join(OUT, 'card2-open-600.png'), clip3);
  console.log('Card2 次を開く 600 縦横比', (clip3.width / clip3.height).toFixed(2), clip3);

  b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
