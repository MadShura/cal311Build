// 放置需要的打印工具方法
import {appendFileSync,mkdirSync,readdirSync,readFileSync,unlinkSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import type {stat} from "./types.js";
import {initStat,maxturn,PRUNE_REPORT_INTERVAL} from "./data.js";
import {allMoveCache} from "./prune.js";
import {isLogEnabled} from "./config.js";

const __dirname = import.meta.dirname;
const fileNameArrToDelete = [
  "支配剪枝",
  "结果",
  "过程",
  "_gen-allMove",
  "_gen-result",
  "result",
  "turn"
];

// 添加剪枝计数器
const pruneCount: Record<string,number> = {
  全做完剪枝:        0,
  啥都比不过最终结果剪枝:  0,
  回合超出剪枝:       0,
  当前状态武将不空闲剪枝:  0,
  当前状态行动力不符合剪枝: 0,
  最终结果钱比你多剪枝:   0,
  治安金钱支配剪枝:     0
};

/**
 * 记录剪枝,只计数,不写文件
 * @param fileName 剪枝名称
 */
export function recordPrune (fileName: string): void {
  pruneCount[fileName] = (pruneCount[fileName] ?? 0) + 1;

  // 每隔一定次数输出统计
  if (!(pruneCount[fileName] > 0 && pruneCount[fileName] % PRUNE_REPORT_INTERVAL === 0)) {
    return;
  }
  console.log("========== 剪枝统计 ==========");
  for (const [name,count] of Object.entries(pruneCount)) {
    console.log(`${name}: ${count.toString()} 次`);
  }
  for (let i = 0,len = maxturn; i < len; i++) {
    const cache = allMoveCache[i];
    if (cache === undefined) {continue;}
    console.log(`第 ${i.toString()} 层缓存的大小是: ${cache.size.toString()}`);
  }
}

// 记录操作计数器
let actionRecordCount = 0; // 每隔多少万次搜索输出一次统计

// 找到上次最好的结果
export function getBestGold (): number {
  try {
    const content = readFileSync("src/_gen-result.log","utf8");
    const lines = content.trim().split("\n");

    // 从最后一行开始向上找含有"实时金:"的行
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line === undefined) {continue;}
      const match = (/实时金:(\d+)/).exec(line);
      if (match) {
        return Number(match[1]);
      }
    }
    return 0; // 没有找到
  } catch {
    return 0; // 没有找到
  }
}
export function init () {

  // #region 初始化
  clearDepthFiles();
  console.log("========== 开始计算 ==========");
  console.log(`最大回合数: ${maxturn.toString()}`);
  console.log(`初始金币: ${initStat.实时金.toString()}`);
  console.log("");

  // 直接开始正向遍历
}
export function myWirteFile (fileName: string,stats: stat[],isNeedDelete?: boolean,heading = "===============\n") {
  const filePath = join(__dirname,`${fileName}.log`);
  try {

    // If (needdelete) {
    // RmSync(filePath,{"force": true});
    // }
    let content = "";
    for (const stat of stats) {

      // 1. 先把每个行动转成「行号+内容」的字符串
      const actionsWithLineNo = stat.行动.map((action,index) => `${(index + 1).toString()}, ${action}`);

      // 2. 用换行符 \n 拼接,每个行动占一行,彻底避免逗号
      content += `${heading}${actionsWithLineNo.join("\n")}\n`;
    }
    writeFileSync(filePath,content,{encoding: "utf8"});
  } catch (error) {
    console.error(`写入 ${fileName}.log 失败:`,error);
  }
  const filePath2 = join(__dirname,`${fileName}.json`);
  try {
    writeFileSync(filePath2,JSON.stringify(stats),{encoding: "utf8"});
  } catch (error) {
    console.error(`写入 ${fileName}.log 失败:`,error);
  }
}
const allMovePath = join(__dirname,"output","_gen-allMove.log");

/**
 * 记录操作前后的状态
 * @param actionType 操作类型
 * @param wujiangArr 执行武将数组
 * @param beforeKey 操作前的 xindongCacheKey
 * @param afterKey 操作后的 xindongCacheKey 或特殊标记
 */
mkdirSync(dirname(allMovePath),{recursive: true});
let allMoveBuffer = "";
function flushallMove (): void {
  if (allMoveBuffer.length === 0) {return;}
  try {
    appendFileSync(allMovePath,allMoveBuffer,"utf8");
  } catch (error) {
    console.error("写入allMove文件失败:",error);
  }
  allMoveBuffer = "";
}

// 进程退出前把残余缓冲落盘,避免最后一批丢失
process.on("exit",flushallMove);

/**
 * 记录操作前后的状态.缓冲到 ~1MB 再批量 appendFileSync,
 * 避免每次操作都打开/关闭文件(百万次 writeFileSync 是性能灾难).
 */
export function recordAction (actionType: string,wujiangArr: string[],beforeKey: string,afterKey: null | string): void {
  actionRecordCount++;
  let content = `========== 第 ${actionRecordCount.toString()} 次操作 ==========\n`;
  content += `操作类型: ${actionType}\n`;
  content += `执行武将: ${wujiangArr.join(", ")}\n`;
  content += `\n操作前状态:\n${beforeKey}\n`;
  if (afterKey === null) {
    content += "\n操作后状态: 被剪枝\n";
  } else if (afterKey === "过回合") {
    content += "\n操作后状态: 过回合处理\n";
  } else {
    content += `\n操作后状态:\n${afterKey}\n`;
  }
  content += "========================================\n\n";
  if (!isLogEnabled) {
    return;
  }
  allMoveBuffer += content;
  if (allMoveBuffer.length > 100_0000) {flushallMove();}
}

// #region 打印
/**
 * 将状态写入对应深度的文件
 * @param stat 当前状态
 */
export function writeStatByTurn (stat: stat): void {
  const filePath = join(__dirname,`turn_${stat.turn.toString()}.log`);
  const content = `========== 深度 ${stat.turn.toString()} 状态 ==========
    回合: ${stat.turn.toString()}
    治安: ${stat.治安.toString()}
    实时金: ${stat.实时金.toString()}
    行动力: ${stat.行动力.toString()}
    allMove:
${stat.行动.map((op,i) => `  ${(i + 1).toString()}. ${op}`).join("\n")}
    `;
  try {
    writeFileSync(filePath,content,{encoding: "utf8",flag: "a"});
  } catch (error) {
    console.error(`写入深度 ${stat.turn.toString()} 文件失败:`,error);
  }
}

// 删除 文件(同时清理 src/ 与 src/output/)
function clearDepthFiles (): void {
  const dirs = [__dirname,join(__dirname,"output")];
  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      for (const targetName of fileNameArrToDelete) {
        if (file.startsWith(targetName) && (file.endsWith(".log") || file.endsWith(".json"))) {
          try {
            unlinkSync(join(dir,file));
            console.log(`已删除旧文件: ${file}`);
          } catch {

            // 忽略
          }
          break;
        }
      }
    }
  }
}

// #endregion