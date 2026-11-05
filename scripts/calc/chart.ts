/**
 * 命令行排盘：给人看的一张盘。
 *
 * 用法：
 *   npx tsx scripts/calc/chart.ts --date 1990-05-12 --time 14:30 --gender male --lon 121.47
 *     [--city 上海] [--province 上海] [--no-tst] [--leap split|next-month|prev-month|current-month]
 *     [--late-zishi next-day|current-day|all-current] [--json out.json] [--out report.txt]
 */
import fs from 'node:fs';
import { generateChart } from '../../lib/ziwei/algorithm';
import {
  calculateTrueSolarTime,
  resolveZiweiDayOffset,
  shiftGregorianDate,
  formatTrueSolarClock,
  formatSignedMinutes,
} from '../../lib/ziwei/true-solar-time';
import { BRANCHES, STEMS } from '../../lib/ziwei/constants';
import { getSiHuaByStem, getYearStemIndex, getYearBranchIndex } from '../../lib/ziwei/sihua';
import type { LunarMonthPolicy } from '../../lib/ziwei/school-config';
import type { LateZishiRule } from '../../lib/ziwei/true-solar-time';
import type { ZiweiChart, Star } from '../../lib/ziwei/types';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return fallback;
  return v;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const dateStr = arg('date');
const timeStr = arg('time');
const gender = arg('gender') as 'male' | 'female' | undefined;
if (!dateStr || !timeStr || (gender !== 'male' && gender !== 'female')) {
  console.error('需要 --date YYYY-MM-DD --time HH:MM --gender male|female [--lon 经度]');
  process.exit(1);
}

const [year, month, day] = dateStr.split('-').map(Number);
const [clockHour, clockMinute] = timeStr.split(':').map(Number);

const longitudeArg = arg('lon');
const longitude = longitudeArg !== undefined && !flag('no-tst') ? Number(longitudeArg) : undefined;
const lateZishi = (arg('late-zishi', 'next-day') as LateZishiRule);
const leapMonth = arg('leap') as LunarMonthPolicy | undefined;

const solar = calculateTrueSolarTime({ year, month, day, clockHour, clockMinute, longitude });
const dayOffset = resolveZiweiDayOffset(solar, lateZishi);
const chartDate = shiftGregorianDate({ year, month, day }, dayOffset);

const chart: ZiweiChart = generateChart(
  {
    ...chartDate,
    hour: solar.branch,
    gender,
    name: arg('name'),
    province: arg('province'),
    city: arg('city'),
    longitude,
    origInput: { year, month, day, clockHour, clockMinute },
  },
  leapMonth ? { leapMonth } : undefined,
);

// ─────────── 输出缓冲 ───────────
const buf: string[] = [];
const L = (s = '') => buf.push(s);

/** 中文字符按 2 列宽计算，用于对齐 */
const width = (s: string) => [...s].reduce((a, c) => a + (/[\u1100-\uFFDC]/.test(c) ? 2 : 1), 0);
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - width(s)));

const KEY_LUCKY = ['左辅', '右弼', '天魁', '天钺', '文昌', '文曲', '禄存', '天马', '天钺'];
const KEY_SHA = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫', '天刑'];
const fmtStar = (s: Star) => `${s.name}${s.brightnessRaw ? `[${s.brightnessRaw}]` : ''}${s.siHua ? `化${s.siHua}` : ''}`;

L('═'.repeat(72));
L(`公历　　${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(clockHour).padStart(2, '0')}:${String(clockMinute).padStart(2, '0')}`);
if (solar.corrected) {
  L(`真太阳时 ${formatTrueSolarClock(solar, true)}（经度 ${longitude}°，经度差 ${formatSignedMinutes(solar.longitudeCorrectionMinutes)} 分，均时差 ${formatSignedMinutes(solar.equationOfTimeMinutes)} 分）`);
} else {
  L('真太阳时 未校正（按钟表时间排）');
}
L(`排盘日　${chartDate.year}-${String(chartDate.month).padStart(2, '0')}-${String(chartDate.day).padStart(2, '0')}　${BRANCHES[solar.branch]}时${dayOffset !== 0 ? `（晚子时换日 ${dayOffset > 0 ? '+' : ''}${dayOffset}）` : ''}`);
L(`性别　　${gender === 'male' ? '男' : '女'}　${chart.yinYangGender ?? ''}`);
L('─'.repeat(72));

const li = chart.lunarInfo;
L(`农历　　${li.lunarYear} 年 ${li.isLeapMonth ? '闰' : ''}${Math.abs(li.lunarMonth)} 月 ${li.lunarDay} 日　${STEMS[li.yearStem]}${BRANCHES[li.yearBranch]}年`);
if (li.fourPillars) L(`四柱　　${li.fourPillars.join('　')}　（节气柱）`);
if (li.fourPillarsLunar) L(`　　　　${li.fourPillarsLunar.join('　')}　（农历柱）`);
L(`五行局　${chart.wuxingJuName}`);
L(`命宫　　${BRANCHES[chart.mingGongBranch]}宫　　身宫 ${BRANCHES[chart.shenGongBranch]}宫　　紫微在${BRANCHES[chart.ziweiPos]}宫`);
L(`命主　　${chart.mingZhu ?? '-'}　　身主 ${chart.shenZhu ?? '-'}`);
L('─'.repeat(72));

const palaceAt = (branch: number) => chart.palaces.find((p) => p.branch === branch);
const COL = 34;

function cell(branch: number): string[] {
  const p = palaceAt(branch);
  if (!p) return [''];
  const lines: string[] = [];
  const tags: string[] = [];
  if (p.isMingGong) tags.push('命');
  if (p.isShenGong) tags.push('身');
  lines.push(`${p.name}${tags.length ? `·${tags.join('')}` : ''}　${STEMS[p.stem]}${BRANCHES[p.branch]}`);

  const major = p.stars.filter((s) => s.type === 'major');
  const lucky = p.stars.filter((s) => s.type !== 'major' && KEY_LUCKY.includes(s.name));
  const sha = p.stars.filter((s) => s.type !== 'major' && !KEY_LUCKY.includes(s.name) && KEY_SHA.includes(s.name));
  const rest = p.stars.filter((s) => s.type !== 'major' && !lucky.includes(s) && !sha.includes(s));

  if (p.isEmpty) lines.push(`〔空宫　借${p.borrowedFromName ?? ''}〕`);
  if (major.length) lines.push(major.map(fmtStar).join('　'));
  if (lucky.length) lines.push(lucky.map(fmtStar).join('　'));
  if (sha.length) lines.push(sha.map(fmtStar).join('　'));
  if (rest.length) {
    // 杂耀按列宽折行，避免撑破宫格
    let line = '·';
    for (const s of rest) {
      const piece = ` ${fmtStar(s)}`;
      if (width(line + piece) > COL - 1 && line !== '·') {
        lines.push(line);
        line = `·${piece}`;
      } else {
        line += piece;
      }
    }
    if (line !== '·') lines.push(line);
  }
  if (p.selfSihua?.length) lines.push(`自化 ${p.selfSihua.map((x) => `${x.starName}化${x.siHua}`).join(' ')}`);
  if (p.daXianAge) lines.push(`大限 ${p.daXianAge[0]}–${p.daXianAge[1]}`);
  return lines;
}

// 巳午未申 / 辰酉 / 卯戌 / 寅丑子亥，中心 2×2 合并
const yearSiHua = getSiHuaByStem(chart.lunarInfo.yearStem);
const center = [
  '紫微斗数 · 本命盘',
  '',
  `五行局　${chart.wuxingJuName}`,
  `命　宫　${BRANCHES[chart.mingGongBranch]}　　身　宫　${BRANCHES[chart.shenGongBranch]}`,
  `命　主　${chart.mingZhu ?? '-'}　　身　主　${chart.shenZhu ?? '-'}`,
  `生年四化　${STEMS[chart.lunarInfo.yearStem]}${BRANCHES[chart.lunarInfo.yearBranch]}年`,
  `　禄${yearSiHua['禄']}　权${yearSiHua['权']}　科${yearSiHua['科']}　忌${yearSiHua['忌']}`,
];

const top = [cell(5), cell(6), cell(7), cell(8)];
const left1 = cell(4);
const right1 = cell(9);
const left2 = cell(3);
const right2 = cell(10);
const bottom = [cell(2), cell(1), cell(0), cell(11)];

const CW = COL * 2 + 1;
const h1 = Math.max(left1.length, right1.length, Math.ceil(center.length / 2));
const h2 = Math.max(left2.length, right2.length, center.length - h1);

function renderRow(cells: string[][], height: number) {
  for (let h = 0; h < height; h++) L(cells.map((c) => pad(c[h] ?? '', COL)).join('│'));
}

// 第一行
{
  const height = Math.max(...top.map((c) => c.length));
  renderRow(top, height);
}
L('─'.repeat(COL * 4 + 3));
// 第二行（左 + 中宫上半 + 右）
for (let h = 0; h < h1; h++) {
  L(`${pad(left1[h] ?? '', COL)}│${pad(center[h] ?? '', CW)}│${pad(right1[h] ?? '', COL)}`);
}
L(`${'─'.repeat(COL)}│${' '.repeat(CW)}│${'─'.repeat(COL)}`);
// 第三行（左 + 中宫下半 + 右）
for (let h = 0; h < h2; h++) {
  L(`${pad(left2[h] ?? '', COL)}│${pad(center[h1 + h] ?? '', CW)}│${pad(right2[h] ?? '', COL)}`);
}
L('─'.repeat(COL * 4 + 3));
// 第四行
{
  const height = Math.max(...bottom.map((c) => c.length));
  renderRow(bottom, height);
}

L('─'.repeat(72));
L('大限（每十年一宫）：');
chart.daXians.forEach((d, i) => {
  const mark = d.startAge <= chart.currentAge && chart.currentAge <= d.endAge ? ' ←当前' : '';
  const pal = chart.palaces.find((p) => p.branch === d.palaceBranch);
  const stem = pal ? STEMS[pal.stem] : '';
  const sh = pal ? getSiHuaByStem(pal.stem) : null;
  L(
    `　${String(d.startAge).padStart(2)}–${String(d.endAge).padStart(3)} 岁　${d.palaceName}${d.palaceName.endsWith('宫') ? '' : '宫'} ${stem}${BRANCHES[d.palaceBranch]}` +
      (sh ? `　禄:${sh['禄']}　权:${sh['权']}　科:${sh['科']}　忌:${sh['忌']}` : '') +
      mark,
  );
});
L('─'.repeat(72));

// 流年（今年）
const thisYear = Number(arg('year', String(new Date().getFullYear())));
const lnStem = getYearStemIndex(thisYear);
const lnSiHua = getSiHuaByStem(lnStem);
const lnZhi = getYearBranchIndex(thisYear);
L(`流年 ${thisYear} ${STEMS[lnStem]}${BRANCHES[lnZhi]}年（虚岁 ${thisYear - chart.birthInfo.year + 1}）`);
L(`　流年命宫　${BRANCHES[lnZhi]}宫 = ${palaceAt(lnZhi)?.name ?? '-'}`);
L(`　流年四化　禄${lnSiHua['禄']}　权${lnSiHua['权']}　科${lnSiHua['科']}　忌${lnSiHua['忌']}`);
for (const [hua, star] of Object.entries(lnSiHua)) {
  const where = chart.palaces.filter((p) => p.stars.some((s) => s.name === star));
  L(`　　${hua} ${star} → ${where.length ? where.map((p) => `${p.name}(${BRANCHES[p.branch]})`).join('、') : '不在盘上（借对宫看）'}`);
}
L('─'.repeat(72));

const report = buf.join('\n');
console.log(report);

const out = arg('out');
if (out) fs.writeFileSync(out, report, 'utf8');
const jsonOut = arg('json');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(chart, null, 2), 'utf8');
