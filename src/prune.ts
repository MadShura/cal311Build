// 剪枝相关逻辑统一存放处(对应 README ## 剪枝策略 整节)
// · 核心二维比较 + 操作顺序剪枝 :键=回合+建造+人物(不含治安),值=(治安,钱) 的 Pareto 前沿(用例 1-9)
// · 回合收入剪枝(最终结果剪枝) :基于 bestGold / bestResultArr 估算最终经济提前剪枝
// · 其它纯判定剪枝 :行动力不符合 / 武将不空闲 / 回合超出
// 缓存命中优化:建造 isBuilding 已在 game-logic 中排序,键天然规整,命中率更高.
import type {Moving,stat,TurnAction} from "./types.js";
import {baseStat0,maxLastTurnIncome,maxturn,能接受的最大治安} from "./data.js";
import {calMonthIncome,isCalBestBuildingEd,市场最小时间,最大巡查值} from "./game-logic.js";
import {recordPrune} from "./console.js";
import {createWriteStream} from "node:fs";

// 全行动缓存:键 = 回合+建造+人物(不含治安),值 = (治安,金钱) 的 Pareto 前沿
interface ZhianGold {gold: number; zhian: number}
export const allMoveCache: Map<string,ZhianGold[]>[] = Array.from({length: maxturn + 1},() => new Map<string,ZhianGold[]>());

// 生成剪枝用的 key:与 generateXindongCacheKey 相同,但去掉 治安. 用于比较「同回合 + 同建造 + 同人物」下,金钱与治安两维的支配关系.
export function generateXindongCacheKeyNoZhian (stat: stat): string {
  const {moving,wujiangData} = stat;
  const parts: string[] = [`${stat.turn.toString()} 回合 `];
  for (const mov in moving) {
    if (mov === "啥都不做") {continue;}
    const eachIsBuilding = moving[mov as keyof Moving].isBuilding;
    parts.push(`${mov}[${eachIsBuilding.join(",")}]`);
  }
  for (const wujiangName in wujiangData) {
    const info = wujiangData[wujiangName];
    if (info === undefined) {continue;}
    parts.push(`${wujiangName}${info.free.toString()}`);
  }

  // console.log(parts.join(""));
  return parts.join("");
}

// #region 4. 其它纯判定剪枝
// 当前状态必做操作的行动力不足 → 剪枝
export function pruneByActionPoint (newStat: stat,action: TurnAction): boolean {
  if (action.行动力消耗 && newStat.行动力 < action.行动力消耗) {
    recordPrune("当前状态行动力不符合剪枝");
    return true;
  }
  return false;
}

// #region 2. 回合收入剪枝(最终结果剪枝)
/**
 * 基于已知最好结果 bestGold,估算本状态最终经济,若注定不如最好结果则剪枝.
 * 对应 README "回合收入剪枝":比较到 maxturn-市场最小时间-3 处的最终收入.
 * @returns 是否被剪枝
 */
export function pruneByFinalGold (newStat: stat,bestGold: number): boolean {
  if (!bestGold || newStat.turn !== maxturn - 市场最小时间 - 3) {return false;}
  const need巡查次数 = Math.ceil((能接受的最大治安 - newStat.治安) / 最大巡查值); // 有可能负数
  let needGold = Math.max(0,need巡查次数 * 100);

  // 加上需要做多少个市场造币厂的花费
  needGold += (newStat.moving["市场"].mustBuildIn - newStat.moving["市场"].isBuilding.length) * newStat.moving["市场"].cost;
  needGold += (newStat.moving["造币厂"].mustBuildIn - newStat.moving["造币厂"].isBuilding.length) * newStat.moving["造币厂"].cost;
  const needTrun = maxturn - newStat.turn;

  // 剩余回合是否需要金币消耗 thisTurnMustDo 是从0开始 stat.turn 是从1开始 这里刚好符合逻辑 9 回合确实要吃10回合的必做
  const remainingMustDo = baseStat0.thisTurnMustDo.slice(-needTrun);
  for (const el of remainingMustDo) {
    if (el?.金币消耗) {
      needGold += el.金币消耗;
    }
  }
  let month9Income = 0;
  const _zhian = Math.min(newStat.治安 + need巡查次数 * 最大巡查值,100);
  if (newStat.turn < 9) { // 小于9 才计算,如果为9 上面已经发过钱
    month9Income = calMonthIncome(newStat,9,_zhian); // 估算所以使用100的治安
  }
  if (newStat.实时金 - needGold + month9Income + Math.floor(maxLastTurnIncome * _zhian / 100) < bestGold) {
    recordPrune("最终结果钱比你多剪枝");
    return true;
  }
  return false;
}

// #endregion
// 状态回合数超过最大回合数 → 剪枝
export function pruneByTurnExceed (newStat: stat): boolean {
  if (newStat.turn > maxturn) {
    recordPrune("回合超出剪枝");
    return true;
  }
  return false;
}

// 当前状态必做操作的武将不空闲(本应空闲却被占用) → 剪枝
export function pruneByWujiangIdle (wujiang: {free: number},freeValue: number): boolean {
  if (wujiang.free !== 0) { // freeValue 仅用于必做设置,此处只判定占用
    recordPrune("当前状态武将不空闲剪枝");
    return true;
  }
  return false;
}

// #region 1. 核心二维比较 + 操作顺序剪枝(对应 README 用例 1-9)
/**
 * 同(回合+建造+人物)下,若已存在某状态在 治安 与 金钱 两维均不弱于当前状态,则当前被支配可剪枝.
 * 用例 1/2/4/8:被某个缓存点支配(两维都 ≥ 当前)→ 剪枝
 * 用例 3/5/9:当前更优 → 删掉被它支配的旧点(垃圾),存入当前
 * 用例 6/7:两维一高一低(不可比较)→ 保留
 * @param turn 缓存层(executeAction 用 newStat.turn,passTurnMustDo 用 stat.turn)
 * @param newStat 待判定状态
 * @returns 是否被剪枝
 */
export function pruneZhianGold (turn: number,newStat: stat): boolean {
  const cache = allMoveCache[turn];
  if (cache === undefined) {return false;}
  const key = generateXindongCacheKeyNoZhian(newStat);
  const frontier = cache.get(key) ?? [];
  for (const p of frontier) {
    if (p.zhian >= newStat.治安 && p.gold >= newStat.实时金) {
      recordPrune("治安金钱支配剪枝");
      return true;
    }
  }
  const next = frontier.filter(p => !(newStat.治安 >= p.zhian && newStat.实时金 >= p.gold));
  next.push({gold: newStat.实时金,zhian: newStat.治安});
  cache.set(key,next);
  return false;
}

// #endregion
// 流式写出单回合缓存:逐条写,尊重背压,避免把整本缓存拼成几百 MB 字符串.
export async function streamCache (cache: Map<string,ZhianGold[]>,filePath: string): Promise<void> {
  return new Promise((resolve,reject) => {
    const ws = createWriteStream(filePath,"utf8");
    ws.on("error",reject);
    ws.on("finish",resolve);
    const it = cache.entries();
    let isOk = true;
    function pump (): void {
      let count = 0;
      while (isOk && count < 20000) {
        const n = it.next();
        if (n.done) {ws.end(); return;}
        const [key,value] = n.value;
        const v = value.map(p => `(${p.zhian.toString()},${p.gold.toString()})`).join("|");
        isOk = ws.write(`${key}: ${v}\n`);
        count++;
      }
      if (!isOk) {ws.once("drain",() => {isOk = true; pump();});}
    }
    pump();
  });
}

// #endregion
/**
 * 基于最好结果的逐回合记录 bestResultArr,只要本状态在 治安/市场/造币厂 任一方面能不弱于最好结果才放行.
 * 对应 README "回合收入剪枝" 的逐回合对比.
 * @returns 是否被剪枝
 */
export function willPruneByBestResult (newStat: stat,bestResultArr: stat[]): boolean {
  if (bestResultArr.length === 0 || newStat.turn >= maxturn - 市场最小时间 - 3) {return false;}
  const bestStat = bestResultArr[0];
  const bestDay = bestStat?.eachTrunStatWithMoney[newStat.turn];
  if (bestDay === undefined) {return false;}
  let nowB = newStat.moving.市场.isBuilding;
  let bestB = bestDay.市场;
  const isComP市场 = isCalBestBuildingEd(bestB,nowB,newStat.turn);
  nowB = newStat.moving.造币厂.isBuilding;
  bestB = bestDay.造币厂;
  const isComP造币厂 = isCalBestBuildingEd(bestB,nowB,newStat.turn);
  if (!(isComP市场 || isComP造币厂 || newStat.治安 >= bestDay.治安)) {
    recordPrune("啥都比不过最终结果剪枝");
    return true;
  }
  return false;
}