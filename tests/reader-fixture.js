// Browser test for the TradingView reader. It runs content/tradingview-reader.js on a fake
// TradingView watchlist (tests/fixtures/tradingview-watchlist.html) in headless Chrome.
// The fake list draws only the rows in view, like TradingView. Run: npm run test:reader
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

const EXPECT = '###WEEKLY,NSE:DCMSRIND,NSE:PCJEWELLER,###MONTHLY,NSE:SHANTIGOLD,NSE:SKYGOLD,NSE:SSWL,NSE:ORIENTCABL,###QUATERLY,NSE:RATNAVEER,NSE:TFCILTD,NSE:RAYMOND,NSE:TECHNOCRAF,NSE:MARINE,NSE:INDOMIM,NSE:DHOOTTRANS,NSE:MOLBIO,NSE:SHUKRAPHAR,NSE:MVELECTRO,NSE:KROSS,NSE:WELCORP,NSE:CYIENT,NSE:CUPID,NSE:SHILPAMED,NSE:MANINDS,NSE:STEAMHOUSE,NSE:PVRINOX,NSE:REDINGTON,NSE:RBA,NSE:SAMBHV,###SEMI ANNUALLY,NSE:FCL,NSE:CYIENTDLM,NSE:IBULLSLTD,NSE:IOLCP,NSE:SHADOWFAX,NSE:AEGISLOG,NSE:ANTELOPUS,NSE:LAURUSLABS,NSE:CEMPRO,NSE:AVALON,NSE:PAISALO,NSE:GRWRHITECH,NSE:CARTRADE,NSE:OPTIEMUS,NSE:CPPLUS,NSE:KISSHT,NSE:GLAND,NSE:COFORGE,NSE:SANSERA,NSE:WELSPUNLIV,NSE:OMNI,NSE:RUBICON,NSE:ATHERENERG,NSE:AEROFLEX,NSE:RRKABEL';

const CASES = [
  { name: 'fast drawing', query: '?delay=0', check: (r) => r.ok && r.out.text === EXPECT && r.out.skipped.join() === 'BSE:500325' },
  { name: 'slow drawing (900 ms)', query: '?delay=900', check: (r) => r.ok && r.out.text === EXPECT },
  { name: 'collapsed section', query: '?collapsed=MONTHLY', check: (r) => r.ok && r.out.collapsed.join() === 'MONTHLY' && r.out.text.startsWith('###WEEKLY,NSE:DCMSRIND,NSE:PCJEWELLER,###MONTHLY,###QUATERLY,') },
  { name: 'panel closed', query: '?closed=1', check: (r) => r.ok === false && r.error === 'panel-closed' },
];

if (!CHROME) {
  console.log('SKIP: no Chrome or Edge found. Set CHROME=<path>.');
  process.exit(0);
}

const server = http
  .createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'text/javascript' });
      res.end(data);
    });
  })
  .listen(0, () => {
    const port = server.address().port;
    let failed = 0;
    for (const c of CASES) {
      const url = `http://localhost:${port}/tests/fixtures/run-reader.html${c.query}`;
      const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=120000', '--window-size=1200,800', '--dump-dom', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
      let r = null;
      try {
        r = JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
      } catch (e) {
        r = null;
      }
      const ok = !!r && c.check(r);
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}${ok ? '' : `\n     ${m ? m[1].slice(0, 400) : 'no output'}`}`);
    }
    server.close();
    process.exit(failed ? 1 : 0);
  });
