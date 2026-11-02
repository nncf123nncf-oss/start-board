// URLの検証・移す文字・保存データ・メモの検算（node）。実行: node source/core-test.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const m = { exports: {} }; new Function('module', core)(m); const SB = m.exports;
let ng = 0; const ok = (n, c, i) => { if (!c) ng++; console.log((c ? 'OK ' : 'NG ') + n + (i !== undefined && !c ? ' ' + JSON.stringify(i) : '')); };
SB.now = new Date(2026, 10, 3, 8, 5); // 2026-11-03 8:05

// S12: 日付・曜日・時刻
ok('S12 today', SB.today() === '2026-11-03');
ok('S12 dateJa tue', SB.dateJa('2026-11-03') === '2026年11月3日（火）', SB.dateJa('2026-11-03'));
ok('S12 dateJa wed', SB.dateJa('2026-11-04') === '2026年11月4日（水）');
ok('S12 mdJa', SB.mdJa('2026-11-01') === '11/1（日）', SB.mdJa('2026-11-01'));
ok('S12 time', SB.timeText() === '8:05');
ok('S12 bad date', !SB.validDate('2026-02-30') && !SB.validDate('2026-13-01') && SB.validDate('2028-02-29'));

// S3: URLの検証
const U = s => SB.normUrl(s);
ok('S3 https', U('https://mail.google.com/').url === 'https://mail.google.com/');
ok('S3 http', U('http://example.com/a?b=1#c').url === 'http://example.com/a?b=1#c');
ok('S3 trim', U('  https://example.com/x  ').url === 'https://example.com/x');
let r = U('example.com/path');
ok('S3 no scheme -> add', r.added === true && r.url === 'https://example.com/path', r);
r = U('example.com:8080/x');
ok('S3 no scheme with port', r.added === true && r.url === 'https://example.com:8080/x', r);
ok('S3 //host', U('//example.com/').url === 'https://example.com/');
['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'file:///C:/', 'ftp://example.com/', 'mailto:a@example.com', 'tel:0312345678', 'vbscript:x', 'blob:https://example.com/x'].forEach(s => ok('S3 reject ' + s, U(s).error === 'scheme', U(s)));
ok('S3 reject empty', U('').error === 'empty' && U('   ').error === 'empty');
ok('S3 reject space', U('https://exa mple.com/').error === 'space');
ok('S3 reject localhost w/o scheme', U('localhost:3000').error === 'scheme', U('localhost:3000'));
ok('S3 reject word', U('hello').error === 'invalid', U('hello'));
ok('S3 reject cred', U('https://user:pass@example.com/').error === 'cred');
ok('S3 2000 ok', !U('https://example.com/' + 'a'.repeat(2000 - 20)).error, U('https://example.com/' + 'a'.repeat(2000 - 20)));
ok('S3 2001 ng', U('https://example.com/' + 'a'.repeat(2001 - 20)).error === 'long');
ok('S3 invisible stripped', U('\u200bhttps://example.com/').url === 'https://example.com/');
ok('S3 japanese host', /^https:\/\/xn--/.test(U('https://日本.jp/').url || ''), U('https://日本.jp/'));
ok('S3 isCleanUrl', SB.isCleanUrl('https://mail.google.com/') && !SB.isCleanUrl('https://mail.google.com') && !SB.isCleanUrl('javascript:alert(1)'));

// 名前
let errs = [];
ok('name ok', SB.checkName(' Gmail ', 16, 'リンクの名前', errs) === 'Gmail' && !errs.length);
errs = []; SB.checkName('あ'.repeat(16), 16, 'x', errs); ok('name 16 ok', !errs.length);
errs = []; SB.checkName('あ'.repeat(17), 16, 'x', errs); ok('name 17 ng', errs.length === 1);
errs = []; SB.checkName('😀'.repeat(16), 16, 'x', errs); ok('name emoji count by codepoint', !errs.length);
errs = []; SB.checkName('', 16, 'x', errs); ok('name empty ng', errs.length === 1);
ok('clean ctrl', SB.clean('a\tb\nc') === 'a b c');
ok('clean keeps ZWJ', SB.clean('👨‍👩‍👧') === '👨‍👩‍👧');
ok('clean drops RLO', SB.clean('a\u202eb') === 'ab');
ok('initial latin upper', SB.initial('gmail') === 'G');
ok('initial jp', SB.initial('会計ソフト') === '会');
ok('initial emoji grapheme', SB.initial('👨‍👩‍👧家族') === '👨‍👩‍👧', SB.initial('👨‍👩‍👧家族'));

// サンプル（Card1）
const S = SB.sample();
ok('S1 sample shape', S.length === 3 && S.map(g => g.name).join() === '毎朝ひらく,お金,つくる' && S.map(g => g.links.length).join() === '5,3,4');
ok('S1 sample urls clean', S.every(g => g.links.every(l => SB.isCleanUrl(l.url))));
ok('S1 sample names', S[0].links.map(l => l.name).join('/') === 'Gmail/Googleカレンダー/LINE公式アカウント/Instagram/予約の管理画面');
ok('S1 counts', JSON.stringify(SB.counts(S)) === '{"g":3,"l":12}');

// S6: 移す文字
const code = SB.encodeMove(S);
ok('S6 code shape', /^SB1\.[A-Za-z0-9_-]+\.\d{6}$/.test(code), code.slice(0, 40));
ok('S7 code only ascii safe', /^[A-Za-z0-9._-]+$/.test(code));
console.log('   移す文字の長さ', code.length);
let d = SB.decodeMove(code);
ok('S6 roundtrip', d.groups && JSON.stringify(d.groups.map(g => [g.name, g.links.map(l => [l.name, l.url])])) === JSON.stringify(S.map(g => [g.name, g.links.map(l => [l.name, l.url])])), d);
ok('S6 counts', d.counts && d.counts.g === 3 && d.counts.l === 12);
ok('S6 new ids', d.groups[0].id !== S[0].id);
// 日本語・絵文字・ZWJ・全角記号
const G2 = [SB.groupFrom('😀お客さま👨‍👩‍👧', [['Ａ社の共有＃１', 'https://example.com/a?x=%E3%81%82'], ['📷写真', 'http://example.org/']])];
d = SB.decodeMove(SB.encodeMove(G2));
ok('S6 unicode roundtrip', d.groups && d.groups[0].name === '😀お客さま👨‍👩‍👧' && d.groups[0].links[0].name === 'Ａ社の共有＃１', d);
// 前後の文字・改行・空白・全角句点
const wrapped = '移す文字です→ ' + code.slice(0, 30) + '\n' + code.slice(30, 61) + ' \r\n' + code.slice(61) + '。よろしく';
ok('S6 wrapped text', SB.decodeMove(wrapped).counts?.l === 12, SB.decodeMove(wrapped));
ok('S6 fullwidth space', SB.decodeMove('\u3000' + code + '\u3000').counts?.g === 3);
// 1文字書き換え
const body = code.split('.')[1];
const flip = c => c === 'A' ? 'B' : 'A';
const tampered = 'SB1.' + body.slice(0, 10) + flip(body[10]) + body.slice(11) + '.' + code.split('.')[2];
ok('S6 tamper -> checksum', SB.decodeMove(tampered).error === 'checksum', SB.decodeMove(tampered));
ok('S6 tamper digit', SB.decodeMove(code.slice(0, -1) + ((+code.slice(-1) + 1) % 10)).error === 'checksum');
ok('S6 SB2', SB.decodeMove('SB2.abc.123456').error === 'version');
ok('S6 empty', SB.decodeMove('  \n ').error === 'empty');
ok('S6 truncated', !!SB.decodeMove(code.slice(0, 50)).error, SB.decodeMove(code.slice(0, 50)));
ok('S6 truncated no digits', SB.decodeMove(code.split('.').slice(0, 2).join('.')).error === 'broken');
ok('S6 not found', SB.decodeMove('こんにちは').error === 'notfound');
ok('S6 too long', SB.decodeMove('x'.repeat(700000)).error === 'long');
// 中身の検証（確かめ用の数字は正しく付けた偽物）
const mk = arr => { const p = Buffer.from(JSON.stringify(arr), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); return 'SB1.' + p + '.' + SB.checksum(p); };
ok('S6 js url rejected', SB.decodeMove(mk([1, [['x', [['a', 'javascript:alert(1)']]]]])).error === 'content');
ok('S6 unnormalized url rejected', SB.decodeMove(mk([1, [['x', [['a', 'https://example.com']]]]])).error === 'content');
ok('S6 7 groups rejected', SB.decodeMove(mk([1, Array.from({ length: 7 }, (_, i) => ['g' + i, []])])).error === 'content');
ok('S6 6 groups ok', SB.decodeMove(mk([1, Array.from({ length: 6 }, (_, i) => ['g' + i, []])])).counts?.g === 6);
ok('S6 13 links rejected', SB.decodeMove(mk([1, [['x', Array.from({ length: 13 }, (_, i) => ['l' + i, 'https://example.com/' + i])]]])).error === 'content');
ok('S6 12 links ok', SB.decodeMove(mk([1, [['x', Array.from({ length: 12 }, (_, i) => ['l' + i, 'https://example.com/' + i])]]])).counts?.l === 12);
ok('S6 long name rejected', SB.decodeMove(mk([1, [['あ'.repeat(13), []]]])).error === 'content');
ok('S6 html name kept as text', SB.decodeMove(mk([1, [['<img src=x>', [['"><script>', 'https://example.com/']]]]])).groups?.[0].name === '<img src=x>');
ok('S6 wrong version inside', SB.decodeMove(mk([2, [['x', []]]])).error === 'content');
ok('S6 zero groups', SB.decodeMove(mk([1, []])).error === 'content');

// レビュー①の反映
ok('R mail address', U('foo@example.com').error === 'mail', U('foo@example.com'));
ok('R zero width in url', U('https://exa' + String.fromCharCode(0x200b) + 'mple.com/').url === 'https://example.com/');
const flag = String.fromCodePoint(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F);
ok('R flag emoji kept', SB.clean('旗' + flag) === '旗' + flag);
ok('R fullwidth SB1', SB.decodeMove(code.replace('SB1', 'ＳＢ１')).counts?.l === 12, SB.decodeMove(code.replace('SB1', 'ＳＢ１')));
const zw = code.slice(0, 100) + String.fromCharCode(0x200b) + code.slice(100, 300) + String.fromCharCode(0xfeff) + code.slice(300);
ok('R zero width inside code', SB.decodeMove(zw).counts?.l === 12, SB.decodeMove(zw));
const maxUrl = 'https://example.com/' + 'a'.repeat(2000 - 20);
const MAX = Array.from({ length: 6 }, () => SB.groupFrom('あ'.repeat(12), Array.from({ length: 12 }, () => ['い'.repeat(16), maxUrl])));
const maxCode = SB.encodeMove(MAX);
console.log('   上限いっぱいの移す文字の長さ', maxCode.length);
ok('R max code readable', maxCode.length < SB.LIM.code && SB.decodeMove(maxCode).counts?.l === 72, SB.decodeMove(maxCode).error);
ok('S6 ctrl char name rejected', SB.decodeMove(mk([1, [['a\nb', []]]])).error === 'content');
// Day079の崩れ方（目印の翻訳）を想定: 中身に英語の目印が無いので、翻訳されても形が変わらないか
ok('S7 no english words in code beyond SB1', !/\b(name|url|group|link|memo)\b/i.test(code));

// S5: メモ
let st = SB.emptyStore();
let p = SB.putMemo(st, '2026-11-03', '・10時 体験の方 1名\n・チラシの写真を撮り直す');
ok('S5 put', st.memos['2026-11-03'] && p.removed.length === 0);
SB.putMemo(st, '2026-11-03', '   \n ');
ok('S5 blank removes', !('2026-11-03' in st.memos));
p = SB.putMemo(st, '2026-11-03', 'あ'.repeat(2000));
ok('S5 2000 ok', !p.error);
p = SB.putMemo(st, '2026-11-03', 'あ'.repeat(2001));
ok('S5 2001 ng', !!p.error && st.memos['2026-11-03'].length === 2000);
st = SB.emptyStore();
for (let i = 1; i <= 30; i++) st.memos['2026-10-' + String(i).padStart(2, '0')] = 'm' + i;
p = SB.putMemo(st, '2026-11-03', 'today');
ok('S5 prune 31 -> 30', Object.keys(st.memos).length === 30 && p.removed.join() === '2026-10-01' && !st.memos['2026-10-01'], p);
ok('S5 pastDates', SB.pastDates(st, '2026-11-03')[0] === '2026-10-30' && SB.pastDates(st, '2026-11-03').length === 29);
ok('S5 cleanMemo keeps newline', SB.cleanMemo('a\r\nb\tc') === 'a\nb c');

// S9: 保存データの検証
let s = SB.sanitizeStore({ v: 1, groups: S, memos: { '2026-11-03': 'x', 'bad': 'y', '2026-11-02': 5 } });
ok('S9 sanitize keeps good', s.store.groups.length === 3 && s.store.memos['2026-11-03'] === 'x' && s.dropped === 2, s.dropped);
s = SB.sanitizeStore({ groups: [{ id: 'g1', name: 'ok', links: [{ id: 'l1', name: 'a', url: 'javascript:alert(1)' }, { id: 'l2', name: 'b', url: 'https://example.com/' }] }] });
ok('S9 drops bad link', s.store.groups[0].links.length === 1 && s.dropped === 1);
ok('S9 not object', SB.sanitizeStore(null) === null && SB.sanitizeStore({}) === null && SB.sanitizeStore([]) === null);
s = SB.sanitizeStore({ groups: [{ id: 'dup', name: 'a', links: [] }, { id: 'dup', name: 'b', links: [] }] });
ok('S9 dup ids fixed', s.store.groups[0].id !== s.store.groups[1].id);
s = SB.sanitizeStore({ groups: Array.from({ length: 8 }, (_, i) => ({ name: 'g' + i, links: [] })) });
ok('S9 max groups', s.store.groups.length === 6 && s.dropped === 2);

// move
const arr = [1, 2, 3];
ok('move up', SB.move(arr, 1, -1) && arr.join() === '2,1,3');
ok('move edge', !SB.move(arr, 0, -1) && !SB.move(arr, 2, 1));

// S4: iOS の見分け（実在のUA文字列）
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
};
ok('S4 iPhone Safari', SB.isIOS(UA.iphoneSafari, 5));
ok('S4 iPhone Chrome', SB.isIOS(UA.iphoneChrome, 5));
ok('S4 iPad Safari (desktop UA + touch)', SB.isIOS(UA.ipadSafari, 5));
ok('S4 Mac Safari not iOS', !SB.isIOS(UA.macSafari, 0));
ok('S4 Windows Chrome not iOS', !SB.isIOS(UA.winChrome, 0));
ok('S4 Android not iOS', !SB.isIOS(UA.android, 5));

console.log(ng ? '\nNG ' + ng + '件' : '\nすべてOK');
process.exit(ng ? 1 : 0);
