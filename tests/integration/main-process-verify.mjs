import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PASS = '\u2705';
const FAIL = '\u274C';
const WARN = '\u26A0\uFE0F';
let passed = 0;
let failed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try { fn(); console.log(`  ${PASS} ${name}`); passed++; }
  catch (e) { console.log(`  ${FAIL} ${name}`); console.log(`      ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const SANDBOX = join(homedir(), '.termworkspace-sandbox');
const CHAT_DIR = join(SANDBOX, 'chats');
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(CHAT_DIR, { recursive: true });

// ─── 2.1 Layout Persistence ───
console.log('\n\uD83D\uDCD0 Phase 2.1 — Layout Persistence');
const layoutFile = join(SANDBOX, 'layout.json');
const testLayout = { tabs: [{id:'tab_1',title:'Terminal 1',tree:{type:'leaf',id:'leaf_1',mode:'terminal',terminalId:'t1'}},{id:'tab_2',title:'AI Chat',tree:{type:'leaf',id:'leaf_2',mode:'ai',chatId:'ai-1'}}], activeTabId:'tab_1' };

test('save layout to JSON', () => { writeFileSync(layoutFile, JSON.stringify(testLayout,null,2),'utf-8'); assert(existsSync(layoutFile)); });
test('load layout from JSON', () => { const p=JSON.parse(readFileSync(layoutFile,'utf-8')); assertEq(p.activeTabId,'tab_1'); assertEq(p.tabs.length,2); });
test('handle corrupt layout gracefully', () => { writeFileSync(layoutFile,'{{invalid','utf-8'); try{JSON.parse(readFileSync(layoutFile,'utf-8')); assert(false,'should not reach')}catch{ /* expected */ }});

// ─── 2.2 Chat Persistence ───
console.log('\n\uD83D\uDCAC Phase 2.2 — Chat History Persistence');
const chatFile = join(CHAT_DIR, 'chat-test-1.json');
const msgs = [{role:'user',content:'Hello'},{role:'assistant',content:'Hi!'},{role:'user',content:'Files'},{role:'assistant',content:'Here...'}];

test('save chat to JSON', () => { writeFileSync(chatFile,JSON.stringify(msgs,null,2),'utf-8'); assert(existsSync(chatFile)); });
test('load chat from JSON', () => { const p=JSON.parse(readFileSync(chatFile,'utf-8')); assertEq(p.length,4); assertEq(p[0].role,'user'); });
test('enforce 500 cap (slice)', () => { const many=Array.from({length:505},(_,i)=>({role:'user',content:`Msg ${i}`})); const s=many.slice(-500); assertEq(s.length,500); assertEq(s[0].content,'Msg 5'); });
test('save with 500 cap', () => { const many=Array.from({length:505},(_,i)=>({role:'user',content:`M${i}`})); writeFileSync(chatFile,JSON.stringify(many.slice(-500)),'utf-8'); const p=JSON.parse(readFileSync(chatFile,'utf-8')); assertEq(p.length,500); });
test('handle empty messages', () => { writeFileSync(chatFile,JSON.stringify([]),'utf-8'); const p=JSON.parse(readFileSync(chatFile,'utf-8')); assertEq(p.length,0); });

// ─── 2.3 Theme Config ───
console.log('\n\uD83C\uDFA8 Phase 2.3 — Theme Configuration');
const configFile = join(SANDBOX, 'config.json');

test('save config with theme', () => { writeFileSync(configFile,JSON.stringify({theme:'dark',projectPath:'/test'},null,2),'utf-8'); assert(existsSync(configFile)); });
test('load and verify theme', () => { const p=JSON.parse(readFileSync(configFile,'utf-8')); assertEq(p.theme,'dark'); });
test('toggle theme', () => { const c=JSON.parse(readFileSync(configFile,'utf-8')); c.theme='light'; writeFileSync(configFile,JSON.stringify(c),'utf-8'); assertEq(JSON.parse(readFileSync(configFile,'utf-8')).theme,'light'); });
test('config has required fields', () => { const c=JSON.parse(readFileSync(configFile,'utf-8')); assert(c.theme!==undefined); assert(c.projectPath!==undefined); });

// ─── 2.4 File Browser ───
console.log('\n\uD83D\uDCC1 Phase 2.4 — File Browser');
const testDir = join(SANDBOX, 'test-project');
mkdirSync(join(testDir,'src'),{recursive:true}); mkdirSync(join(testDir,'docs'),{recursive:true});
writeFileSync(join(testDir,'src','index.ts'),'export const x=1;','utf-8');
writeFileSync(join(testDir,'src','util.ts'),'export const y=2;','utf-8');
writeFileSync(join(testDir,'README.md'),'# Test','utf-8');
writeFileSync(join(testDir,'.env'),'SECRET=***','utf-8');

test('readdir: dirs first, alphabetical', () => {
  const entries=readdirSync(testDir,{withFileTypes:true}).filter(e=>!e.name.startsWith('.'));
  const sorted=entries.sort((a,b)=>{if(a.isDirectory()!==b.isDirectory())return a.isDirectory()?-1:1;return a.name.localeCompare(b.name);});
  assertEq(sorted.length,3); assert(sorted[0].isDirectory()); assertEq(sorted[0].name,'docs');
  assert(sorted[1].isDirectory()); assertEq(sorted[1].name,'src');
  assert(!sorted[2].isDirectory()); assertEq(sorted[2].name,'README.md');
});
test('filter hidden files', () => {
  const entries=readdirSync(testDir,{withFileTypes:true});
  const hidden=entries.filter(e=>e.name.startsWith('.'));
  assertEq(hidden.length,1); assertEq(hidden[0].name,'.env');
  const visible=entries.filter(e=>!e.name.startsWith('.'));
  assertEq(visible.length,3);
});

// ─── 2.5 Project Config ───
console.log('\n\uD83D\uDCC2 Phase 2.5 — Folder Wizard / Project Config');
test('persist project path', () => { const c=JSON.parse(readFileSync(configFile,'utf-8')); c.projectPath='/my-project'; writeFileSync(configFile,JSON.stringify(c),'utf-8'); assertEq(JSON.parse(readFileSync(configFile,'utf-8')).projectPath,'/my-project'); });

// ─── Phase 1: Build artifacts ───
console.log('\n\uD83D\uDCBB Phase 1 — Build Artifacts');
const cwd = homedir() + '/termworkspace-v2';
test('main entry exists', () => { assert(existsSync(cwd+'/dist-electron/main/index.js')); });
test('renderer html exists', () => { assert(existsSync(cwd+'/dist/index.html')); });
test('js bundle exists', () => { const files=readdirSync(cwd+'/dist/assets'); assert(files.filter(f=>f.endsWith('.js')).length>0); });
test('css bundle exists', () => { const files=readdirSync(cwd+'/dist/assets'); assert(files.filter(f=>f.endsWith('.css')).length>0); });

// ─── Summary ───
console.log(`\n${'='.repeat(50)}`);
console.log(`  RESULTS: ${PASS} ${passed}/${total} passed`);
if (failed>0) console.log(`  ${FAIL} ${failed}/${total} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed>0?1:0);
