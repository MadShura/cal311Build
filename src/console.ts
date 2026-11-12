// 放置需要的打印工具方法
import {readdirSync,readFileSync,unlinkSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import type {stat} from "./types.js";
import {initStat,maxturn,PRUNE_REPORT_INTERVAL} from "./data.js";
import {全行动缓存} from "./index.js";

const __dirname = import.meta.dirname;
declare const deleteFileNameArr: string[];

// const removeFileNameArr = [
// "支配剪枝",
// "结果",
// "过程",
// "操作记录",
// "result",
// "turn"
// ];
// 添加剪枝计数器
const pruneCount: Record<string,number> = {
  全做完剪枝:      0,
  支配剪枝:       0,
  最终结果钱比你多剪枝: 0
};

/**
 * 记录剪枝,只计数,不写文件
 * @param fileName 剪枝名称
 */
export function recordPrune (fileName: string): void {
  pruneCount[fileName] = (pruneCount[fileName] || 0) + 1;

  // 每隔一定次数输出统计
  if (!(pruneCount[fileName] > 0 && pruneCount[fileName] % PRUNE_REPORT_INTERVAL === 0)) {
    return;
  }
  console.log("========== 剪枝统计 ==========");
  for (const [name,count] of Object.entries(pruneCount)) {
    console.log(`${name}: ${count.toString()} 次`);
  }
  for (let i = 0,len = maxturn; i < len; i++) {
    const cache = 全行动缓存[i];
    if (cache === undefined) {continue;}
    console.log(`第 ${i.toString()} 层缓存的大小是: ${cache.size.toString()}`);
  }
}

// 记录操作计数器
let actionRecordCount = 0;

// 每隔多少万次搜索输出一次统计
export function getBestGold (): number {
  try {
    const content = readFileSync("src/result.log","utf8");
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

/**
 * 记录操作前后的状态
 * @param actionType 操作类型
 * @param wujiangArr 执行武将数组
 * @param beforeKey 操作前的 xindongCacheKey
 * @param afterKey 操作后的 xindongCacheKey 或特殊标记
 */
export function recordAction (actionType: string,wujiangArr: string[],beforeKey: string,afterKey: null | string): void {
  actionRecordCount++;
  const filePath = join(__dirname,"操作记录.log");
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
  try {
    writeFileSync(filePath,content,{encoding: "utf8",flag: "a"});
  } catch (error) {
    console.error("写入操作记录文件失败:",error);
  }
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
    操作记录:
${stat.行动.map((op,i) => `  ${(i + 1).toString()}. ${op}`).join("\n")}
    `;
  try {
    writeFileSync(filePath,content,{encoding: "utf8",flag: "a"});
  } catch (error) {
    console.error(`写入深度 ${stat.turn.toString()} 文件失败:`,error);
  }
}

// 删除 文件
function clearDepthFiles (): void {
  try {
    const files = readdirSync(__dirname);
    for (const file of files) {
      for (const targetName of deleteFileNameArr) {
        if (!(file.startsWith(targetName) && file.endsWith(".log"))) {
        	continue;
        }
        const filePath = join(__dirname,file);
        unlinkSync(filePath);
        console.log(`已删除旧文件: ${file}`);
      }
    }
    for (const file of files) {
      for (const targetName of deleteFileNameArr) {
        if (!(file.startsWith(targetName) && file.endsWith(".json"))) {
        	continue;
        }
        const filePath = join(__dirname,file);
        unlinkSync(filePath);
        console.log(`已删除旧文件: ${file}`);
      }
    }
  } catch (error) {
    console.error("删除旧 depth 文件时出错:",error);
  }
}

// #endregion