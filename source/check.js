// 実画面の確認（Chrome headless / CDP）。実行: node source/check.js <出力フォルダ>
// サンプル→まとめて開く（止められたとき・iPhone）→編集（足す・直す・並べ替え・消す・上限）→URLの検証→XSS→
// 今日のメモ（保存・日付の切り替え・30日・2,000字）→別の端末へ移す→壊れた保存→375/880/1000px・ライト/ダーク→外部への通信
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'check-out');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8788, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const refs = []; // ?t= を開いたときの HTTP の Referer ヘッダ（無ければ空）
const srv = http.createServer((q, r) => { if (q.url.indexOf('?t=') >= 0) refs.push(q.url + ' ' + (q.headers.referer || '')); r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
let ng = 0;
const ok = (name, cond, info) => { if (!cond) ng++; console.log((cond ? 'OK ' : 'NG ') + name + (info !== undefined && !cond ? ' ' + JSON.stringify(info) : '')); };
const KEY = 'start-board-v1';
const measure = `(()=>{const out={sw:document.documentElement.scrollWidth,iw:innerWidth,over:[],small:[]};
  document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>innerWidth+0.5)out.over.push(e.tagName+'.'+e.className)});
  document.querySelectorAll('main button, main a.lk, main input[type=text], main input[type=url]').forEach(e=>{if(e.closest('[hidden]'))return;const r=e.getBoundingClientRect();if(r.width&&(r.height<43.5||r.width<43.5))out.small.push((e.textContent||e.type||e.tagName).slice(0,14)+':'+Math.round(r.width)+'x'+Math.round(r.height))});
  out.over=[...new Set(out.over)].slice(0,8);out.small=out.small.slice(0,8);return out})()`;
const btn = t => `[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(t)}&&!x.closest('[hidden]'))`;
const click = t => `(()=>{const b=${btn(t)};if(!b)throw new Error('no button '+${JSON.stringify(t)});b.click();return true})()`;
const clickIn = (sel, t) => `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)}+' button')].find(x=>x.textContent===${JSON.stringify(t)});if(!b)throw new Error('no button '+${JSON.stringify(t)});b.click();return true})()`;
const val = (ph, v, i) => `(()=>{const e=[...document.querySelectorAll('#app input, #app textarea')].filter(x=>x.placeholder===${JSON.stringify(ph)})[${i || 0}];e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input'));return true})()`;
const body = `document.body.innerText`;
const NOW = `SB.now=new Date(2026,10,3,8,5);SBUI.render();`;
const groupsTxt = `[...document.querySelectorAll('.group')].map(g=>g.querySelector('h3').textContent+':'+[...g.querySelectorAll('a.lk .ln')].map(x=>x.textContent).join('/'))`;
const FAKE = n => `window.__opened=[];window.__allow=${n};window.open=function(u){if(window.__opened.length>=window.__allow)return null;return {opener:window,location:{replace:function(x){window.__opened.push(x)}},close:function(){}}};`;
const stored = `JSON.parse(localStorage.getItem('${KEY}')||'null')`;


// 別のタブで式を評価する（DevToolsの一覧からタブを探して、そのタブにつなぐ）
async function evalInTab(prefix, expr, port) {
  const list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + (port || 9441) + '/json', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  const t = list.find(x => x.type === 'page' && x.url.startsWith(prefix));
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  const v = await new Promise(r => { ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id === 1) r(m.result && m.result.result && m.result.result.value); }); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
  ws.close(); return v;
}

(async () => {
  const b = await launch(9441);
  const reqs = [];
  b.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url); });
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  const errs = [];
  b.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description)); });
  const reopen = async (w, hgt, dark) => { await b.send('Page.navigate', { url: 'about:blank' }); await b.sleep(100); await b.open(ORIGIN, w || 375, hgt || 900, 2, (w || 375) < 768, dark ? 'dark' : 'light'); await b.ev(NOW); await b.sleep(120); };

  // 1) 空の画面 375px
  await b.open(ORIGIN, 375, 900, 2, true, 'light'); await b.ev(`localStorage.clear()`); await reopen();
  let m = await b.ev(measure); ok('empty 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('empty 375 targets>=44', !m.small.length, m.small);
  ok('clock text', await b.ev(`document.querySelector('.clock').innerText.replace(/\\s+/g,' ')`) === '2026年11月3日（火） 8:05', await b.ev(`document.querySelector('.clock').innerText`));
  ok('empty has sample + scratch', !!(await b.ev(`!!${btn('サンプルを入れる')}&&!!${btn('空から作る')}`)));
  ok('order 375: clock, memo, groups, past, move', JSON.stringify(await b.ev(`[...document.querySelectorAll('.layout section')].map(s=>({t:s.getBoundingClientRect().top,c:s.className.split(' ').find(c=>c.startsWith('o-'))})).sort((a,b)=>a.t-b.t).map(x=>x.c)`)) === '["o-clock","o-memo","o-groups","o-past","o-move"]');

  // 2) サンプル（Card1）
  await b.ev(click('サンプルを入れる')); await b.sleep(80);
  ok('S1 sample groups', JSON.stringify(await b.ev(groupsTxt)) === JSON.stringify(['毎朝ひらく （5）:Gmail/Googleカレンダー/LINE公式アカウント/Instagram/予約の管理画面', 'お金 （3）:会計ソフト/ネット銀行/請求書', 'つくる （4）:Canva/Googleドライブ/ChatGPT/Claude']), await b.ev(groupsTxt));
  ok('S1 link attrs', await b.ev(`[...document.querySelectorAll('a.lk')].every(a=>a.target==='_blank'&&a.rel==='noopener noreferrer'&&/^https:\\/\\//.test(a.href))`));
  ok('S1 icons initials', (await b.ev(`[...document.querySelectorAll('a.lk .ic')].map(x=>x.textContent).join('')`)) === 'GGLI予会ネ請CGCC');
  ok('S1 saved', (await b.ev(`${stored}.groups.length`)) === 3);
  ok('S1 open-all buttons', JSON.stringify(await b.ev(`[...document.querySelectorAll('.g-head button')].map(x=>x.textContent)`)) === '["まとめて開く（5）","まとめて開く（3）","まとめて開く（4）"]');

  // 3) S4 まとめて開く: 2つ目から止められる → 次を開く
  await b.ev(FAKE(1));
  await b.ev(clickIn('.group:nth-of-type(1)', 'まとめて開く（5）')); await b.sleep(60);
  ok('S4 blocked msg', /ブラウザが2つ目から止めました（1\/5を開きました）/.test(await b.ev(`document.querySelector('.openbox').innerText`)), await b.ev(`document.querySelector('.openbox')&&document.querySelector('.openbox').innerText`));
  ok('S4 next button', !!(await b.ev(`!!${btn('次を開く（2/5 Googleカレンダー）')}`)));
  ok('S4 popup hint', /このページのポップアップを許可すると、次から続けて開けることがあります/.test(await b.ev(`document.querySelector('.openbox').innerText`)));
  m = await b.ev(measure); ok('S4 openbox 375 no overflow', m.sw <= 375 && !m.over.length, m);
  await b.ev(`window.__allow=99`);
  for (let i = 0; i < 4; i++) { await b.ev(`(()=>{const x=[...document.querySelectorAll('.openbox button.primary')][0];x.click()})()`); await b.sleep(30); }
  ok('S4 all opened sequentially', /5つすべて開きました/.test(await b.ev(`document.querySelector('.openbox').innerText`)) && (await b.ev(`window.__opened.length`)) === 5);
  await b.ev(click('閉じる'));
  await b.ev(FAKE(99));
  await b.ev(clickIn('.group:nth-of-type(3)', 'まとめて開く（4）')); await b.sleep(40);
  ok('S4 all at once', /4つすべて開きました/.test(await b.ev(`document.querySelector('.openbox').innerText`)) && (await b.ev(`window.__opened.join()`)) === 'https://www.canva.com/,https://drive.google.com/,https://chatgpt.com/,https://claude.ai/');
  await b.ev(click('閉じる'));
  // 実際のクリック（ユーザー操作つき）で、本物の window.open: 2つ目が止められるか・開いたタブの opener が外れているか・Referer がないか
  await b.ev(`localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[{id:'g1',name:'ここ',links:[{id:'l1',name:'一',url:'${ORIGIN}?t=1'},{id:'l2',name:'二',url:'${ORIGIN}?t=2'},{id:'l3',name:'三',url:'${ORIGIN}?t=3'}]}],memos:{}}))`);
  await reopen();
  const r0 = await b.ev(`(()=>{const x=document.querySelector('.g-head button').getBoundingClientRect();return {x:x.x+x.width/2,y:x.y+x.height/2}})()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r0.x, y: r0.y, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r0.x, y: r0.y, button: 'left', clickCount: 1 });
  await b.sleep(1200);
  const realMsg = await b.ev(`(document.querySelector('.openbox')||{innerText:'なし'}).innerText.split(String.fromCharCode(10))[0]`);
  console.log('   本物の window.open（headless Chrome・クリック1回）:', realMsg);
  ok('S4 real: first opened, second blocked', /ブラウザが2つ目から止めました（1\/3を開きました）/.test(realMsg), realMsg);
  const opened = await evalInTab(ORIGIN + '?t=1', `JSON.stringify({opener:window.opener===null,ref:document.referrer,url:location.href})`);
  ok('S4 real: opened tab has no opener / no referrer', opened && JSON.parse(opened).opener === true && JSON.parse(opened).ref === '', opened);
  // 「次を開く」も本物のクリックで
  const r1 = await b.ev(`(()=>{const x=document.querySelector('.openbox button.primary').getBoundingClientRect();return {x:x.x+x.width/2,y:x.y+x.height/2}})()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r1.x, y: r1.y, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r1.x, y: r1.y, button: 'left', clickCount: 1 });
  await b.sleep(1200);
  const opened2 = await evalInTab(ORIGIN + '?t=2', `String(window.opener===null)`);
  ok('S4 real: next opens the 2nd with no opener', opened2 === 'true' && /2\/3を開きました/.test(await b.ev(`document.querySelector('.openbox').innerText`)), opened2);
  ok('S4 real: no HTTP Referer header', refs.length >= 2 && refs.every(x => / $/.test(x)), refs);
  for (const t of (await b.send('Target.getTargets')).result.targetInfos.filter(t => t.type === 'page' && t.url.indexOf('?t=') >= 0)) await b.send('Target.closeTarget', { targetId: t.targetId });
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(click('サンプルを入れる'));

  // iPhone: 最初から1つずつ
  await b.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
  await reopen();
  await b.ev(FAKE(99));
  await b.ev(clickIn('.group:nth-of-type(1)', 'まとめて開く（5）')); await b.sleep(40);
  ok('S4 iOS one at a time', /iPhone・iPadでは1つずつ開きます（1\/5を開きました）/.test(await b.ev(`document.querySelector('.openbox').innerText`)) && (await b.ev(`window.__opened.length`)) === 1 && !/ポップアップ/.test(await b.ev(`document.querySelector('.openbox').innerText`)));
  ok('S4 iOS next', !!(await b.ev(`!!${btn('次を開く（2/5 Googleカレンダー）')}`)));
  await b.send('Emulation.setUserAgentOverride', { userAgent: '' });

  // 4) 編集
  await reopen();
  await b.ev(click('編集する')); await b.sleep(50);
  m = await b.ev(measure); ok('edit 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('edit 375 targets', !m.small.length, m.small);
  ok('edit: no open-all, has tools', (await b.ev(`document.querySelectorAll('.g-head button').length`)) === 0 && (await b.ev(`document.querySelectorAll('.elinks li').length`)) === 12);
  ok('edit: up disabled at top', await b.ev(`document.querySelector('.group .elinks li .tools button').disabled`));
  // https:// なしで足す → 確認 → 登録
  await b.ev(val('例 Gmail', '新しい道具', 1)); await b.ev(val('例 https://mail.google.com/', 'example.com/new', 1));
  await b.ev(clickIn('.group:nth-of-type(2) .addform', '足す')); await b.sleep(50);
  ok('S3 add without scheme asks', /「https:\/\/example\.com\/new」として登録しますか/.test(await b.ev(`document.querySelector('.ask-box').innerText`)));
  await b.ev(click('この形で登録する')); await b.sleep(50);
  ok('S3 added', (await b.ev(`${stored}.groups[1].links.map(l=>l.name+'='+l.url).join()`)) === '会計ソフト=https://example.com/accounting,ネット銀行=https://example.com/bank,請求書=https://example.com/invoice,新しい道具=https://example.com/new');
  // javascript: は止まる
  await b.ev(val('例 Gmail', 'わるい', 1)); await b.ev(val('例 https://mail.google.com/', 'javascript:alert(1)', 1));
  await b.ev(clickIn('.group:nth-of-type(2) .addform', '足す')); await b.sleep(50);
  ok('S3 javascript rejected', /http または https で始まるアドレスを入れてください/.test(await b.ev(body)) && (await b.ev(`${stored}.groups[1].links.length`)) === 4);
  await b.ev(val('例 Gmail', '', 1)); await b.ev(val('例 https://mail.google.com/', 'https://example.com/x', 1));
  await b.ev(clickIn('.group:nth-of-type(2) .addform', '足す')); await b.sleep(50);
  ok('name required', /リンクの名前を入れてください/.test(await b.ev(body)));
  // 並べ替え（Gmail を下へ）
  await b.ev(`[...document.querySelectorAll('.group')][0].querySelector('.elinks li .tools button:nth-child(2)').click()`); await b.sleep(40);
  ok('S2 move down', (await b.ev(`${stored}.groups[0].links.slice(0,2).map(l=>l.name).join()`)) === 'Googleカレンダー,Gmail');
  // 直す
  await b.ev(`[...document.querySelectorAll('.group')][0].querySelector('.elinks li .tools button:nth-child(3)').click()`); await b.sleep(40);
  await b.ev(`(()=>{const f=document.querySelector('.elinks .addform');const i=f.querySelector('input[type=text]');i.value='カレンダー';i.dispatchEvent(new Event('input'));[...f.querySelectorAll('button')].find(x=>x.textContent==='直す').click()})()`); await b.sleep(40);
  ok('S2 edit link', (await b.ev(`${stored}.groups[0].links[0].name`)) === 'カレンダー');
  // 消す（やめる→消す）
  await b.ev(`[...document.querySelectorAll('.group')][0].querySelector('.elinks li .tools button:nth-child(4)').click()`); await b.sleep(40);
  await b.ev(click('やめる')); ok('S2 delete cancel', (await b.ev(`${stored}.groups[0].links.length`)) === 5);
  await b.ev(`[...document.querySelectorAll('.group')][0].querySelector('.elinks li .tools button:nth-child(4)').click()`); await b.sleep(40);
  await b.ev(`document.querySelector('.ask-box .danger-btn').click()`); await b.sleep(40);
  ok('S2 delete', (await b.ev(`${stored}.groups[0].links.map(l=>l.name).join()`)) === 'Gmail,LINE公式アカウント,Instagram,予約の管理画面');
  // まとまり: 足す・上へ・名前を変える・消す・上限6
  for (const n of ['四つ目', '五つ目', '六つ目']) { await b.ev(val('例 毎朝ひらく', n)); await b.ev(click('まとまりを足す')); await b.sleep(30); }
  ok('S2 groups 6', (await b.ev(`${stored}.groups.length`)) === 6 && /まとまりは6つでいっぱいです/.test(await b.ev(body)));
  await b.ev(`[...document.querySelectorAll('.group')][5].querySelector('.g-tools button:nth-child(1)').click()`); await b.sleep(30);
  ok('S2 group up', (await b.ev(`${stored}.groups.map(g=>g.name).join()`)) === '毎朝ひらく,お金,つくる,四つ目,六つ目,五つ目');
  await b.ev(`[...document.querySelectorAll('.group')][4].querySelector('.g-tools button:nth-child(3)').click()`); await b.sleep(30);
  await b.ev(`(()=>{const i=document.querySelector('.g-tools input');i.value='あ'.repeat(13);[...document.querySelectorAll('.g-tools button')].find(x=>x.textContent==='変える').click()})()`); await b.sleep(30);
  ok('S2 group name 13 rejected', /まとまりの名前は12字までです/.test(await b.ev(body)));
  await b.ev(`(()=>{const i=document.querySelector('.g-tools input');i.value='あ'.repeat(12);[...document.querySelectorAll('.g-tools button')].find(x=>x.textContent==='変える').click()})()`); await b.sleep(30);
  ok('S2 group rename 12', (await b.ev(`${stored}.groups[4].name`)) === 'あ'.repeat(12));
  for (let k = 0; k < 3; k++) { await b.ev(`[...document.querySelectorAll('.group')][3].querySelector('.g-tools .danger-btn').click()`); await b.sleep(30); await b.ev(`document.querySelector('.g-tools .ask-box .danger-btn').click()`); await b.sleep(30); }
  ok('S2 group delete', (await b.ev(`${stored}.groups.map(g=>g.name).join()`)) === '毎朝ひらく,お金,つくる');
  // リンク12個の上限（保存データで11個にして、UIで12個目を足す）
  await b.ev(`(()=>{const s=${stored};s.groups[2].links=Array.from({length:11},(_, i)=>({id:'q'+i,name:'リンク'+(i+1),url:'https://example.com/'+i}));localStorage.setItem('${KEY}',JSON.stringify(s))})()`);
  await reopen(); await b.ev(click('編集する'));
  await b.ev(val('例 Gmail', '十二個目', 2)); await b.ev(val('例 https://mail.google.com/', 'https://example.com/12', 2)); await b.ev(clickIn('.group:nth-of-type(3) .addform', '足す')); await b.sleep(40);
  ok('S2 links 12 then full', (await b.ev(`${stored}.groups[2].links.length`)) === 12 && /このまとまりは12個でいっぱいです/.test(await b.ev(body)));
  await b.ev(click('編集を終える'));

  // 5) XSS
  await b.ev(`(()=>{const s=${stored};s.groups[0].name='<b>x</b>';s.groups[0].links[0].name='"><script>';localStorage.setItem('${KEY}',JSON.stringify(s))})()`);
  await reopen();
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value='<img src=x onerror="window.__x=1">';t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  await reopen();
  ok('S8 xss text only', (await b.ev(`document.querySelectorAll('main img, main script, main b').length`)) === 0 && (await b.ev(`window.__x`)) === undefined && /<b>x<\/b>/.test(await b.ev(body)) && /"><script>/.test(await b.ev(body)));

  // 6) 今日のメモ
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(click('サンプルを入れる'));
  const MEMO = '・10時 体験の方 1名\n・チラシの写真を撮り直す\n・請求書 今週中に3件';
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value=${JSON.stringify(MEMO)};t.dispatchEvent(new Event('input'))})()`);
  ok('S5 typing status', /入力中/.test(await b.ev(`document.querySelector('.o-memo [role=status]').textContent`)));
  await b.sleep(700);
  ok('S5 saved after 0.5s', (await b.ev(`${stored}.memos['2026-11-03']`)) === MEMO && /保存しました 8:05/.test(await b.ev(`document.querySelector('.o-memo [role=status]').textContent`)));
  await reopen();
  ok('S5 reload keeps memo', (await b.ev(`document.getElementById('memo').value`)) === MEMO);
  // 日付が変わる
  await b.ev(`SB.now=new Date(2026,10,4,0,1);SBUI.tick()`); await b.sleep(50);
  ok('S5 new day empty', (await b.ev(`document.getElementById('memo').value`)) === '' && /日付が変わったので、新しい日のメモにしました/.test(await b.ev(body)) && /11\/3（火）/.test(await b.ev(`document.querySelector('.o-past').innerText`)));
  ok('S12 clock rolled', /2026年11月4日（水）/.test(await b.ev(`document.querySelector('.clock').innerText`)));
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value='あたらしい日';t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  ok('S5 new day saved separately', (await b.ev(`JSON.stringify(${stored}.memos)`)) === JSON.stringify({ '2026-11-03': MEMO, '2026-11-04': 'あたらしい日' }));
  // 前の日のメモを開く・消す
  await b.ev(`document.querySelector('.past .pt').click()`); await b.sleep(30);
  ok('S5 past open', (await b.ev(`document.querySelector('.past pre').textContent`)) === MEMO);
  await b.ev(click('この日のメモを消す')); await b.ev(`document.querySelector('.past .ask-box .danger-btn').click()`); await b.sleep(30);
  ok('S5 past delete', !(await b.ev(`'2026-11-03' in ${stored}.memos`)));
  // 2,001字
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value='あ'.repeat(2001);t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  ok('S5 2001 not saved', /2,000字までです/.test(await b.ev(`document.querySelector('.o-memo [role=status]').textContent`)) && (await b.ev(`${stored}.memos['2026-11-04']`)) === 'あたらしい日');
  // 30日の上限
  await b.ev(`(()=>{const s=${stored};s.memos={};for(let i=1;i<=30;i++)s.memos['2026-10-'+String(i).padStart(2,'0')]='m'+i;localStorage.setItem('${KEY}',JSON.stringify(s))})()`);
  await reopen();
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value='きょう';t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  ok('S5 prune notice', /10\/1（木）のメモを消しました/.test(await b.ev(`document.querySelector('.notice').textContent`)) && Object.keys(await b.ev(`${stored}.memos`)).length === 30, await b.ev(`document.querySelector('.notice').textContent`));

  // 7) 別の端末へ移す
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(click('サンプルを入れる'));
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value='残るメモ';t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  await b.ev(click('設定を文字でコピー')); await b.sleep(200);
  const code = await b.ev(`document.querySelector('.o-move textarea[readonly]').value`);
  ok('S6 code shown', /^SB1\.[A-Za-z0-9_-]+\.\d{6}$/.test(code), code.slice(0, 30));
  console.log('   コピーの結果:', await b.ev(`document.querySelector('.o-move .okmsg').textContent`));
  fs.writeFileSync(path.join(OUT, 'move-code.txt'), code);
  // 別の端末のつもりで、リンクを空にしてから読み込む（メモは残す）
  await b.ev(`localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[],memos:{'2026-11-03':'こちらの端末のメモ'}}))`); await reopen();
  await b.ev(val('SB1. で始まる文字を貼る', 'これです\n' + code.slice(0, 40) + '\n' + code.slice(40) + '。'));
  await b.ev(click('読み込む')); await b.sleep(40);
  ok('S6 preview counts', /読み込む中身: まとまり3・リンク12/.test(await b.ev(`document.querySelector('.o-move .ask-box').innerText`)));
  await b.ev(click('入れる')); await b.sleep(60);
  ok('S6 imported', /読み込みました: まとまり3・リンク12/.test(await b.ev(`document.querySelector('.notice').textContent`)) && (await b.ev(`${stored}.groups.length`)) === 3 && (await b.ev(`${stored}.memos['2026-11-03']`)) === 'こちらの端末のメモ');
  m = await b.ev(measure); ok('S6 after import 375 no overflow', m.sw <= 375 && !m.over.length, m);
  await b.ev(`scrollTo(0,0)`); await b.sleep(50);
  await b.shot(path.join(OUT, 'card2-375-import.png'), { x: 0, y: 0, width: 375, height: Math.min(1400, await b.ev(`document.documentElement.scrollHeight`)) });
  // 書き換え・別の版
  const tampered = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
  await b.ev(val('SB1. で始まる文字を貼る', tampered)); await b.ev(click('読み込む')); await b.sleep(30);
  ok('S6 tamper stops', /確かめ用の数字が合いません/.test(await b.ev(body)) && (await b.ev(`${stored}.groups.length`)) === 3);
  await b.ev(val('SB1. で始まる文字を貼る', 'SB2.abc.123456')); await b.ev(click('読み込む')); await b.sleep(30);
  ok('S6 SB2 stops', /SB1 ではありません/.test(await b.ev(body)));
  // 入れ替えの確認（いまの設定あり）
  await b.ev(val('SB1. で始まる文字を貼る', code)); await b.ev(click('読み込む')); await b.sleep(30);
  ok('S6 replace asks', /いまの設定（まとまり3・リンク12）と入れ替えますか/.test(await b.ev(`document.querySelector('.o-move .ask-box').innerText`)));
  await b.ev(click('やめる'));

  // 8) 壊れた保存
  await b.ev(`localStorage.clear();localStorage.setItem('${KEY}','{broken')`); await reopen();
  ok('S9 broken message', /読み取れませんでした/.test(await b.ev(body)) && (await b.ev(`Object.keys(localStorage).some(k=>k.startsWith('${KEY}-backup-')&&localStorage.getItem(k)==='{broken')`)) && !(await b.ev(`!!${btn('サンプルを入れる')}`)));
  ok('S9 original kept', (await b.ev(`localStorage.getItem('${KEY}')`)) === '{broken');
  await b.ev(`localStorage.clear();localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[{id:'g1',name:'a',links:[{id:'l1',name:'x',url:'javascript:alert(1)'},{id:'l2',name:'y',url:'https://example.com/'}]}],memos:{}}))`); await reopen();
  ok('S9 partial message', /一部が読み取れなかった/.test(await b.ev(body)) && (await b.ev(groupsTxt)).join() === 'a （1）:y');
  // 保存できない端末
  await b.ev(`localStorage.clear()`);
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.setItem=function(){throw new Error('quota')}` }).then(async r => {
    await reopen();
    ok('S9 no storage notice', /この端末ではリンクとメモを保存できません/.test(await b.ev(body)));
    await b.ev(click('サンプルを入れる')); await b.sleep(40);
    ok('S9 no storage still works', (await b.ev(`document.querySelectorAll('a.lk').length`)) === 12);
    await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: r.result.identifier });
  });

  // 9) 画面の大きさ・ライト/ダーク・最長の値
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(click('サンプルを入れる'));
  await b.ev(`(()=>{const t=document.getElementById('memo');t.value=${JSON.stringify(MEMO)};t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  for (const [w, dark] of [[375, false], [375, true], [880, false], [1000, false], [1000, true]]) {
    await reopen(w, 1000, dark); m = await b.ev(measure);
    ok(`S11 ${w}px ${dark ? 'dark' : 'light'} no overflow`, m.sw <= w && !m.over.length, m); ok(`S11 ${w}px ${dark ? 'dark' : 'light'} targets`, !m.small.length, m.small);
  }
  await reopen(1000, 1000);
  ok('S11 1000 two columns', await b.ev(`(()=>{const g=document.querySelector('.o-groups').getBoundingClientRect(),c=document.querySelector('.o-clock').getBoundingClientRect();return c.left>g.right&&Math.abs(c.top-g.top)<2})()`));
  ok('S11 1000 three per row', await b.ev(`(()=>{const a=[...document.querySelectorAll('.group:first-of-type a.lk')].slice(0,4).map(x=>Math.round(x.getBoundingClientRect().top));return a[0]===a[1]&&a[1]===a[2]&&a[3]>a[0]})()`));
  await b.shot(path.join(OUT, 'card1-1000.png'), { x: 0, y: 0, width: 1000, height: Math.min(1300, await b.ev(`document.documentElement.scrollHeight`)) });
  // 最長の値
  await b.ev(`(()=>{const s=${stored};s.groups[0].name='あ'.repeat(12);s.groups[0].links=Array.from({length:12},(_, i)=>({id:'w'+i,name:'長'.repeat(16),url:'https://example.com/'+'x'.repeat(300)}));localStorage.setItem('${KEY}',JSON.stringify(s))})()`);
  for (const w of [375, 880]) {
    await reopen(w, 1000); m = await b.ev(measure); ok(`S11 longest ${w} no overflow`, m.sw <= w && !m.over.length, m); ok(`S11 longest ${w} targets`, !m.small.length, m.small);
    await b.ev(FAKE(1)); await b.ev(`document.querySelector('.g-head button').click()`); await b.sleep(30);
    m = await b.ev(measure); ok(`S11 longest ${w} openbox no overflow`, m.sw <= w && !m.over.length, m);
    await b.ev(click('やめる'));
    await b.ev(click('編集する')); await b.sleep(30); m = await b.ev(measure); ok(`S11 longest ${w} edit no overflow`, m.sw <= w && !m.over.length, m);
  }

  // 11) レビュー①の反映
  // 日付が変わってから打った分は前の日に書き足さない
  await b.ev(`localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[],memos:{'2026-11-03':'きのうの分'}}))`); await reopen();
  await b.ev(`SB.now=new Date(2026,10,4,0,2);(()=>{const t=document.getElementById('memo');t.value='きのうの分\\nきょう打った';t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
  ok('R typing after midnight not appended to yesterday', (await b.ev(`JSON.stringify(${stored}.memos)`)) === JSON.stringify({ '2026-11-03': 'きのうの分', '2026-11-04': 'きょう打った' }), await b.ev(`JSON.stringify(${stored}.memos)`));
  // 欄に入ったときに日付を確かめる
  await reopen();
  await b.ev(`SB.now=new Date(2026,10,5,7,0);document.getElementById('memo').dispatchEvent(new FocusEvent('focus'))`); await b.sleep(40);
  ok('R focus checks date', /11\/5（木）/.test(await b.ev(`document.querySelector('.o-memo .sec-h').innerText`)) && (await b.ev(`document.getElementById('memo').value`)) === '');
  // 30日分たまっていたら、消える前に知らせる
  await b.ev(`(()=>{const s={v:1,groups:[],memos:{}};for(let i=1;i<=30;i++)s.memos['2026-10-'+String(i).padStart(2,'0')]='m'+i;localStorage.setItem('${KEY}',JSON.stringify(s))})()`); await reopen();
  ok('R prune warned before', /今日のメモを保存すると、いちばん古い10\/1（木）のメモが消えます/.test(await b.ev(`document.querySelector('.o-memo').innerText`)));
  // 別のタブの変更で読み直す
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(click('サンプルを入れる'));
  const t2 = (await b.send('Target.createTarget', { url: ORIGIN + '?tab=2' })).result.targetId; await b.sleep(800);
  await evalInTab(ORIGIN + '?tab=2', `localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[{id:'gz',name:'別タブ',links:[{id:'lz',name:'追加',url:'https://example.com/z'}]}],memos:{}}));'1'`);
  await b.sleep(300);
  ok('S9 other tab change reloads', (await b.ev(groupsTxt)).join() === '別タブ （1）:追加', await b.ev(groupsTxt));
  await b.send('Target.closeTarget', { targetId: t2 });
  // コピーが使えないとき・共有のキャンセル
  await b.ev(`Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});document.execCommand=()=>false;`);
  await b.ev(click('設定を文字でコピー')); await b.sleep(100);
  ok('S10 no clipboard -> select text', /コピーできませんでした。上の文字を長押しして/.test(await b.ev(`document.querySelector('.o-move .okmsg').textContent`)) && (await b.ev(`document.activeElement===document.querySelector('.o-move textarea[readonly]')`)));
  await b.ev(`navigator.share=()=>Promise.reject(new DOMException('x','AbortError'));SBUI.render()`);
  await b.ev(click('共有')); await b.sleep(100);
  ok('S10 share abort is not an error', (await b.ev(`document.querySelector('.o-move .okmsg').textContent`)) === '');
  await b.ev(`navigator.share=()=>Promise.reject(new DOMException('x','NotAllowedError'));SBUI.render()`);
  await b.ev(click('共有')); await b.sleep(100);
  ok('S10 share failure shows message', /共有できませんでした/.test(await b.ev(`document.querySelector('.o-move .okmsg').textContent`)));
  // 予備に写せないときは、元のデータを上書きしない
  await b.ev(`localStorage.clear();localStorage.setItem('${KEY}','{broken')`);
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).indexOf('-backup-')>=0)throw new Error('quota');return o.call(this,k,v)}})()` }).then(async r => {
    await reopen();
    ok('R backup failed -> notice', /退避することもできませんでした/.test(await b.ev(body)));
    await b.ev(click('空から作る')); await b.ev(val('例 毎朝ひらく', 'テスト')); await b.ev(click('まとまりを足す'));
    await b.ev(`(()=>{const t=document.getElementById('memo');t.value='x';t.dispatchEvent(new Event('input'))})()`); await b.sleep(700);
    ok('R backup failed -> original kept', (await b.ev(`localStorage.getItem('${KEY}')`)) === '{broken');
    await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: r.result.identifier });
  });
  // 計測タグ（本番の計測に検算を混ぜないよう、通信は止めている）
  ok('beacon tag present', (await b.ev(`document.querySelectorAll('script[src*="cloudflareinsights"]').length`)) === 1);

  // 10) 外部への通信・例外
  const ext = reqs.filter(u => !u.startsWith(ORIGIN) && !u.startsWith('about:') && !u.startsWith('data:') && !/cloudflareinsights/.test(u));
  ok('no external requests', ext.length === 0, ext.slice(0, 5));
  ok('no exceptions', errs.length === 0, errs.slice(0, 3));


  // ポップアップを止めない設定のChrome（--disable-popup-blocking）で、本物のクリック1回で3つとも続けて開くか。
  // 本人がポップアップを許可したときの代わりの確認（実際の許可の画面・文言は確かめていない）
  b.close();
  const b2 = await launch(9445, ['--disable-popup-blocking']);
  await b2.open(ORIGIN, 1000, 900, 1, false, 'light');
  await b2.ev(`localStorage.setItem('${KEY}',JSON.stringify({v:1,groups:[{id:'g1',name:'ここ',links:[{id:'l1',name:'一',url:'${ORIGIN}?t=a'},{id:'l2',name:'二',url:'${ORIGIN}?t=b'},{id:'l3',name:'三',url:'${ORIGIN}?t=c'}]}],memos:{}}))`);
  await b2.send('Page.navigate', { url: 'about:blank' }); await b2.sleep(100); await b2.open(ORIGIN, 1000, 900, 1, false, 'light');
  const r2 = await b2.ev(`(()=>{const x=document.querySelector('.g-head button').getBoundingClientRect();return {x:x.x+x.width/2,y:x.y+x.height/2}})()`);
  await b2.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r2.x, y: r2.y, button: 'left', clickCount: 1 });
  await b2.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r2.x, y: r2.y, button: 'left', clickCount: 1 });
  await b2.sleep(1500);
  const msg2 = await b2.ev(`(document.querySelector('.openbox')||{innerText:''}).innerText.split(String.fromCharCode(10))[0]`);
  console.log('   ポップアップを止めないChromeで本物のクリック1回:', msg2);
  const ops = [];
  for (const t of ['a', 'b', 'c']) ops.push(await evalInTab(ORIGIN + '?t=' + t, `String(window.opener===null)`, 9445));
  ok('S4 real (popups allowed): all 3 opened, no opener', /3つすべて開きました/.test(msg2) && ops.join() === 'true,true,true', { msg2, ops });
  b2.close();
  srv.close();
  console.log(ng ? '\nNG ' + ng + '件' : '\nすべてOK');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
