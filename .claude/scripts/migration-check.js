// 개발 도구 이사(M1) 확인 스크립트 — 사이트·계산 파일이 바뀌지 않았는지 기록하고 비교한다.
// 설정: 같은 폴더의 migration-check.json
// 사용법 (저장소 맨 위 폴더에서):
//   node .claude/scripts/migration-check.js record <이름>         계산 파일·안티그래비티 파일·주요 주소 해시를 .claude/tmp/migration-<이름>.json에 기록
//   node .claude/scripts/migration-check.js compare <이름1> <이름2> 두 기록을 비교 (다르면 실패)
//   node .claude/scripts/migration-check.js setup                  CLAUDE.md·명령어·허락 설정·바뀐 파일 점검
//   node .claude/scripts/migration-check.js exposure               사이트에서 /CLAUDE.md, /.claude/settings.json 이 열리지 않는지 확인
//   node .claude/scripts/migration-check.js wait-deploy <커밋>      GitHub에 올라오는 Cloudflare 배포 결과를 기다림 (최대 10분)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP = path.join(ROOT, '.claude', 'tmp');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'migration-check.json'), 'utf8'));

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const git = (args) => execSync(`git -c core.quotepath=false ${args}`, { cwd: ROOT, encoding: 'utf8' }).trimEnd();
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function listFiles(entry) {
  const abs = path.join(ROOT, entry);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [abs];
  const out = [];
  for (const name of fs.readdirSync(abs)) out.push(...listFiles(path.join(entry, name)));
  return out;
}

function hashEntries(entries) {
  const result = {};
  for (const entry of entries) {
    for (const file of listFiles(entry)) result[rel(file)] = sha256(fs.readFileSync(file));
  }
  return result;
}

// 사이트 주소: data/site.json의 site_url이 있으면 그것, 없으면 설정 파일의 siteUrl
function siteUrl() {
  const siteJson = path.join(ROOT, 'data', 'site.json');
  if (fs.existsSync(siteJson)) {
    let raw = fs.readFileSync(siteJson, 'utf8').replace(/^﻿/, '');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      raw = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      data = JSON.parse(raw);
    }
    if (data.site_url) return data.site_url.replace(/\/+$/, '');
  }
  return (config.siteUrl || '').replace(/\/+$/, '');
}

async function getUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
    const body = Buffer.from(await res.arrayBuffer());
    return { status: res.status, location: res.headers.get('location') || '', bytes: body.length, hash: sha256(body) };
  } catch (e) {
    return { status: 0, location: '', bytes: 0, hash: '', error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function record(label) {
  if (!label) throw new Error('기록 이름이 필요합니다. 예: record before');
  const base = siteUrl();
  const urls = {};
  for (const p of config.paths || []) urls[p] = await getUrl(base + p);
  const data = {
    label,
    time: new Date().toISOString(),
    commit: git('rev-parse HEAD'),
    siteUrl: base,
    protectedFiles: hashEntries(config.protected || []),
    agentFiles: hashEntries(['AGENTS.md', '.agents', '.agent']),
    urls
  };
  fs.mkdirSync(TMP, { recursive: true });
  const out = path.join(TMP, `migration-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`기록 저장: ${rel(out)} (커밋 ${data.commit.slice(0, 7)})`);
  console.log(`- 보호 파일 ${Object.keys(data.protectedFiles).length}개, 안티그래비티 파일 ${Object.keys(data.agentFiles).length}개`);
  for (const [p, r] of Object.entries(urls)) {
    console.log(`- ${base}${p} → ${r.status}${r.location ? ' → ' + r.location : ''} ${r.bytes}B ${r.hash.slice(0, 12)}${r.error ? ' 오류: ' + r.error : ''}`);
  }
}

function compareMaps(title, a, b) {
  let ok = true;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const same = JSON.stringify(a[k]) === JSON.stringify(b[k]);
    if (!same) {
      ok = false;
      console.log(`  ✗ ${title} ${k}: ${a[k] ? 'before' : '없음'} → ${b[k] ? 'after' : '없음'} 다름`);
    }
  }
  console.log(`${ok ? '✓' : '✗'} ${title}: ${keys.length}개 ${ok ? '모두 같음' : '다름 있음'}`);
  return ok;
}

function compare(labelA, labelB) {
  const load = (l) => JSON.parse(fs.readFileSync(path.join(TMP, `migration-${l}.json`), 'utf8'));
  const a = load(labelA);
  const b = load(labelB);
  const pick = (u) => Object.fromEntries(Object.entries(u).map(([k, v]) => [k, { status: v.status, location: v.location, hash: v.hash }]));
  let ok = compareMaps('보호 파일', a.protectedFiles, b.protectedFiles);
  ok = compareMaps('안티그래비티 파일', a.agentFiles, b.agentFiles) && ok;
  ok = compareMaps('사이트 주소', pick(a.urls), pick(b.urls)) && ok;
  for (const [p, r] of Object.entries(b.urls)) {
    if (!r.status) { ok = false; console.log(`  ✗ ${p} 접속 실패: ${r.error}`); }
  }
  console.log(ok ? '결과: 통과' : '결과: 실패');
  process.exitCode = ok ? 0 : 1;
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

function setup() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });

  // 1) CLAUDE.md 줄 수와 @ 불러오기
  const claudePath = path.join(ROOT, 'CLAUDE.md');
  const claude = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8') : '';
  const lines = claude.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  check('CLAUDE.md 200줄 이하', claude && lines.length <= 200, `${lines.length}줄`);
  const imports = lines.filter((l) => /^@\S+/.test(l)).map((l) => l.slice(1).trim());
  const missing = imports.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  check('@로 불러오는 파일 모두 있음', missing.length === 0, imports.length ? `${imports.join(', ')}${missing.length ? ' / 없음: ' + missing.join(', ') : ''}` : '불러오기 없음');

  // 2) 명령어(스킬) 개수 = 원본 워크플로 개수
  const wfDir = config.workflowsDir ? path.join(ROOT, config.workflowsDir) : null;
  const workflows = wfDir && fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => f.endsWith('.md')).sort() : [];
  const skillsDir = path.join(ROOT, '.claude', 'skills');
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((d) => fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))).sort() : [];
  check('명령어 개수 = 원본 워크플로 개수', skills.length === workflows.length, `명령어 ${skills.length}개 / 워크플로 ${workflows.length}개`);
  const skillProblems = [];
  for (const wf of workflows) {
    const name = wf.replace(/\.md$/, '');
    const skillFile = path.join(skillsDir, name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) { skillProblems.push(`${name}: SKILL.md 없음`); continue; }
    const text = fs.readFileSync(skillFile, 'utf8');
    const fm = frontmatter(text) || {};
    if (fm.name !== name) skillProblems.push(`${name}: name 불일치`);
    if (!/^[a-z0-9-]+$/.test(fm.name || '')) skillProblems.push(`${name}: name 형식`);
    if (!fm.description) skillProblems.push(`${name}: description 없음`);
    if (fm['disable-model-invocation'] !== 'true') skillProblems.push(`${name}: disable-model-invocation 아님`);
    if (!text.includes(`${config.workflowsDir}/${wf}`)) skillProblems.push(`${name}: 원본 경로 안내 없음`);
  }
  check('명령어 파일 형식(name·description·수동 실행·원본 경로)', skillProblems.length === 0, skillProblems.join('; ') || (skills.length ? skills.map((s) => '/' + s).join(' ') : '해당 없음'));

  // 3) 허락 설정
  let settingsOk = false;
  let settingsDetail = '';
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
    const allow = s.permissions.allow;
    const deny = s.permissions.deny;
    const need = ['Bash(git push *--force*)', 'Bash(git reset --hard*)', 'Bash(rm -rf *)', 'PowerShell(Remove-Item *-Rec*)', 'Read(.env)'];
    const lack = need.filter((r) => !deny.includes(r));
    settingsOk = Array.isArray(allow) && lack.length === 0;
    settingsDetail = `허용 ${allow.length}개, 금지 ${deny.length}개${lack.length ? ' / 빠짐: ' + lack.join(', ') : ''}`;
  } catch (e) {
    settingsDetail = e.message;
  }
  check('.claude/settings.json 형식·금지 규칙', settingsOk, settingsDetail);

  // 4) .gitignore와 배포 제외
  const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
  const giNeed = ['.claude/settings.local.json', '.claude/tmp/', 'CLAUDE.local.md'].filter((e) => !gi.includes(e));
  check('.gitignore 3줄 추가', giNeed.length === 0, giNeed.length ? '빠짐: ' + giNeed.join(', ') : '있음');
  if (config.deployIgnoreFile) {
    const di = fs.existsSync(path.join(ROOT, config.deployIgnoreFile)) ? fs.readFileSync(path.join(ROOT, config.deployIgnoreFile), 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
    const diNeed = ['CLAUDE.md', '.claude/'].filter((e) => !di.includes(e));
    check(`배포 제외(${config.deployIgnoreFile})`, diNeed.length === 0, diNeed.length ? '빠짐: ' + diNeed.join(', ') : 'CLAUDE.md, .claude/ 있음');
  } else if (config.deployNote) {
    check('배포 제외', true, config.deployNote);
  }

  // 5) 바뀐 파일 (GitHub main 대비, 커밋 전 변경 포함)
  const changed = new Set(git('diff --name-only origin/main').split(/\r?\n/).filter(Boolean));
  for (const line of git('status --porcelain --untracked-files=all').split(/\r?\n/).filter(Boolean)) changed.add(line.slice(3).replace(/^"|"$/g, ''));
  const allowed = (f) => f === 'CLAUDE.md' || f.startsWith('.claude/') || f === '.gitignore' || f === 'CHANGELOG.md' ||
    (config.deployIgnoreFile && f === config.deployIgnoreFile) || (config.extraAllowed || []).includes(f);
  const bad = [...changed].filter((f) => !allowed(f));
  check('바뀐 파일이 허용 목록뿐', bad.length === 0, `${changed.size}개${bad.length ? ' / 허용 밖: ' + bad.join(', ') : ''}`);
  const agentChanged = [...changed].filter((f) => f === 'AGENTS.md' || f.startsWith('.agents/') || f.startsWith('.agent/'));
  check('AGENTS.md·.agents/·.agent/ 변경 0', agentChanged.length === 0, agentChanged.join(', ') || '0개');

  // 6) 비밀값 의심
  const secretName = /(^|\/)\.env(\.|$)|\.pem$|\.key$|id_rsa|credentials/i;
  const secretText = /(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35})/;
  const suspects = [];
  for (const f of changed) {
    const abs = path.join(ROOT, f);
    if (f.startsWith('.claude/tmp/')) continue;
    if (secretName.test(f)) suspects.push(f);
    else if (fs.existsSync(abs) && fs.statSync(abs).isFile() && secretText.test(fs.readFileSync(abs, 'utf8'))) suspects.push(f);
  }
  check('비밀값 의심 0', suspects.length === 0, suspects.join(', ') || '0개');

  // 7) 작성자 설정
  const name = git('config --local user.name');
  const email = git('config --local user.email');
  check('저장소 작성자 설정 Moow-ui', name === 'Moow-ui' && /^\d+\+Moow-ui@users\.noreply\.github\.com$/.test(email), `${name} <${email}>`);

  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`);
  const ok = results.every((r) => r.ok);
  console.log(ok ? '결과: 통과' : '결과: 실패');
  process.exitCode = ok ? 0 : 1;
}

async function exposure() {
  const base = siteUrl();
  if (!base) { console.log('사이트 없음 — 해당 없음'); return; }
  const stamp = Date.now();
  const home = await getUrl(`${base}/?mc=${stamp}`);
  let ok = true;
  for (const p of ['/CLAUDE.md', '/.claude/settings.json']) {
    const r = await getUrl(`${base}${p}?mc=${stamp}`);
    let verdict;
    if (r.status === 404) verdict = '✓ 404';
    else if (config.spa && r.status === 200 && r.hash === home.hash) verdict = '✓ 파일 없음(단일 페이지 앱이라 메인 화면이 나옴)';
    else { verdict = `✗ ${r.status} ${r.bytes}B`; ok = false; }
    console.log(`${verdict} ${base}${p}`);
  }
  console.log(ok ? '결과: 통과' : '결과: 실패');
  process.exitCode = ok ? 0 : 1;
}

async function waitDeploy(sha) {
  if (!sha) throw new Error('커밋 번호가 필요합니다.');
  const url = `https://api.github.com/repos/${config.repo}/commits/${sha}/check-runs`;
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'albaboss-migration-check' } });
      const data = await res.json();
      const runs = (data.check_runs || []).filter((r) => /Workers Builds/i.test(r.name));
      if (runs.length && runs.every((r) => r.status === 'completed')) {
        for (const r of runs) console.log(`${r.conclusion === 'success' ? '✓' : '✗'} ${r.name}: ${r.conclusion} (${r.completed_at})`);
        process.exitCode = runs.every((r) => r.conclusion === 'success') ? 0 : 1;
        return;
      }
      console.log(`대기 중… ${Math.round((Date.now() - start) / 1000)}초 (${runs.map((r) => r.status).join(', ') || '배포 시작 전'})`);
    } catch (e) {
      console.log(`확인 실패, 다시 시도: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 20000));
  }
  console.log('✗ 10분 안에 배포가 끝나지 않았습니다.');
  process.exitCode = 1;
}

const [cmd, a, b] = process.argv.slice(2);
const actions = { record: () => record(a), compare: () => compare(a, b), setup, exposure, 'wait-deploy': () => waitDeploy(a) };
if (!actions[cmd]) {
  console.log('사용법: record <이름> | compare <이름1> <이름2> | setup | exposure | wait-deploy <커밋>');
  process.exitCode = 1;
} else {
  Promise.resolve(actions[cmd]()).catch((e) => { console.error('오류:', e.message); process.exitCode = 1; });
}
