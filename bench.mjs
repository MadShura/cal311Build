// 串行基准测试: 对 src / src1 / src2 / src3 逐个运行, 记录「耗时」与「峰值内存」.
//
// 用法 (一次只起一个被测进程, 严格串行, 绝不并行 —— 避免内存叠加):
//   node bench.mjs --only src-cold     单独跑一个用例
//   node bench.mjs --only src-warm
//   node bench.mjs --only src1 / src2 / src3
//   node bench.mjs --all               按顺序一个一个跑完全部用例
//   node bench.mjs --report            打印已记录结果的对比表
//   node bench.mjs --only <id> --force 覆盖已有记录重跑
//
// 用例设计依据(已核对 4 个 runApp):
//   · src       : 先 getBestGold()/readFileSync 读上次结果当剪枝上界 → 需要「无结果」与「读结果」两次
//   · src1/src2 : runApp 只有 init(), 不读结果, 每次都从 0 开始 → 各一次
//   · src3      : 不读不写文件 → 一次
//
// 测量口径:
//   · 耗时     = 从 spawn 到进程 close 的墙钟时间(含 pnpm/tsx 启动开销, 各用例一致)
//   · 峰值内存 = 通过 NODE_OPTIONS 注入探针, 每个 node 进程退出时打印自身
//                process.resourceUsage().maxRSS (KB). 取所有进程中的最大值作为主指标,
//                同时记录各进程峰值之和作为上界. 计算进程占绝对主导.
//   · 结果增量写入 bench-result.json, 中途失败不丢已完成数据.
import {spawn} from "node:child_process";
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";

const ROOT = import.meta.dirname;
const RESULT_FILE = join(ROOT,"bench-result.json");
const BACKUP_DIR = join(ROOT,".bench-backup");
const ORIG_DIR = join(BACKUP_DIR,"original");
const COLD_DIR = join(BACKUP_DIR,"cold");
const SRC_LOG = join(ROOT,"src","_gen-result.log");
const SRC_JSON = join(ROOT,"src","_gen-result.json");
const BACKUP_PAIRS = [[SRC_LOG,"_gen-result.log"],[SRC_JSON,"_gen-result.json"]];

// 注入到每个 node 进程的探针: 退出时把自身峰值 RSS(KB) 打到 stderr
const PROBE_URL = "data:text/javascript,process.on('exit',()=>process.stderr.write('__BENCH_RSS_KB__'+process.resourceUsage().maxRSS+'\\n'))";
const PROBE_FLAG = `--import ${PROBE_URL}`;

// 单个用例超时, 防止某算法不收敛时整个测试挂死
const TASK_TIMEOUT_MS = 8 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;

const TASKS = [
  {id: "src-cold",label: "src 第1次(无结果)",entry: "src/index.ts",pre: "clear"},
  {id: "src-warm",label: "src 第2次(读结果)",entry: "src/index.ts",pre: "restore"},
  {id: "src1",label: "src1",entry: "src1/index.ts",pre: "none"},
  {id: "src2",label: "src2",entry: "src2/index.ts",pre: "none"},
  {id: "src3",label: "src3",entry: "src3/index.ts",pre: "none"}
];

function loadResults () {
  if (!existsSync(RESULT_FILE)) {return {};}
  try {
    return JSON.parse(readFileSync(RESULT_FILE,"utf8"));
  } catch {
    return {};
  }
}
function saveResults (r) {
  writeFileSync(RESULT_FILE,`${JSON.stringify(r,null,2)}\n`,"utf8");
}
function backupTo (dir) {
  mkdirSync(dir,{recursive: true});
  for (const [src,name] of BACKUP_PAIRS) {
    const dst = join(dir,name);
    if (existsSync(src)) {
      copyFileSync(src,dst);
    } else {
      rmSync(dst,{force: true});
    }
  }
}
function restoreFrom (dir) {
  let count = 0;
  for (const [src,name] of BACKUP_PAIRS) {
    const bak = join(dir,name);
    if (existsSync(bak)) {
      copyFileSync(bak,src);
      count++;
    } else {
      rmSync(src,{force: true});
    }
  }
  return count;
}

// 准备用例的起跑条件, 返回「开始前结果文件是否存在」
function prepare (task) {
  if (task.pre === "clear") {
    const hadResult = BACKUP_PAIRS.some(([src]) => existsSync(src));
    // 先原样备份用户可能已有的结果文件, 绝不做不可恢复的删除
    backupTo(ORIG_DIR);
    for (const [src] of BACKUP_PAIRS) {rmSync(src,{force: true});}
    rmSync(COLD_DIR,{force: true,recursive: true});
    console.log(`[准备] ${task.id}: 已清空 src/_gen-result.* (原有文件已备份到 ${ORIG_DIR}, 原有=${hadResult.toString()})`);
    return {resultFileBefore: false,hadOriginalResult: hadResult};
  }
  if (task.pre === "restore") {
    // 优先用「第1次跑出来的结果」, 没有则退回用户原始文件
    let source = COLD_DIR;
    let n = restoreFrom(COLD_DIR);
    if (n === 0) {
      source = ORIG_DIR;
      n = restoreFrom(ORIG_DIR);
    }
    const ok = BACKUP_PAIRS.every(([src]) => existsSync(src));
    console.log(`[准备] ${task.id}: 已恢复结果文件 (来源=${source}, 文件数=${n.toString()}, 可读=${ok.toString()})`);
    return {resultFileBefore: ok,restoreSource: source};
  }
  return {resultFileBefore: undefined};
}

function parseInitialBestGold (out) {
  // src: "最大经济: 3610"; src1/src2: "最大经济(初始): 0"; src3 无
  const m = /最大经济(?:\(初始\))?:\s*(\d+)/.exec(out);
  return m ? Number(m[1]) : null;
}
function parseFinalGold (out) {
  // src/src1/src2 用「更好结果 最终金额 X」逐次刷新; src3 用「最大经济 V(initStat): X」
  // 取所有候选的最大值, 即该次运行算出的最终最大经济.
  const cands = [];
  for (const m of out.matchAll(/更好结果 最终金额 (\d+)/g)) {cands.push(Number(m[1]));}
  for (const m of out.matchAll(/最大经济[^\d]*?(\d+)/g)) {cands.push(Number(m[1]));}
  return cands.length ? Math.max(...cands) : null;
}

function runTask (task) {
  return new Promise(resolve => {
    const pre = prepare(task);
    const baseOpts = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : "";
    const child = spawn("pnpm",["--config.verify-deps-before-run=false","exec","tsx",task.entry],{
      cwd: ROOT,
      env: {...process.env,NODE_OPTIONS: `${baseOpts}${PROBE_FLAG}`},
      shell: true,
      windowsHide: true
    });
    const t0 = Date.now();
    let out = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      console.log(`[超时] ${task.id} 超过 ${(TASK_TIMEOUT_MS / 1000).toString()}s, 终止进程树`);
      // Windows: /T 连同子进程一起结束
      spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{shell: true,windowsHide: true});
      child.kill();
    },TASK_TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      console.log(`[心跳] ${task.id} 仍在运行, 已 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    },HEARTBEAT_MS);

    const onData = buf => {
      const s = buf.toString("utf8");
      out += s; // 完整输出保留用于解析
      // 转发时过滤每 100 万次打印一次的剪枝统计块, 避免刷屏
      const cleaned = s
        .replace(/__BENCH_RSS_KB__\d+\s*/g,"")
        .split("\n")
        .filter(line => !/^========== 剪枝统计/.test(line.trim()))
        .filter(line => !/^第 \d+ 层缓存的大小是/.test(line.trim()))
        .filter(line => !/^\S+: \d+ 次$/.test(line.trim()))
        .join("\n");
      if (cleaned.trim()) {process.stdout.write(cleaned);}
    };
    child.stdout?.on("data",onData);
    child.stderr?.on("data",onData);

    child.on("close",code => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      const elapsedMs = Date.now() - t0;
      // 针对完整输出重新提取, 避免探针行跨 chunk 被切断
      const samples = [...out.matchAll(/__BENCH_RSS_KB__(\d+)/g)].map(m => Number(m[1]));
      const maxKB = samples.length ? Math.max(...samples) : null;
      const sumKB = samples.reduce((a,b) => a + b,0);
      const rec = {
        id: task.id,
        label: task.label,
        entry: task.entry,
        startedAt: new Date(t0).toISOString(),
        elapsedMs,
        elapsedSec: +(elapsedMs / 1000).toFixed(2),
        maxProcessRssMB: maxKB === null ? null : +(maxKB / 1024).toFixed(1),
        sumPeaksRssMB: +(sumKB / 1024).toFixed(1),
        rssSamplesKB: samples,
        exitCode: code,
        timedOut,
        resultFileBefore: pre.resultFileBefore,
        ...(pre.hadOriginalResult === undefined ? {} : {hadOriginalResult: pre.hadOriginalResult}),
        ...(pre.restoreSource === undefined ? {} : {restoreSource: pre.restoreSource}),
        initialBestGold: parseInitialBestGold(out),
        finalGold: parseFinalGold(out)
      };
      // src 第1次跑完立刻备份结果, 供第2次使用
      if (task.id === "src-cold" && !timedOut) {
        backupTo(COLD_DIR);
        rec.coldResultBackedUp = BACKUP_PAIRS.every(([,name]) => existsSync(join(COLD_DIR,name)));
      }
      const results = loadResults();
      results[task.id] = rec;
      saveResults(results);
      console.log(`[完成] ${task.label}: 耗时 ${rec.elapsedSec.toString()}s, 峰值内存 ${String(rec.maxProcessRssMB)}MB, 最大经济 ${String(rec.finalGold)}, 退出码 ${String(code)}`);
      resolve(rec);
    });
  });
}

function report () {
  const results = loadResults();
  const rows = TASKS.map(t => results[t.id]).filter(Boolean);
  if (rows.length === 0) {
    console.log("暂无记录, 请先跑 --only 或 --all");
    return;
  }
  const fmt = v => v === null || v === undefined ? "-" : String(v);
  console.log("\n========== 基准测试结果 (严格串行, 一次一个进程) ==========");
  console.log("| 用例 | 耗时(s) | 峰值内存(最大单进程 MB) | 进程峰值之和(MB) | 初始 bestGold | 最终最大经济 | 超时 | 退出码 |");
  console.log("|---|---:|---:|---:|---:|---:|---|---|");
  for (const r of rows) {
    console.log(`| ${r.label} | ${fmt(r.elapsedSec)} | ${fmt(r.maxProcessRssMB)} | ${fmt(r.sumPeaksRssMB)} | ${fmt(r.initialBestGold)} | ${fmt(r.finalGold)} | ${String(r.timedOut)} | ${fmt(r.exitCode)} |`);
  }
  const byTime = [...rows].sort((a,b) => (a.elapsedSec ?? Infinity) - (b.elapsedSec ?? Infinity));
  const byMem = [...rows].sort((a,b) => (a.maxProcessRssMB ?? Infinity) - (b.maxProcessRssMB ?? Infinity));
  console.log("\n按耗时排序(快→慢):");
  byTime.forEach((r,i) => console.log(`  ${(i + 1).toString()}. ${r.label}: ${fmt(r.elapsedSec)}s`));
  console.log("按峰值内存排序(省→费):");
  byMem.forEach((r,i) => console.log(`  ${(i + 1).toString()}. ${r.label}: ${fmt(r.maxProcessRssMB)}MB`));
  console.log("\n说明: 峰值内存取该次运行所有 node 进程 maxRSS 的最大值(计算进程主导);");
  console.log("      「进程峰值之和」把 pnpm/tsx 包装进程也计入, 是总内存上界.");
}

const args = process.argv.slice(2);
const force = args.includes("--force");
if (args.includes("--report")) {
  report();
} else if (args.includes("--all")) {
  for (const task of TASKS) {
    const exists = loadResults()[task.id] !== undefined;
    if (exists && !force) {
      console.log(`[跳过] ${task.id} 已有记录 (加 --force 可重跑)`);
      continue;
    }
    await runTask(task);
  }
  report();
} else {
  const i = args.indexOf("--only");
  const id = i >= 0 ? args[i + 1] : undefined;
  const task = TASKS.find(t => t.id === id);
  if (!task) {
    console.log("用法: node bench.mjs --only <id> | --all | --report [--force]");
    console.log(`可用 id: ${TASKS.map(t => t.id).join(", ")}`);
    process.exitCode = 1;
  } else {
    const exists = loadResults()[task.id] !== undefined;
    if (exists && !force) {
      console.log(`[跳过] ${task.id} 已有记录 (加 --force 可重跑)`);
    } else {
      await runTask(task);
    }
  }
}
