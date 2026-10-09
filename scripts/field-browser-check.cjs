const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'retail-flow-field-test-'));
const profile = path.join(artifacts, 'chrome');
fs.mkdirSync(profile);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const root = path.join(artifacts, 'configured');
const unconfiguredRoot = path.join(artifacts, 'unconfigured');
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
let baseUrl;
let saveMode = 'success';
let saveDelay = 0;
let failSummary = false;
let layoutSaveMode = 'success';
let layoutSaveDelay = 0;
let failLayouts = false;
let failAnalysis = false;
let analysisDelay = 0;
const requests = [];
const authRequests = [];
const storeA = '00000000-0000-4000-8000-000000000001';
const storeB = '00000000-0000-4000-8000-000000000002';
const userA = '10000000-0000-4000-8000-000000000001';
const userB = '10000000-0000-4000-8000-000000000002';
const userUnassigned = '10000000-0000-4000-8000-000000000003';
const sessions = new Map();
const refreshTokens = new Map();
function authUser(id) {
  return { id, aud: 'authenticated', role: 'authenticated', email: id === userA ? 'a@example.test' : id === userB ? 'b@example.test' : 'unassigned@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() };
}
function newSession(id) {
  const user = authUser(id);
  const payload = { sub: id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000) + 3600, iat: Math.floor(Date.now()/1000), jti: crypto.randomUUID() };
  const session = { access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.test-only-signature', refresh_token: crypto.randomUUID(), token_type: 'bearer', expires_in: 3600, user };
  sessions.set(session.access_token, session);
  refreshTokens.set(session.refresh_token, id);
  return session;
}
async function queryAs(id, query, args = []) {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
    return tx.query(query, args);
  });
}
const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = requestUrl.pathname;
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const currentSession = sessions.get(token);
  if (pathname.startsWith('/auth/v1/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Supabase-Api-Version', '2024-01-01');
    authRequests.push({ pathname, method: req.method });
    let body = '';
    for await (const chunk of req) body += chunk;
    const args = body ? JSON.parse(body) : {};
    if (pathname.endsWith('/token')) {
      if (requestUrl.searchParams.get('grant_type') === 'refresh_token') {
        const id = refreshTokens.get(args.refresh_token);
        if (!id) return res.writeHead(400).end(JSON.stringify({ code: 'refresh_token_not_found', message: 'Test session expired' }));
        return res.end(JSON.stringify(newSession(id)));
      }
      const id = args.email === 'a@example.test' ? userA : args.email === 'b@example.test' ? userB : args.email === 'unassigned@example.test' ? userUnassigned : null;
      if (!id || args.password !== 'password-test-only') return res.writeHead(400).end(JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }));
      return res.end(JSON.stringify(newSession(id)));
    }
    if (!currentSession) return res.writeHead(401).end(JSON.stringify({ code: 'bad_jwt', message: 'Test session expired' }));
    if (pathname.endsWith('/user')) return res.end(JSON.stringify(currentSession.user));
    if (pathname.endsWith('/logout')) { sessions.delete(token); refreshTokens.delete(currentSession.refresh_token); return res.writeHead(204).end(); }
    return res.writeHead(404).end('{}');
  }
  if (pathname.startsWith('/rest/v1/rpc/')) {
    try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const args = JSON.parse(body);
    requests.push({ pathname, args, key: req.headers.apikey, userId: currentSession?.user.id ?? null });
    res.setHeader('Content-Type', 'application/json');
    if (!currentSession) return res.writeHead(401).end(JSON.stringify({ code: 'PGRST301', message: 'LOGIN_REQUIRED' }));
    const query = (sql, parameters) => queryAs(currentSession.user.id, sql, parameters);
    if (pathname.endsWith('/get_current_store')) return res.end(JSON.stringify((await query('select * from public.get_current_store()')).rows));
    if (pathname.endsWith('/get_layout_analysis')) {
      const failed = failAnalysis;
      const delay = analysisDelay;
      const { rows } = await query('select public.get_layout_analysis($1::text[]) as data', [args.p_layout_ids]);
      await new Promise(resolve => setTimeout(resolve, delay));
      if (failed) return res.writeHead(503).end(JSON.stringify({ message: 'Test analysis failure' }));
      return res.end(JSON.stringify(rows[0].data));
    }
    if (pathname.endsWith('/get_layout_history')) {
      if (failLayouts) return res.writeHead(503).end(JSON.stringify({ message: 'Test layout failure' }));
      return res.end(JSON.stringify((await query('select * from public.get_layout_history()')).rows));
    }
    if (pathname.endsWith('/initialize_layout')) {
      const { rows } = await query('select * from public.initialize_layout($1, $2::jsonb)', [args.p_id, JSON.stringify(args.p_layout_snapshot)]);
      return res.end(JSON.stringify(rows));
    }
    if (pathname.endsWith('/save_layout_version')) {
      const mode = layoutSaveMode;
      await new Promise(resolve => setTimeout(resolve, layoutSaveDelay));
      try {
        let rows;
        if (mode !== 'error') rows = (await query('select * from public.save_layout_version($1, $2, $3::jsonb, $4)', [args.p_id, args.p_base_id, JSON.stringify(args.p_layout_snapshot), args.p_change_note])).rows;
        if (mode !== 'success') return res.writeHead(503).end(JSON.stringify({ message: 'Test layout response failure' }));
        return res.end(JSON.stringify(rows));
      } catch (error) { return res.writeHead(400).end(JSON.stringify({ code: error.code, message: error.message })); }
    }
    if (pathname.endsWith('/save_observation')) {
      const mode = saveMode;
      await new Promise(resolve => setTimeout(resolve, saveDelay));
      if (mode !== 'error') await query('select public.save_observation($1::jsonb)', [JSON.stringify(args.p_observation)]);
      if (mode !== 'success') return res.writeHead(503).end(JSON.stringify({ code: 'MOCK_NETWORK_FAILURE', message: 'Test failure' }));
      return res.end('null');
    }
    if (pathname.endsWith('/get_observation_summary')) {
      if (failSummary) return res.writeHead(503).end(JSON.stringify({ message: 'Test summary failure' }));
      const { rows } = await query('select * from public.get_observation_summary($1::date)', [args.p_date]);
      return res.end(JSON.stringify(rows));
    }
    return res.writeHead(404).end('{}');
    } catch (error) {
      return res.writeHead(error.code === '42501' ? 403 : error.code === '28000' ? 401 : 400).end(JSON.stringify({ code: error.code, message: error.message }));
    }
  }
  const currentRoot = pathname === '/unconfigured' ? unconfiguredRoot : root;
  const relative = pathname === '/' || pathname === '/unconfigured' ? '/index.html' : pathname;
  let file = path.resolve(currentRoot, '.' + relative);
  if (!file.startsWith(currentRoot + path.sep)) return res.writeHead(404).end();
  if (!fs.existsSync(file) && pathname.startsWith('/assets/')) file = path.resolve(unconfiguredRoot, '.' + relative);
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 実環境の接続設定を使わず、一時DB向けと未設定の2ビルドを自動作成します。
async function buildApp(outDir, configured) {
  const result = spawn(process.execPath, [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDir], {
    cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_SUPABASE_URL: configured ? baseUrl : ' ', VITE_SUPABASE_PUBLISHABLE_KEY: configured ? 'public-browser-test-key' : ' ', VITE_SUPABASE_ANON_KEY: ' ', VITE_STORE_NAME: 'テスト店' },
  });
  let output = '';
  result.stdout.on('data', data => { output += data; });
  result.stderr.on('data', data => { output += data; });
  await new Promise((resolve, reject) => {
    result.once('error', reject);
    result.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser test build failed:\n' + output)));
  });
}

function chromeExecutable() {
  const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const executable = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!executable) throw new Error('Chromeが見つかりません。CHROME_PATHに実行ファイルのパスを指定してください。');
  return executable;
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails.text);
      const request = this.pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
    });
  }
  async send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(fn) {
    const result = await this.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
}

(async () => {
  let browser;
  let client;
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth to anon, authenticated;
      insert into auth.users values ('${userA}'), ('${userB}'), ('${userUnassigned}');`);
    await db.exec(fs.readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(process.cwd(), 'supabase', 'layout-history.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(process.cwd(), 'supabase', 'analysis.sql'), 'utf8'));
    await db.query("insert into public.observations (id, observation_number, started_at, ended_at, layout_version, customer_service, result, purchased_items) values ('seed-today', 1, now(), now(), 'v2', '{}', 'purchase', '[{\"id\":\"other\"}]'), ('seed-earlier', 2, now() - interval '2 days', now() - interval '2 days', 'v2', '{}', 'purchase', '[{\"id\":\"other\"}]')");
    await db.exec(fs.readFileSync(path.join(projectRoot, 'supabase/security.sql'), 'utf8'));
    await db.query('update public.stores set name = $1 where id = $2', ['テスト店', storeA]);
    await db.query('insert into public.stores(id,name) values ($1,$2)', [storeB,'別店舗']);
    await db.query("insert into public.store_members(user_id,store_id,role) values ($1,$2,'owner'), ($3,$4,'staff')", [userA,storeA,userB,storeB]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    await buildApp(root, true);
    await buildApp(unconfiguredRoot, false);
    browser = spawn(chromeExecutable(), [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-extensions', '--disable-sync',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
    ], { windowsHide: true, stdio: 'ignore' });
    let launchError;
    browser.on('error', error => { launchError = error; });
    const activePort = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(activePort); i++) {
      if (launchError) throw launchError;
      await pause(100);
    }
    if (!fs.existsSync(activePort)) throw new Error('Chrome remote debugging did not start');
    const port = fs.readFileSync(activePort, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const target = targets.find(item => item.type === 'page');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    client = new CDP(socket);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `const originalFetch = window.fetch.bind(window); window.fetch = (input, init) => { const url = new URL(typeof input === 'string' ? input : input.url, location.href); if (url.origin !== location.origin) return Promise.reject(new Error('External network blocked in browser test')); return originalFetch(input, init); };` });
    await client.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
    for (let i = 0; i < 100; i++) {
      if (await client.evaluate(() => Boolean(document.querySelector('h1')))) break;
      await pause(100);
    }


    const checks = [];
    const inputMeasurements = [];
    function check(name, condition) {
      checks.push({ name, passed: Boolean(condition) });
      if (!condition) throw new Error('Failed: ' + name);
    }
    async function evaluateExpression(expression) {
      const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    }
    async function rect(selector) {
      await evaluateExpression('document.querySelector(' + JSON.stringify(selector) + ').scrollIntoView({block:"center"})');
      await pause(50);
      return evaluateExpression('(() => { const r=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
    }
    async function clickSelector(selector) {
      const point = await rect(selector);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await pause(60);
    }
    async function tapVisible(selector) {
      const point = await evaluateExpression('(() => { const element=document.querySelector('+JSON.stringify(selector)+'); if (!element) return null; const r=element.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; const hit=document.elementFromPoint(x,y); const footer=document.querySelector(".observation-end-bar"); const covered=footer&&!footer.contains(element)&&r.bottom>footer.getBoundingClientRect().top; return r.top>=0&&r.bottom<=innerHeight&&!covered&&!element.disabled&&element.contains(hit)?{x,y}:null; })()');
      if (!point) throw Error('スクロールなしで押せないボタン: '+selector);
      await client.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
      await client.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      await pause(80);
    }
    async function selectNative(selector, value) {
      const target = await evaluateExpression('(() => { const select=document.querySelector('+JSON.stringify(selector)+'); const enabled=Array.from(select.options).filter(option=>!option.disabled); return {index:enabled.findIndex(option=>option.value==='+JSON.stringify(value)+'),disabled:select.disabled}; })()');
      if (target.disabled || target.index < 0) throw Error('Unavailable native option: '+selector+' '+value);
      await clickSelector(selector);
      async function key(name, code, number) {
        await client.send('Input.dispatchKeyEvent', {type:'keyDown',key:name,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number});
        await client.send('Input.dispatchKeyEvent', {type:'keyUp',key:name,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number});
      }
      await key('Home','Home',36);
      for (let index=0;index<target.index;index++) await key('ArrowDown','ArrowDown',40);
      await key('Enter','Enter',13);
      await pause(100);
      check('ネイティブselectをタップ・キー操作で切り替え '+selector+' '+value, await evaluateExpression('document.querySelector('+JSON.stringify(selector)+').value === '+JSON.stringify(value)));
    }
    async function clickButton(label) {
      await evaluateExpression('(() => { const b=Array.from(document.querySelectorAll("button")).find(el => (el.getAttribute("aria-label") || el.textContent.trim()) === ' + JSON.stringify(label) + '); if(!b) throw Error("Missing button: " + ' + JSON.stringify(label) + '); b.dataset.checkTarget="active"; })()');
      await clickSelector('[data-check-target="active"]');
      await evaluateExpression('document.querySelector("[data-check-target=active]")?.removeAttribute("data-check-target")');
    }
    async function fill(name, text) {
      await clickSelector('[name="' + name + '"]');
      await evaluateExpression('document.querySelector(' + JSON.stringify('[name="' + name + '"]') + ').select()');
      await client.send('Input.insertText', { text });
      await pause(40);
    }
    async function counts(expected) {
      check('ホームの人数 ' + expected, await client.evaluate(() => Array.from(document.querySelectorAll('.summary-stat dd'), el => el.textContent).join(',')) === expected);
    }
    async function startObservation(number) {
      await clickButton('観察を開始');
      check('確認画面なしで観察 #' + number + ' を開始', await client.evaluate(() => document.querySelector('h1').textContent) === '観察 #' + number);
    }
    async function tapZone(id) {
      await clickSelector('[data-zone-id="' + id + '"]');
    }
    async function pressed(label) {
      return evaluateExpression('Array.from(document.querySelectorAll("button")).find(el => el.getAttribute("aria-label") === ' + JSON.stringify(label) + ')?.getAttribute("aria-pressed")');
    }
    const layouts = [];
    async function collectLayouts(screen) {
      for (const width of [320, 375, 390, 768, 1440]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
        await pause(70);
        const value = await client.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          controlsTooSmall: Array.from(document.querySelectorAll('button, select, input, textarea, summary')).filter(el => {
            if (el.matches(".map-element__body, .observation-zone")) { const hit=getComputedStyle(el,"::before"); return parseFloat(hit.width)<44 || parseFloat(hit.height)<44; }
            const r = el.getBoundingClientRect();
            return r.height > 0 && (r.height < 44 || r.width < 44);
          }).map(el => el.textContent.trim()),
          endButtons: Array.from(document.querySelectorAll('.observation-end-button'), el => ({
            label: el.textContent.trim(), top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom,
          })),
          viewportHeight: innerHeight,
        }));
        layouts.push({ screen, requestedWidth: width, ...value });
        if (value.scrollWidth > value.width || value.controlsTooSmall.length) console.log(JSON.stringify(value));
        check(screen + ' ' + width + 'px / 横スクロールなし・タップ領域44px以上', value.scrollWidth <= value.width && value.controlsTooSmall.length === 0);
        if (value.endButtons.length) check(screen + ' ' + width + 'px / 終了ボタンが画面内', value.endButtons.every(button => button.top >= 0 && button.bottom <= value.viewportHeight));
      }
      await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    }
    async function screenshot(name) {
      await evaluateExpression('window.scrollTo(0,0)');
      await pause(60);
      const result = await client.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(artifacts, name);
      fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
      return file;
    }
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const dialogAnswers = [true];
    const dialogs = [];
    client.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Page.javascriptDialogOpening') {
        dialogs.push(message.params.message);
        client.send('Page.handleJavaScriptDialog', { accept: dialogAnswers.length ? dialogAnswers.shift() : true }).catch(() => {});
      }
    });
    async function waitFor(expression) {
      for (let i = 0; i < 60; i++) {
        if (await evaluateExpression('Boolean(' + expression + ')')) return;
        await pause(50);
      }
      throw new Error('Condition timed out: ' + expression);
    }
    async function home() {
      await waitFor('document.querySelector("h1")?.textContent === "テスト店" && document.querySelector(".status-badge")?.textContent.includes("日本時間") && !document.querySelector(".action-button--primary").disabled');
    }
    const saves = () => requests.filter(request => request.pathname.endsWith('/save_observation'));
    await waitFor('document.querySelector("#login-email") && !document.querySelector("#login-email").disabled');
    check('未ログインでは店舗UIも店舗データ通信も利用しない', !await client.evaluate(() => Boolean(document.querySelector('.home-actions'))) && requests.length === 0);
    await collectLayouts('login');
    await screenshot('retail-flow-security-login.png');
    await fill('email','a@example.test');
    await fill('password','incorrect-test-only');
    await clickButton('ログイン');
    await waitFor('document.querySelector(".login-error")?.textContent.includes("パスワードを確認")');
    check('ログイン失敗でも店舗データを要求しない',requests.length === 0);
    async function loginAs(email) {
      await waitFor('document.querySelector("#login-email") && !document.querySelector("#login-email").disabled');
      await fill('email',email);
      await fill('password','password-test-only');
      await clickButton('ログイン');
    }
    await loginAs('a@example.test');
    await home();
    check('ログイン後に検証済み店舗名と所属店舗の初期配置を表示', requests.some(request=>request.pathname.endsWith('/get_current_store')&&request.userId===userA));
    await client.send('Page.reload');
    await home();
    check('再読み込み後もAuthセッションが維持される',authRequests.filter(request=>request.pathname.endsWith('/token')).length===2);
    await counts('1人,1人');
    check('仮データを加算せずDBの人数だけを表示', await client.evaluate(() => document.querySelector('.status-badge').textContent.includes('日本時間')));
    check('設定した店舗名を表示し、通常画面に開発用の仮表示を出さない', await client.evaluate(() => document.querySelector('h1').textContent==='テスト店'&&!document.querySelector('main').textContent.includes('Supabase')&&!document.querySelector('.app-footer')));
    const comparisonsBeforeSingle = requests.filter(request=>request.pathname.endsWith('/get_layout_analysis')).length;
    await clickButton('分析を見る');
    await waitFor('document.querySelector(".analysis-empty")');
    check('配置が1件でも上部に選択UIを表示し、比較せず案内', await client.evaluate(() => document.querySelector('#analysis-before').disabled && document.querySelector('#analysis-after').disabled && document.querySelector('.analysis-empty').textContent.includes('2つ以上')) && requests.filter(request=>request.pathname.endsWith('/get_layout_analysis')).length === comparisonsBeforeSingle);
    await clickButton('ホームへ');
    await home();
    await collectLayouts('home');
    check('観察開始が最大のボタン', await client.evaluate(() => document.querySelector('.action-button--primary').getBoundingClientRect().height > Math.max(...Array.from(document.querySelectorAll('button:not(.action-button--primary)'), el => el.getBoundingClientRect().height))));
    await clickButton('配置を変更');
    check('変更理由が空欄の場合の扱いを案内', await client.evaluate(()=>document.querySelector('.layout-change-note').textContent.includes('空欄でも保存できます。')));
    await client.send('Emulation.setDeviceMetricsOverride', { width:320, height:844, deviceScaleFactor:1, mobile:true });
    await pause(150);
    async function shrinkElement(id) {
      await clickSelector('[data-element-id="'+id+'"] .map-element__body');
      await pause(100);
      const point=await rect('[data-element-id="'+id+'"] .map-element__resize');
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-300,y:point.y-300}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await pause(150);
    }
    async function textFits(id) {
      return evaluateExpression('(() => { const box=Array.from(document.querySelectorAll(".map-element")).find(el=>el.dataset.elementId==='+JSON.stringify(id)+'); const r=box.getBoundingClientRect(); const text=Array.from(box.querySelectorAll(".map-element__name,.map-element__product,.map-element__body>.icon")); return { width:parseFloat(box.style.width),height:parseFloat(box.style.height),fits:text.every(el=>{const t=el.getBoundingClientRect();return t.top>=r.top&&t.bottom<=r.bottom+0.5&&t.left>=r.left&&t.right<=r.right+0.5&&el.scrollWidth<=el.clientWidth+1}), name:box.querySelector(".map-element__name").textContent, product:box.querySelector(".map-element__product")?.textContent }; })()');
    }
    for (const [id,label] of [['sample-checkout','レジ'],['sample-entrance','入口'],['sample-fitting','試着室'],['sample-bags','売場ゾーン']]) {
      await clickSelector('[data-element-id="'+id+'"] .map-element__body');
      if(id==='sample-bags'){await fill('element-name','帽子');await fill('product','帽子');}
      await shrinkElement(id);
      const fit=await textFits(id);
      if(!fit.fits || !(fit.width<20&&fit.height<16)) console.log({label,...fit});
      check(label+'を固定下限より小さくしても文字・アイコンが見切れない',fit.fits&&fit.width<20&&fit.height<16);
      check(label+'のスライダー下限も内容に応じて更新',await client.evaluate(()=>Number(document.querySelector('input[aria-label=幅]').min)<20&&Number(document.querySelector('input[aria-label=高さ]').min)<16));
      check(label+'の文字とサイズ変更ハンドルが重ならない',await client.evaluate(()=>{const box=document.querySelector('.map-element.is-selected');const icon=box.querySelector('.map-element__resize .icon').getBoundingClientRect();return Array.from(box.querySelectorAll('.map-element__name,.map-element__product,.map-element__body>.icon')).every(el=>{const r=el.getBoundingClientRect();return r.right<=icon.left+0.5||r.left>=icon.right-0.5||r.bottom<=icon.top+0.5||r.top>=icon.bottom-0.5})}));
    }
    await clickSelector('[data-element-id="sample-checkout"] .map-element__body');
    const shortCheckout=await textFits('sample-checkout');
    await fill('element-name','お会計とご案内のための長い名前のレジカウンター');
    await pause(150);
    const longCheckout=await textFits('sample-checkout');
    check('レジの名称変更で文字が収まるまでサイズを調整',longCheckout.fits&&(longCheckout.width>shortCheckout.width||longCheckout.height>shortCheckout.height)&&longCheckout.name.includes('長い名前'));
    await fill('element-name','レジ');
    await shrinkElement('sample-checkout');
    await clickSelector('[data-element-id="sample-bags"] .map-element__body');
    const longProduct='秋冬の新作商品とカラーバリエーションをすべて表示'.repeat(4);
    await fill('product',longProduct);
    await pause(150);
    const longSales=await textFits('sample-bags');
    check('売場の商品名は全文を折り返し、見切れずに表示',longSales.fits&&longSales.product===longProduct&&await client.evaluate(()=>getComputedStyle(document.querySelector('[data-element-id="sample-bags"] .map-element__product')).webkitLineClamp==='none'));
    await fill('product','帽子');
    await shrinkElement('sample-bags');
    await screenshot('retail-flow-field-test-small-map.png');
    await collectLayouts('editor-content-sized-elements');
    for (const id of ['sample-checkout','sample-entrance','sample-fitting','sample-bags']) check('画面幅を変更しても文字が収まる: '+id,(await textFits(id)).fits);
    await clickSelector('[data-element-id="sample-checkout"] .map-element__body');
    await evaluateExpression('(() => { const input=document.querySelector("input[aria-label=幅]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,input.max);input.dispatchEvent(new Event("input",{bubbles:true})); })()');
    await pause(120);
    check('幅の最大サイズはマップ右端までの範囲を維持',await client.evaluate(()=>{const map=document.querySelector('.store-map').getBoundingClientRect();const box=document.querySelector('[data-element-id="sample-checkout"]').getBoundingClientRect();return Math.abs(map.right-box.right)<1}));
    await clickButton('ホームへ');
    await home();
    await clickButton('配置を変更');
    await clickSelector('[data-element-id="sample-bags"]');
    await fill('product', '検証バッグ');
    await fill('element-name', '入口バッグ');
    await fill('category', '新作');
    const dragPoint = await rect('[data-element-id="sample-bags"] .map-element__body');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [dragPoint] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: dragPoint.x + 45, y: dragPoint.y + 70 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(60);
    await evaluateExpression('(() => { const input=document.querySelector("input[aria-label=幅]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"30"); input.dispatchEvent(new Event("input",{bubbles:true})); })()');
    await clickSelector('[data-element-id="sample-checkout"]');
    await clickButton('選択したものを削除');
    await clickButton('売場ゾーンを追加');
    await fill('element-name', 'デニム');
    await fill('product', '新作デニム');
    await fill('change-note', '新商品の露出を増やす\n立ち寄りの変化を確認したい');
    await clickButton('新しい配置として保存');
    await startObservation('001');
    await tapZone('sample-entrance');
    await tapZone('sample-bags');
    await clickButton('立ち止まる');
    await clickButton('商品に触る');
    await clickButton('1つ戻す');
    check('既存のイベント取り消しを維持', await pressed('商品に触る') === 'false' && await pressed('立ち止まる') === 'true');
    await collectLayouts('observation');
    await clickButton('接客開始');
    check('接客中の簡略画面を維持', await client.evaluate(() => document.querySelectorAll('button').length === 3));
    await clickButton('購入で終了');
    check('編集済みの商品を候補に表示', await client.evaluate(() => document.querySelector('[data-item-id="zone-sample-bags"]').textContent.includes('検証バッグ')));
    saveDelay = 700;
    await evaluateExpression('(() => { const button=document.querySelector("[data-item-id=zone-sample-bags]"); button.click(); button.click(); })()');
    await pause(100);
    check('保存中は終了・再試行ボタンを表示しない', await client.evaluate(() => document.querySelector('.observation-save-status')?.getAttribute('aria-busy') === 'true' && document.querySelectorAll('button').length === 0));
    check('候補の連打でも1回だけ送信', saves().length === 1);
    await home();
    await counts('2人,2人');
    const firstRecord = saves()[0].args.p_observation;
    check('購入・ルート・行動・接客・配置・商品情報を送信', firstRecord.result === 'purchase' && firstRecord.route_steps.map(step => step.zoneName).join(',') === '入口,入口バッグ' && firstRecord.route_steps[1].events.join(',') === 'stopped' && firstRecord.customer_service.hadService && firstRecord.customer_service.sessions[0].endedAt === firstRecord.ended_at && firstRecord.purchased_items[0].productName === '検証バッグ' && firstRecord.layout_snapshot.find(zone => zone.id === 'sample-bags').product === '検証バッグ' && firstRecord.layout_version === 'v2');
    saveDelay = 0;
    await startObservation('002');
    await tapZone('sample-tops');
    dialogAnswers.push(false);
    await clickButton('観察を破棄');
    check('破棄確認でキャンセルすると記録を維持',await client.evaluate(()=>document.querySelector('.observation-current-zone h2').textContent==='トップス'&&document.querySelectorAll('.observation-route li').length===1)&&saves().length===1);
    await clickButton('観察を破棄');
    await home();
    await counts('2人,2人');
    check('破棄では保存APIを呼ばない', saves().length === 1);
    await startObservation('003');
    await tapZone('sample-tops');
    await clickButton('接客開始');
    await clickButton('非購入で終了');
    await home();
    await counts('3人,2人');
    check('接客中の非購入終了も保存', saves()[1].args.p_observation.result === 'no-purchase' && saves()[1].args.p_observation.purchased_items.length === 0);
    await startObservation('004');
    await tapZone('sample-bags');
    saveMode = 'error';
    await clickButton('非購入で終了');
    await waitFor('document.querySelector(".observation-save-status__retry")');
    check('通信失敗でエラー・再試行・記録保持の案内を表示', await client.evaluate(() => document.querySelector('[role="alert"]').textContent.includes('通信に失敗') && document.querySelector('main').textContent.includes('ルート 1か所') && document.querySelector('main').textContent.includes('保持')));
    await collectLayouts('save-error');
    await screenshot('retail-flow-field-test-save-error.png');
    const failedRecord = saves().at(-1).args.p_observation;
    dialogAnswers.push(false);
    const beforeObservationReloadDialogs=dialogs.length;
    await client.send('Page.reload');
    await waitFor('document.querySelector(".observation-save-status__retry")');
    check('保存失敗の観察を再読み込みから保護',dialogs.length===beforeObservationReloadDialogs+1&&await client.evaluate(()=>document.querySelector('main').textContent.includes('ルート 1か所')));
    saveMode = 'success';
    saveDelay = 700;
    await evaluateExpression('(() => { const button=document.querySelector(".observation-save-status__retry"); button.click(); button.click(); })()');
    await pause(100);
    check('再試行の連打でも送信は1回', saves().length === 4);
    await home();
    await counts('4人,2人');
    check('失敗前と同じID・記録内容で再試行', JSON.stringify(saves().at(-1).args.p_observation) === JSON.stringify(failedRecord));
    saveDelay = 0;
    await startObservation('005');
    saveMode = 'lost-response';
    await clickButton('購入で終了');
    await clickButton('複数購入');
    await clickSelector('[data-item-id="zone-sample-bags"]');
    await clickSelector('[data-item-id="zone-sample-tops"]');
    await clickButton('購入で終了');
    await waitFor('document.querySelector(".observation-save-status__retry")');
    saveMode = 'success';
    await clickButton('保存を再試行');
    await home();
    await counts('5人,3人');
    const lastId = saves().at(-1).args.p_observation.id;
    const duplicated = await db.query('select count(*) as count from public.observations where id = $1', [lastId]);
    check('保存後の応答喪失でもDBに重複を作らない', duplicated.rows[0].count === 1);
    check('複数購入を保持', saves().at(-1).args.p_observation.multiple_purchase && saves().at(-1).args.p_observation.purchased_items.length === 2);
    failSummary = true;
    await client.send('Page.reload');
    await waitFor('document.querySelector(".summary-retry")');
    check('集計取得失敗は0人と表示しない', await client.evaluate(() => Array.from(document.querySelectorAll('.summary-stat dd'), el => el.textContent).join(',')) === '—人,—人');
    failSummary = false;
    await clickButton('人数を再取得');
    await home();
    await counts('5人,3人');
    await client.send('Page.reload');
    await home();
    await counts('5人,3人');
    check('再読み込み後にも保存済み人数をDBから取得', requests.filter(request => request.pathname.endsWith('/get_observation_summary')).length >= 8);
    await clickButton('分析を見る');
    await waitFor('document.querySelector(".analysis-highlight")');
    check('ホームから分析へ遷移し、0人の配置でもクラッシュしない', await client.evaluate(() => document.querySelector('h1').textContent === '分析' && document.querySelector('.analysis-highlight').textContent.includes('—')));
    check('0人の注意と参考値を表示', await client.evaluate(() => document.querySelector('.analysis-cautions').textContent.includes('0人') && document.querySelector('.analysis-cautions').textContent.includes('参考値')));
    await clickButton('ホームへ');
    await home();
    const layoutSaves = () => requests.filter(request => request.pathname.endsWith('/save_layout_version'));
    check('観察に開始時の配置IDを送信', firstRecord.layout_version_id === layoutSaves()[0].args.p_id);
    check('リロード後も保存した最新のv2を表示', await client.evaluate(() => document.querySelector('.version-badge').textContent) === 'v2');
    await clickButton('配置履歴');
    await waitFor('document.querySelectorAll(".layout-history-card").length === 2 && !document.querySelector(".history-refresh").disabled');
    check('v1→v2を古い順にマップ付きで表示', await client.evaluate(() => Array.from(document.querySelectorAll('.layout-history-card h2'), el => el.textContent).join(',') === '配置 v1,配置 v2' && document.querySelectorAll('.layout-map-preview').length === 2));
    check('配置履歴には保存時の変更理由だけを表示', await client.evaluate(() => Array.from(document.querySelectorAll('.layout-changes h3'), el => el.textContent).join(',') === '変更理由'));
    check('配置履歴の自動変更一覧を表示しない', await client.evaluate(() => !document.querySelector('.layout-change-type') && !document.querySelector('.layout-change-detail') && !document.querySelector('[aria-label=自動検出した変更内容]')));
    check('変更理由を改行込みで表示', await client.evaluate(() => document.querySelector('.layout-change-reason p').textContent.includes('新商品の露出を増やす')));
    await collectLayouts('layout-history');
    await screenshot('retail-flow-field-test-history.png');
    await evaluateExpression('document.querySelector(".layout-changes").scrollIntoView({block:"start"})');
    await pause(60);
    const transitionCapture = await client.send('Page.captureScreenshot', { format: 'png' });
    const transitionScreenshot = path.join(artifacts, 'retail-flow-field-test-transition.png');
    fs.writeFileSync(transitionScreenshot, Buffer.from(transitionCapture.data, 'base64'));
    const recordsV2 = (await db.query('select * from public.get_layout_history()')).rows;
    check('初期配置を上書きせず旧商品の情報も保持', recordsV2[0].layout_snapshot.find(zone => zone.id === 'sample-bags').product === 'ボストンバッグ' && recordsV2[1].layout_snapshot.find(zone => zone.id === 'sample-bags').name === '入口バッグ');
    await clickButton('ホームへ');
    await home();
    await clickButton('配置を変更');
    await clickSelector('[data-element-id="sample-bags"]');
    await fill('product', 'バッグv3');
    await fill('change-note', 'v3の理由');
    layoutSaveMode = 'error';
    await clickButton('新しい配置として保存');
    await waitFor('document.querySelector(".editor-save-error")');
    check('配置保存失敗でも編集と理由を保持', await client.evaluate(() => document.querySelector('[name=product]').value === 'バッグv3' && document.querySelector('[name=change-note]').value === 'v3の理由'));
    dialogAnswers.push(false);
    const beforeEditorReloadDialogs=dialogs.length;
    await client.send('Page.reload');
    await waitFor('document.querySelector(".editor-save-error")');
    check('未保存の編集・保存失敗を再読み込みから保護', dialogs.length===beforeEditorReloadDialogs+1&&await client.evaluate(()=>document.querySelector('[name=product]').value==='バッグv3'&&document.querySelector('[name=change-note]').value==='v3の理由'));
    const failedLayout = layoutSaves().at(-1).args;
    layoutSaveMode = 'success';
    layoutSaveDelay = 700;
    await evaluateExpression('(() => { const button=document.querySelector(".editor-save-button"); button.click(); button.click(); })()');
    await pause(100);
    check('配置保存中は編集・戻る・再送信を無効化', await client.evaluate(() => document.querySelector('.editor-fields').disabled && document.querySelector('.editor-fields').inert && document.querySelector('.editor-save-button').disabled && document.querySelector('.editor-back-button').disabled));
    check('配置保存の再試行で同じIDと内容を送る', JSON.stringify(layoutSaves().at(-1).args) === JSON.stringify(failedLayout) && layoutSaves().length === 3);
    await home();
    check('v3を保存して現在の配置を更新', await client.evaluate(() => document.querySelector('.version-badge').textContent) === 'v3');
    check('保存成功をホーム上部の見える位置に表示', await client.evaluate(()=>{const note=document.querySelector('.feature-notice');const r=note.getBoundingClientRect();return note.textContent.includes('配置 v3 を保存しました')&&r.top>=0&&r.bottom<innerHeight&&Boolean(note.compareDocumentPosition(document.querySelector('.home-actions'))&Node.DOCUMENT_POSITION_FOLLOWING)}));
    layoutSaveDelay = 0;
    await clickButton('配置を変更');
    await clickSelector('[data-element-id="sample-bags"]');
    await fill('memo', 'v4のメモ');
    await fill('change-note', 'v4の理由');
    layoutSaveMode = 'lost-response';
    await clickButton('新しい配置として保存');
    await waitFor('document.querySelector(".editor-save-error")');
    layoutSaveMode = 'success';
    await clickButton('保存を再試行');
    await home();
    check('配置の保存後の応答喪失でもv4を1回だけ作成', await client.evaluate(() => document.querySelector('.version-badge').textContent) === 'v4' && (await db.query('select count(*) as count from public.layout_versions')).rows[0].count === 4);
    await clickButton('配置を変更');
    await clickSelector('[data-element-id="sample-bags"]');
    await fill('product', 'この端末の未保存商品');
    await fill('change-note', '未保存の変更理由');
    let latest = (await db.query('select * from public.get_layout_history()')).rows.at(-1);
    const externalSnapshot = latest.layout_snapshot.map(zone => zone.id === 'sample-bags' ? { ...zone, product: '別端末の商品' } : zone);
    await db.query('select * from public.save_layout_version($1,$2,$3::jsonb,$4)', ['external-v5',latest.id,JSON.stringify(externalSnapshot),'別の端末で保存']);
    await clickButton('新しい配置として保存');
    await waitFor('document.querySelector(".editor-save-error")');
    check('古いコピーの保存競合を表示して編集を保持', await client.evaluate(() => document.querySelector('.editor-save-error').textContent.includes('現在の配置が更新') && document.querySelector('[name=product]').value === 'この端末の未保存商品' && document.querySelector('[name=change-note]').value === '未保存の変更理由'));
    await clickButton('ホームへ');
    await home();
    check('別端末で保存された最新のv5を取得', await client.evaluate(() => document.querySelector('.version-badge').textContent) === 'v5');
    await startObservation('001');
    await tapZone('sample-bags');
    latest = (await db.query('select * from public.get_layout_history()')).rows.at(-1);
    const externalV6 = latest.layout_snapshot.map(zone => ({ ...zone, memo: '観察中に別端末で変更' }));
    await db.query('select * from public.save_layout_version($1,$2,$3::jsonb,$4)', ['external-v6',latest.id,JSON.stringify(externalV6),'観察中の配置変更']);
    await clickButton('非購入で終了');
    await home();
    await counts('6人,3人');
    const startedRecord = saves().at(-1).args.p_observation;
    check('観察中に最新配置が変わっても開始時のv5に紐づける', startedRecord.layout_version_id === 'external-v5' && startedRecord.layout_version === 'v5' && JSON.stringify(startedRecord.layout_snapshot) === JSON.stringify(latest.layout_snapshot));
    check('観察終了後のホームには最新のv6を表示', await client.evaluate(() => document.querySelector('.version-badge').textContent) === 'v6');
    failLayouts = true;
    await client.send('Page.reload');
    await waitFor('document.querySelector(".layout-status [role=alert]")');
    check('配置取得失敗でもクラッシュせず誤った配置で観察を開始しない', await client.evaluate(() => document.querySelector('h1').textContent === 'テスト店' && document.querySelector('.action-button--primary').disabled && document.querySelector('.version-badge').textContent === '未取得'));
    failLayouts = false;
    await clickButton('配置を再取得');
    await home();
    check('取得失敗から再試行で最新配置を復元', await client.evaluate(() => document.querySelector('.version-badge').textContent) === 'v6');
    await screenshot('retail-flow-field-test-home.png');
    const { initialStoreMap } = await import('file:///' + path.join(process.cwd(), 'src/data/initialStoreMap.js').replaceAll('\\', '/'));
    let analysisLatest = (await db.query('select * from public.get_layout_history()')).rows.at(-1);
    await db.query('select * from public.save_layout_version($1,$2,$3::jsonb,$4)', ['analysis-v7', analysisLatest.id, JSON.stringify(initialStoreMap), '比較用の基準配置']);
    await client.send('Page.reload');
    await home();
    const quickRecords = [];
    for (const [index, [width,height]] of [[320,568],[375,667],[390,844]].entries()) {
      await client.send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:true});
      await evaluateExpression('window.scrollTo(0,0)');
      await pause(100);
      const inputStarted=performance.now();
      await tapVisible('.action-button--primary');
      await waitFor('document.querySelector(".observation-map")');
      check('観察番号に仮の18人を使わず#001から開始 '+width,await client.evaluate(()=>document.querySelector('h1 span').textContent)==='#'+String(index+1).padStart(3,'0'));
      await tapVisible('[data-zone-id="sample-entrance"]');
      await tapVisible('[data-zone-id="sample-bags"]');
      check('ゾーンのタップを枠・ルート・選択状態で示す '+width,await client.evaluate(()=>document.querySelector('[data-zone-id="sample-bags"]').getAttribute('aria-pressed')==='true'&&document.querySelector('.observation-zone.is-current').dataset.zoneId==='sample-bags'&&document.querySelectorAll('.observation-route li').length===2));
      await tapVisible('.observation-event-buttons button[aria-label="立ち止まる"]');
      await tapVisible('.observation-event-buttons button[aria-label="商品に触る"]');
      await tapVisible('.observation-event-buttons button[aria-label="値札を見る"]');
      check('3行動のON状態を色とチェックで表示 '+width,await client.evaluate(()=>document.querySelectorAll('.observation-event-buttons [aria-pressed="true"]').length===3));
      const observationCapture=await client.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(artifacts,'observation-'+width+'x'+height+'.png'),Buffer.from(observationCapture.data,'base64'));
      await tapVisible('[data-zone-id="sample-checkout"]');
      await tapVisible('.observation-end-button--purchase');
      await waitFor('document.querySelector(".purchase-selection")');
      await tapVisible('[data-item-id="zone-sample-bags"]');
      const inputMs=Math.round(performance.now()-inputStarted);
      await home();
      const record=saves().at(-1).args.p_observation;
      quickRecords.push(record.id);
      check('指定した観察を9タップ・スクロールなしで記録 '+width+'x'+height,record.route_steps.map(step=>step.zoneId).join(',')==='sample-entrance,sample-bags,sample-checkout'&&record.route_steps[1].events.join(',')==='stopped,touchedProduct,checkedPriceTag'&&record.result==='purchase'&&record.purchased_items[0].zoneId==='sample-bags');
      inputMeasurements.push({width,height,taps:9,scrolls:0,automatedInputMs:inputMs});
    }
    // 専用の一時DBに追加した速度検証用の記録だけを除き、後続の50人集計を独立に確認します。
    await db.query('delete from public.observations where id=any($1::text[])',[quickRecords]);
    await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const analysisMap = initialStoreMap.filter(zone => zone.id !== 'sample-tops').map(zone => zone.id === 'sample-bags' ? { ...zone, name: '入口バッグ', y: 62 } : zone);
    analysisMap.push({ id:'analysis-denim', type:'sales', name:'デニム', product:'新作デニム', category:'デニム', memo:'', x:60, y:36, width:34, height:24 });
    await db.query('select * from public.save_layout_version($1,$2,$3::jsonb,$4)', ['analysis-v8', 'analysis-v7', JSON.stringify(analysisMap), '新商品の露出を増やすため']);
    for (const version of [7,8]) {
      for (let index = 0; index < 50; index++) {
        const thresholds = version === 7 ? [30,9,7,5,2,10,2] : [40,18,15,10,5,20,5];
        const events = ['stopped','touchedProduct','checkedPriceTag','triedOn'].filter((event, at) => index < thresholds[at + 1]);
        const steps = index < thresholds[0] ? [{ zoneId:'sample-bags', zoneName:'バッグ', events }, { zoneId:'sample-bags', zoneName:'バッグ', events }] : [];
        const purchased = index < thresholds[6];
        const additionalZone = version === 7 ? 'sample-tops' : 'analysis-denim';
        const extraThresholds = version === 7 ? [4,3,2,1] : [10,8,6,3];
        if (index < 25) steps.push({ zoneId:additionalZone, zoneName:version === 7 ? 'トップス' : 'デニム', events:['stopped','touchedProduct','checkedPriceTag','triedOn'].filter((event,at)=>index<extraThresholds[at]) });
        const customerService = index < thresholds[5] ? { hadService:true, startedAt:'2026-10-01T00:01:00Z', startedZone:{zoneId:'sample-bags',zoneName:'バッグ'}, sessions:[{startedAt:'2026-10-01T00:01:00Z',startedZone:{zoneId:'sample-bags',zoneName:'バッグ'}}] } : {hadService:false};
        if (index < (version === 7 ? 3 : 5)) customerService.sessions.push({startedAt:'2026-10-01T00:02:00Z',startedZone:{zoneId:additionalZone}}, {startedAt:'2026-10-01T00:03:00Z',startedZone:{zoneId:additionalZone}});
        const items = purchased ? [{ id:'zone-sample-bags', zoneId:'sample-bags', productName:'ボストンバッグ' }] : [];
        if (index < (version === 7 ? 1 : 2)) items.push({id:'zone-'+additionalZone,zoneId:additionalZone,productName:'別売場の商品'});
        const row = { id:`analysis-${version}-${index}`, observation_number:index + 1, started_at:'2026-10-01T00:00:00Z', ended_at:'2026-10-01T00:05:00Z', layout_version:`v${version}`, layout_version_id:`analysis-v${version}`, layout_snapshot:version === 7 ? initialStoreMap : analysisMap, route_steps:steps, customer_service:customerService, result:purchased ? 'purchase' : 'no-purchase', purchased_items:items, multiple_purchase:items.length>1 };
        await db.query('select public.save_observation($1::jsonb)', [JSON.stringify(row)]);
      }
    }
    await clickButton('分析を見る');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v7 → v8")');
    const metricValues = label => evaluateExpression('(() => { const card=Array.from(document.querySelectorAll(".analysis-metric")).find(el => el.getAttribute("aria-label") === ' + JSON.stringify(label) + '); return { rates:Array.from(card.querySelectorAll(".analysis-metric__values strong"), el=>el.textContent), counts:Array.from(card.querySelectorAll("small"), el=>el.textContent), delta:card.querySelector(".analysis-delta").textContent }; })()');
    check('主要結果で選択売場の立ち止まり18%→36%・+18pt、購入4%→10%を表示', JSON.stringify((await metricValues('入口バッグの立ち止まり率')).rates) === JSON.stringify(['18%','36%']) && (await metricValues('入口バッグの立ち止まり率')).delta === '+18pt' && JSON.stringify((await metricValues('入口バッグの購入率')).rates) === JSON.stringify(['4%','10%']));
    check('変更した場所と理由を最上部に表示', await client.evaluate(() => document.querySelector('.analysis-highlight h2').textContent === '入口バッグ' && !document.querySelector('.analysis-highlight__change') && document.querySelector('.analysis-highlight').textContent.includes('新商品の露出を増やすため')));
    check('接客率の変化について原因を断定しない注意を表示', await client.evaluate(() => document.querySelector('.analysis-cautions').textContent.includes('接客率の変化も販売結果に影響している可能性があります')));
    check('再訪の重複を除き、9人/50人と18人/50人を保持表示', JSON.stringify((await metricValues('立ち止まり率')).counts) === JSON.stringify(['9人 / 50人','18人 / 50人']));
    check('全8指標を比較', await client.evaluate(() => ['観察人数','ゾーン通過率','立ち止まり率','商品接触率','値札確認率','試着率','接客率','購入率'].every(label => Array.from(document.querySelectorAll('.analysis-metric'), el=>el.getAttribute('aria-label')).includes(label))));
    check('接客群の人数を分母にした購入率を表示', JSON.stringify((await metricValues('接客あり購入率')).rates) === JSON.stringify(['20%','25%']) && JSON.stringify((await metricValues('接客なし購入率')).rates) === JSON.stringify(['0%','0%']));
    check('商品ファネルを配置別に同じ段階で比較', await client.evaluate(() => Array.from(document.querySelectorAll('.analysis-funnel__value strong'), el=>el.textContent).join(',') === '50人,50人,30人,40人,9人,18人,7人,15人,5人,10人,2人,5人'));
    check('両配置マップ上で通過率を表示', await client.evaluate(() => document.querySelectorAll('.analysis-passage-map').length === 2 && document.querySelectorAll('.analysis-passage-map')[0].getAttribute('aria-label').includes('新作バッグ 60%') && document.querySelectorAll('.analysis-passage-map')[1].getAttribute('aria-label').includes('入口バッグ 80%')));
    check('旧観察を配置名だけで集計しない', await client.evaluate(() => document.querySelector('.analysis-cautions').textContent.includes('旧観察 2人')));
    await collectLayouts('analysis');
    await screenshot('retail-flow-field-test-analysis.png');
    await evaluateExpression('document.querySelector("#analysis-maps-title").scrollIntoView({block:"start"})');
    await pause(60);
    const mapCapture = await client.send('Page.captureScreenshot', { format:'png' });
    fs.writeFileSync(path.join(artifacts,'retail-flow-field-test-analysis-maps.png'), Buffer.from(mapCapture.data,'base64'));
    async function selectValue(selector,value) { await evaluateExpression('(() => { const select=document.querySelector(' + JSON.stringify(selector) + '); select.value=' + JSON.stringify(value) + '; select.dispatchEvent(new Event("change",{bubbles:true})); })()'); await pause(80); }
    check('設備を除外し、両配置の追加・削除を含む全売場を選択肢にする',await client.evaluate(()=>Array.from(document.querySelector('#analysis-zone').options,option=>option.value).join(',')==='sample-bags,sample-tops,analysis-denim'&&!document.querySelector('#analysis-zone').disabled));
    const comparisonsBeforeZone = requests.filter(request=>request.pathname.endsWith('/get_layout_analysis')).length;
    await selectNative('#analysis-zone','analysis-denim');
    check('比較対象は選択中のデニムだけを表示',await client.evaluate(()=>document.querySelector('.analysis-selected-zone').textContent==='デニム'&&document.querySelector('.analysis-highlight h2').textContent==='デニム'&&document.querySelector('#analysis-changes-title').parentElement.textContent.includes('新商品の露出を増やすため')&&!document.querySelector('#analysis-changes-title').parentElement.textContent.includes('トップス')&&!document.querySelector('.layout-change-type')));
    check('追加ゾーンは前の配置なしを—として表示', JSON.stringify((await metricValues('ゾーン通過率')).rates) === JSON.stringify(['—','50%']) && (await metricValues('ゾーン通過率')).delta === '比較なし');
    for (const [label,rate] of [['立ち止まり率','20%'],['商品接触率','16%'],['値札確認率','12%'],['試着率','6%'],['接客率','10%'],['購入率','4%']]) check('売場のネイティブ切り替えで即時更新: '+label,JSON.stringify((await metricValues(label)).rates)===JSON.stringify(['—',rate]));
    check('主要結果の購入率も選択売場の商品に限定',JSON.stringify((await metricValues('デニムの購入率')).rates)===JSON.stringify(['—','4%']));
    check('商品ファネルも選択したデニムの値へ変更',await client.evaluate(()=>Array.from(document.querySelectorAll('.analysis-funnel__value strong'),el=>el.textContent).join(',')==='50人,50人,—,25人,—,10人,—,8人,—,6人,—,2人'));
    check('マップで選択中のデニムとその通過率だけを強調',await client.evaluate(()=>document.querySelectorAll('.analysis-passage-map .is-selected').length===1&&document.querySelector('.analysis-passage-map .is-selected').dataset.analysisZoneId==='analysis-denim'&&Array.from(document.querySelectorAll('.analysis-map-selection strong'),el=>el.textContent).join(',')==='この配置にはありません,50%'));
    check('売場変更は保存済み集計から即時表示し通信を追加しない',requests.filter(request=>request.pathname.endsWith('/get_layout_analysis')).length===comparisonsBeforeZone);
    await screenshot('retail-flow-field-test-zone-selection.png');
    await selectNative('#analysis-before','external-v6');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v6 → v8")');
    check('比較元を実際に変更しても候補にあるデニムの選択を維持',await client.evaluate(()=>document.querySelector('#analysis-zone').value==='analysis-denim'&&document.querySelector('.analysis-selected-zone').textContent==='デニム'));
    await selectNative('#analysis-before','analysis-v7');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v7 → v8")');
    await selectNative('#analysis-zone','sample-tops');
    check('削除ゾーンは後の配置なしを—として表示', JSON.stringify((await metricValues('ゾーン通過率')).rates) === JSON.stringify(['50%','—']));
    for (const [label,rate] of [['立ち止まり率','8%'],['商品接触率','6%'],['値札確認率','4%'],['試着率','2%'],['接客率','6%'],['購入率','2%']]) check('別の売場トップスへの切り替えで更新: '+label,JSON.stringify((await metricValues(label)).rates)===JSON.stringify([rate,'—']));
    await clickButton('データを再取得');
    await waitFor('document.querySelector(".analysis-highlight")');
    check('再取得後もトップスの選択が初期値に戻らない',await client.evaluate(()=>document.querySelector('#analysis-zone').value==='sample-tops'&&document.querySelector('.analysis-highlight h2').textContent==='トップス'));
    await selectNative('#analysis-zone','sample-bags');
    failAnalysis = true;
    await clickButton('データを再取得');
    await waitFor('document.querySelector(".analysis-error")');
    check('分析取得失敗は0人にせず、画面と再取得を維持', await client.evaluate(() => document.querySelector('.analysis-error').textContent.includes('再取得') && !document.querySelector('.analysis-highlight') && document.querySelector('h1').textContent === '分析'));
    failAnalysis = false;
    await clickButton('分析を再取得');
    await waitFor('document.querySelector(".analysis-highlight")');
    check('失敗後の再取得で同じ比較を復元', JSON.stringify((await metricValues('立ち止まり率')).rates) === JSON.stringify(['18%','36%']));
    check('両方の配置選択に履歴の全8バージョンを表示', await client.evaluate(() => ['#analysis-before','#analysis-after'].every(selector => Array.from(document.querySelector(selector).options, option=>option.textContent).join(',') === Array.from({length:8},(_,i)=>'配置 v'+(i+1)).join(','))));
    check('比較元・比較先の選択UIが主要結果より上にある', await client.evaluate(() => Boolean(document.querySelector('.analysis-selectors').compareDocumentPosition(document.querySelector('.analysis-highlight')) & Node.DOCUMENT_POSITION_FOLLOWING) && document.querySelector('label[for=analysis-before]').textContent.startsWith('比較元') && document.querySelector('label[for=analysis-after]').textContent.startsWith('比較先') && document.querySelector('.analysis-version-selectors > span').textContent === 'VS'));
    check('同じ配置は相手側の選択肢で無効化', await client.evaluate(() => document.querySelector('#analysis-before option[value="analysis-v8"]').disabled && document.querySelector('#analysis-after option[value="analysis-v7"]').disabled));
    await selectNative('#analysis-after','external-v6');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v7 → v6")');
    check('観察0件の古い配置も比較先に選べ、明示的に案内', await client.evaluate(() => document.querySelector('#analysis-after').value === 'external-v6' && document.querySelector('.analysis-no-data').textContent.includes('配置 v6') && document.querySelector('.analysis-no-data').textContent.includes('この配置にはまだ観察データがありません')));
    await selectNative('#analysis-before','analysis-v8');
    await selectNative('#analysis-after','analysis-v7');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v8 → v7")');
    check('最新の配置を比較元にし、逆方向でも自動集計', await client.evaluate(() => document.querySelector('#analysis-before').value === 'analysis-v8' && document.querySelector('#analysis-after').value === 'analysis-v7'));
    const reverseMetrics = [ ['ゾーン通過率',['80%','60%'],'-20pt'], ['立ち止まり率',['36%','18%'],'-18pt'], ['商品接触率',['30%','14%'],'-16pt'], ['値札確認率',['20%','10%'],'-10pt'], ['試着率',['10%','4%'],'-6pt'], ['接客率',['40%','20%'],'-20pt'], ['購入率',['10%','4%'],'-6pt'], ['接客あり購入率',['25%','20%'],'-5pt'], ['接客なし購入率',['0%','0%'],'0pt'] ];
    for (const [label,rates,delta] of reverseMetrics) { const value=await metricValues(label); check('切り替えで再集計: '+label, JSON.stringify(value.rates) === JSON.stringify(rates) && value.delta === delta); }
    check('観察人数も選択順で再表示', JSON.stringify((await metricValues('観察人数')).rates) === JSON.stringify(['50人','50人']));
    check('逆方向の商品ファネルも再表示', await client.evaluate(() => Array.from(document.querySelectorAll('.analysis-funnel__value strong'), el=>el.textContent).join(',') === '50人,50人,40人,30人,18人,9人,15人,7人,10人,5人,5人,2人'));
    check('逆方向のゾーン通過率マップも再表示', await client.evaluate(() => document.querySelectorAll('.analysis-passage-map')[0].getAttribute('aria-label').includes('配置 v8') && document.querySelectorAll('.analysis-passage-map')[0].getAttribute('aria-label').includes('80%') && document.querySelectorAll('.analysis-passage-map')[1].getAttribute('aria-label').includes('配置 v7') && document.querySelectorAll('.analysis-passage-map')[1].getAttribute('aria-label').includes('60%')));
    check('逆方向の変更内容と保存時の変更理由を再表示', await client.evaluate(() => document.querySelector('.analysis-selected-zone').textContent === '新作バッグ' && !document.querySelector('.layout-change-detail') && document.querySelector('.layout-change-reason p').textContent.includes('保存時の変更理由（v7 → v8）') && document.querySelector('.layout-change-reason p').textContent.includes('新商品の露出を増やすため')));
    const comparisonsBeforeInvalid = requests.filter(request=>request.pathname.endsWith('/get_layout_analysis')).length;
    await selectValue('#analysis-after','analysis-v8');
    await selectValue('#analysis-before','analysis-v7');
    check('同じ配置への不正な切り替えを拒否し、再集計APIを呼ばない', await client.evaluate(() => document.querySelector('#analysis-before').value === 'analysis-v8' && document.querySelector('#analysis-after').value === 'analysis-v7') && requests.filter(request=>request.pathname.endsWith('/get_layout_analysis')).length === comparisonsBeforeInvalid);
    await screenshot('retail-flow-field-test-selection.png');
    analysisDelay = 600;
    await selectValue('#analysis-after','external-v6');
    await selectValue('#analysis-before', recordsV2[0].id);
    await selectValue('#analysis-after','analysis-v8');
    await selectValue('#analysis-before','analysis-v7');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v7 → v8")');
    await pause(900);
    check('素早い切り替えでも古い集計応答を表示しない', JSON.stringify((await metricValues('立ち止まり率')).rates) === JSON.stringify(['18%','36%']));
    analysisDelay = 0;
    await selectValue('#analysis-before',recordsV2[0].id);
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v1 → v8")');
    check('離れた配置の比較では途中の各変更理由を区別', await client.evaluate(() => document.querySelector('.layout-change-reason p').textContent.includes('v3 への変更理由') && document.querySelector('.layout-change-reason p').textContent.includes('v8 への変更理由')));
    await db.query('select * from public.save_layout_version($1,$2,$3::jsonb,$4)', ['analysis-v9','analysis-v8','[]','売場なしの配置']);
    await clickButton('ホームへ');
    await home();
    await clickButton('分析を見る');
    await waitFor('document.querySelector(".analysis-highlight__versions")?.textContent.includes("v8 → v9")');
    check('空の配置でも0人・未算出を表示し、マップが崩れない', await client.evaluate(() => document.querySelector('.analysis-highlight').textContent.includes('—') && document.querySelector('.analysis-maps').textContent.includes('配置はありません')));
    check('0件の最新配置も初期選択・両方の選択肢に表示', await client.evaluate(() => document.querySelector('#analysis-before').value === 'analysis-v8' && document.querySelector('#analysis-after').value === 'analysis-v9' && ['#analysis-before','#analysis-after'].every(selector=>document.querySelector(selector).options.length === 9) && document.querySelector('.analysis-no-data').textContent.includes('この配置にはまだ観察データがありません')));
    await collectLayouts('analysis-empty-map');
    await clickButton('ホームへ');
    await home();
    await clickButton('ログアウト');
    await waitFor('document.querySelector("#login-email") && !document.querySelector("#login-email").disabled');
    const afterLogoutRequests = requests.length;
    await pause(200);
    check('ログアウト後に店舗UI・店舗データ通信が残らない',!await client.evaluate(()=>Boolean(document.querySelector('.home-actions'))) && requests.length===afterLogoutRequests);
    await client.send('Page.reload');
    await waitFor('document.querySelector("#login-email") && !document.querySelector("#login-email").disabled');
    check('ログアウト後の再読み込みでも店舗データを要求しない',requests.length===afterLogoutRequests);
    const anonymousRead = await fetch(baseUrl+'/rest/v1/rpc/get_layout_history',{method:'POST',headers:{apikey:'public-browser-test-key','Content-Type':'application/json'},body:'{}'});
    const anonymousSave = await fetch(baseUrl+'/rest/v1/rpc/save_observation',{method:'POST',headers:{apikey:'public-browser-test-key','Content-Type':'application/json'},body:JSON.stringify({p_observation:saves()[0].args.p_observation})});
    check('未ログイン・ログアウト後の観察APIは取得も保存も拒否',anonymousRead.status===401&&anonymousSave.status===401);
    await loginAs('unassigned@example.test');
    await waitFor('document.querySelector(".login-error")?.textContent.includes("所属店舗が設定されていません")');
    check('所属未登録は店舗画面を開けない',!await client.evaluate(()=>Boolean(document.querySelector('.home-actions'))));
    await clickButton('ログアウト');
    await loginAs('b@example.test');
    await waitFor('document.querySelector("h1")?.textContent==="別店舗" && !document.querySelector(".action-button--primary").disabled && document.querySelector(".status-badge")?.textContent.includes("日本時間")');
    await counts('0人,0人');
    check('店舗BにAの人数・最新配置を引き継がず独立したv1を表示',await client.evaluate(()=>document.querySelector('.version-badge').textContent==='v1'));
    await clickButton('配置履歴');
    await waitFor('document.querySelectorAll(".layout-history-card").length===1');
    check('店舗Bの履歴にAの9配置と変更理由が表示されない',await client.evaluate(()=>!document.querySelector('main').textContent.includes('新商品の露出を増やすため')));
    await clickButton('ホームへ');
    await waitFor('document.querySelector("h1")?.textContent==="別店舗"');
    await startObservation('001');
    await tapZone('sample-bags');
    await clickButton('非購入で終了');
    await waitFor('document.querySelector("h1")?.textContent==="別店舗" && document.querySelector(".summary-stat dd")?.textContent==="1人"');
    check('店舗Bの観察はBへ保存されAのデータに混入しない',saves().at(-1).args.p_observation.store_id===storeB && (await db.query('select store_id from public.observations where id=$1',[saves().at(-1).args.p_observation.id])).rows[0].store_id===storeB);
    const bSession = Array.from(sessions.values()).find(session=>session.user.id===userB);
    async function rpcAsB(name,args) {
      return fetch(baseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:'public-browser-test-key',Authorization:'Bearer '+bSession.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)});
    }
    check('ブラウザ用APIでも他店舗の観察保存を拒否',(await rpcAsB('save_observation',{p_observation:saves()[0].args.p_observation})).status===403);
    check('ブラウザ用APIでも分析RPCから他店舗を取得できない',(await rpcAsB('get_layout_analysis',{p_layout_ids:['analysis-v7','analysis-v8']})).status===403);
    await clickButton('ログアウト');
    await loginAs('a@example.test');
    await home();
    await clickButton('配置を変更');
    await clickButton('入口を追加');
    await fill('change-note','セッション切れでも編集を保持');
    layoutSaveMode='error';
    await clickButton('新しい配置として保存');
    await waitFor('document.querySelector(".editor-save-error")');
    const interruptedLayout = requests.filter(request=>request.pathname.endsWith('/save_layout_version')).at(-1).args;
    // Simulate Auth's session-expiry notification, without touching the real Supabase service.
    async function expireBrowserSession() {
      for (const [token,session] of sessions) if (session.user.id===userA) { sessions.delete(token); refreshTokens.delete(session.refresh_token); }
      await client.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.endsWith('-auth-token')); localStorage.removeItem(key); const channel=new BroadcastChannel(key); channel.postMessage({event:'SIGNED_OUT',session:null}); setTimeout(()=>channel.close(),100);});
      await waitFor('document.querySelector("#login-email") && !document.querySelector("#login-email").disabled');
    }
    await expireBrowserSession();
    await loginAs('a@example.test');
    await waitFor('document.querySelector("#change-note")?.value==="セッション切れでも編集を保持"');
    check('同じアカウントの再ログインで配置の編集・変更理由を復元',await client.evaluate(()=>document.querySelectorAll('.map-element').length===1));
    layoutSaveMode='success';
    await clickButton('新しい配置として保存');
    await home();
    check('再ログイン後の配置再試行でも同じ保存IDを使う',requests.filter(request=>request.pathname.endsWith('/save_layout_version')).at(-1).args.p_id===interruptedLayout.p_id);
    await startObservation('001');
    const entranceId = await client.evaluate(()=>document.querySelector('[data-zone-id]').dataset.zoneId);
    await tapZone(entranceId);
    saveMode='error';
    await clickButton('非購入で終了');
    await waitFor('document.querySelector(".observation-save-status__retry")');
    const interruptedObservation = saves().at(-1).args.p_observation;
    await expireBrowserSession();
    await loginAs('a@example.test');
    await waitFor('document.querySelector(".observation-save-status__retry")');
    check('同じアカウントの再ログインで観察データ・ルートを復元',await client.evaluate(()=>document.querySelector('main').textContent.includes('ルート 1か所'))&&JSON.stringify(saves().at(-1).args.p_observation)===JSON.stringify(interruptedObservation));
    saveMode='success';
    await clickButton('保存を再試行');
    await home();
    check('再ログイン後の観察再送でも記録を1件だけ保存',(await db.query('select count(*) as count from public.observations where id=$1',[interruptedObservation.id])).rows[0].count===1);
    await client.send('Page.navigate', { url: baseUrl + '/unconfigured' });
    await waitFor('document.querySelector(".login-error")?.textContent.includes("Supabaseが設定されていません")');
    const beforeUnconfigured = requests.length;
    check('未設定でもクラッシュせず案内を表示し店舗UIを開けない',await client.evaluate(()=>document.querySelector('h1').textContent==='ログイン'&&document.querySelector('.login-button').matches(':disabled')&&!document.querySelector('.home-actions')));
    await collectLayouts('unconfigured-login');
    check('未設定時は店舗データAPIを送信しない',requests.length===beforeUnconfigured);
    check('公開テストキーだけをAPIへ渡す', requests.every(request => request.key === 'public-browser-test-key'));
    check('ブラウザの実行エラーなし', client.errors.length === 0);
    const report={passedChecks:checks.length,failedChecks:checks.filter(check=>!check.passed),inputMeasurements,errors:client.errors,artifacts};
    fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({...report,checks,layouts},null,2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.stack);
    console.error('Browser artifacts: '+artifacts);
    if (client) {
      try {
        const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifacts,'failure.png'),Buffer.from(screenshot.data,'base64'));
        fs.writeFileSync(path.join(artifacts,'failure.txt'),await client.evaluate(()=>document.body.innerText));
      } catch {}
    }
    process.exitCode = 1;
  } finally {
    if (client) {
      try { await client.send('Browser.close'); } catch {}
      client.socket.close();
    }
    if (browser && browser.exitCode === null) browser.kill();
    server.close(); await db.close();
  }
})();
