// src3:真正的时间倒推 DP(后向归纳 / Bellman 值函数)
// 与 src / src1 / src2 的本质区别:
// · src / src2 是「显式栈前向枚举」,src1 是「递归前向枚举」——三者都靠「遇到终局就更新全局 bestGold」得到答案, 求解器本身返回 void,答案是全局副作用累积出来的,没有「状态的值」这一概念.
// · src3 定义值函数 V(s) = 从第 s.turn 回合的状态 s 出发,直到游戏结束能获得的「最大最终经济」:
// 边界 V(s) = 终局结算值 (全做完 / 回合耗尽)
// 递推 V(s) = max_{s' ∈ Successors(s)} V(s')
// 由于任一后继 s'.turn ≥ s.turn(回合单调不减),该递推在「时间」维度上只依赖未来层,
// 因此值天然从最后回合反向归纳(backward induction)回第 1 回合;答案 = V(initStat) 的返回值.
// 用 memo(完整状态 → V)记忆化,即 top-down backward DP;求解器不依赖任何「全局最优答案」变量.
// 物理层独立重实现:回合必做,动作枚举,建造/巡查转移,过回合结算,终局结算,全做完判定,
// 全部在本文件重写;仅复用 game-logic.js 的纯计算(收入公式,武将/建造组合,状态 key,深拷贝).
// 转移语义与 src/index.ts 逐字对齐,否则与基线没有可比性.
// 剪枝:帕累托支配 + 自包含分支定界.bestGold / bestSnapshot 从 0 / 空 起,
// 只由「本搜索自己算出的终局」更新;既不读 _gen-result.json,也不把任何外部最优值写进剪枝上界.
import type {ActionChoice,Moving,stat} from "./types.js";
import {baseStat0,initStat,maxLastTurnIncome,maxturn,能接受的最大治安} from "./data.js";
import {calMonthIncome,deepCloneStat,generateXindongCacheKey,getfreeWuJiangBuild,getFreeWujiangNameIsArr,getfreeWuJiangXuncha,getSortedBuildCombinations,isCalBestBuildingEd,最大巡查值,市场最小时间,造币厂最小时间} from "./game-logic.js";

const NEG = -Infinity;

// #region 倒推 DP 的记忆化结构
// 完整状态 → V(s).memo 即「已求解状态表」,是倒推 DP 的记忆化载体.
const memo = new Map<string,number>();

// 按回合分层统计,用于最后从末回合往回打印倒推层次
const solvedByTurn: number[] = Array.from({length: maxturn + 2},() => 0);
const bestVByTurn: number[] = Array.from({length: maxturn + 2},() => NEG);

// 帕累托前沿:键 = 回合 + 建造 + 人物(不含治安,金钱),值 = (治安,金钱) 互不支配的点集.
// 同键下若已有点两维都不弱于当前状态,则当前状态的 V 不可能更大 → 可剪(被支配状态的值由支配者覆盖).
interface ParetoPoint {gold: number; zhian: number}

function fullKey (s: stat): string {

  // generateXindongCacheKey 已含 回合/治安/各建造进度/各武将 free;补齐其余影响未来的字段
  return `${generateXindongCacheKey(s)}|金${s.实时金.toString()}|力${s.行动力.toString()}|巡${s.xunchaEd ? "1" : "0"}|必${s.isDoMustDo.join(",")}|旗${Object.values(s.flag).map(v => (v ? "1" : "0"))
.join("")}`;
}
const frontier: Map<string,ParetoPoint[]>[] = Array.from({length: maxturn + 2},() => new Map<string,ParetoPoint[]>());
function isDominated (layer: number,s: stat): boolean {
  const cache = frontier[layer];
  if (cache === undefined) {return false;}
  const key = paretoKey(s);
  const points = cache.get(key) ?? [];
  for (const p of points) {
    if (p.zhian >= s.治安 && p.gold >= s.实时金) {return true;}
  }
  const next = points.filter(p => !(s.治安 >= p.zhian && s.实时金 >= p.gold));
  next.push({gold: s.实时金,zhian: s.治安});
  cache.set(key,next);
  return false;
}
function paretoKey (s: stat): string {
  const parts: string[] = [`${s.turn.toString()} 回合 `];
  for (const mov in s.moving) {
    if (mov === "啥都不做") {continue;}
    parts.push(`${mov}[${s.moving[mov as keyof Moving].isBuilding.join(",")}]`);
  }
  for (const name in s.wujiangData) {
    const info = s.wujiangData[name];
    if (info === undefined) {continue;}
    parts.push(`${name}${info.free.toString()}`);
  }
  return parts.join("");
}

// #endregion
// #region 自包含分支定界:下界只来自本搜索已算出的终局
let bestGold = 0;
let bestSnapshot: stat | undefined;

// 一步转移的三种结果:被剪 / 得到一个待继续求值的状态 / 到达终局(直接给出最终经济)
type Step = {kind: "pruned"} | {kind: "state"; s: stat} | {kind: "terminal"; value: number};

// 执行一个动作(对应 executeAction).isAllDone 时直接过回合并结算 → 产生终局值
function applyAction (s: stat,action: ActionChoice): Step {
  const n = deepCloneStat(s);
  const {actionType,needtime,wujiangArr} = action;
  if (actionType === "巡查") {
    const thisMov = n.moving["巡查"];
    thisMov.isBuilding = [1];
    for (const name of wujiangArr) {
      const wujiang = n.wujiangData[name];
      if (wujiang === undefined) {continue;}
      wujiang.free += 1;
    }
    n.治安 = Math.min(n.治安 + needtime,100);
    n.行动力 -= thisMov.pointCost;
    n.实时金 -= thisMov.cost;
    n.flag["巡查"] = n.治安 >= 98;
    n.xunchaEd = true;
    if (isAllDone(n)) {return passTurn(n,true);}
    if (isDominated(n.turn,n)) {return {kind: "pruned"};}
    return {kind: "state",s: n};
  }
  if (actionType === "啥都不做" || actionType === "无人空闲") {
    return passTurn(n,false);
  }
  const thisMov = n.moving[actionType];
  thisMov.isBuilding.push(needtime);
  thisMov.isBuilding.sort((a,b) => a - b);
  for (const name of wujiangArr) {
    const wujiang = n.wujiangData[name];
    if (wujiang === undefined) {continue;}
    wujiang.free += needtime;
  }
  n.行动力 -= thisMov.pointCost;
  n.实时金 -= thisMov.cost;

  // 原版此处调用 isCheckFlag(纯函数,无副作用)后立刻用下式覆盖 flag,故等价省略
  n.flag[actionType] = thisMov.isBuilding.length === thisMov.mustBuildIn;
  if (isAllDone(n)) {return passTurn(n,true);}
  if (isDominated(n.turn,n)) {return {kind: "pruned"};}
  return {kind: "state",s: n};
}

// #endregion
// #region 物理层(独立重实现,语义与 src/index.ts 逐字对齐)
// 回合开头的必做操作(行动力/金币消耗,设置武将空闲),返回 null 表示该分支不可行
function applyTurnMustDo (s: stat): null | stat {
  const turnIndex = s.turn - 1;
  const action = baseStat0.thisTurnMustDo[turnIndex];
  if (!action || s.isDoMustDo.includes(turnIndex)) {return s;}
  const n = deepCloneStat(s);
  n.isDoMustDo.push(turnIndex);
  if (action.行动力消耗) {
    if (n.行动力 < action.行动力消耗) {return null;}
    n.行动力 -= action.行动力消耗;
  }
  if (action.金币消耗) {n.实时金 -= action.金币消耗;}
  const freeSetting = action.设置武将空闲;
  if (freeSetting) {
    for (const name in freeSetting) {
      const wujiang = n.wujiangData[name];
      const freeValue = freeSetting[name];
      if (wujiang === undefined || freeValue === undefined) {continue;}
      if (wujiang.free === 0) {
        wujiang.free = freeValue;
      } else {
        return null; // 武将本应空闲却被占用 → 剪
      }
    }
  }
  return n;
}

// 动作枚举(复用 game-logic 的纯计算组合)
function enumerateActions (s: stat,movingNameArr: (keyof Moving)[]): ActionChoice[] {
  const actions: ActionChoice[] = [];
  const freeNames = getFreeWujiangNameIsArr(s);
  if (freeNames.length === 0) {
    actions.push({actionType: "无人空闲",needtime: 0,wujiangArr: []});
    return actions;
  }
  let isNeedDoNothing = false;
  for (const movingName of movingNameArr) {
    if (movingName === "巡查") {
      const [wujiangArr,xunchaZhi] = getfreeWuJiangXuncha(freeNames);
      if (xunchaZhi < 最大巡查值) {isNeedDoNothing = true;}
      actions.push({actionType: "巡查",needtime: xunchaZhi,wujiangArr});
    } else if (movingName === "造币厂") {
      const {combinations,minBuildTime} = getSortedBuildCombinations(getfreeWuJiangBuild(freeNames,"造币厂"),s.turn);
      for (const combo of combinations) {
        if (combo.buildTime + s.turn <= maxturn) {
          actions.push({actionType: "造币厂",needtime: combo.buildTime,wujiangArr: combo.wujiangArr});
        }
      }
      if (minBuildTime > 造币厂最小时间) {isNeedDoNothing = true;}
    } else if (movingName === "市场") {
      const {combinations,minBuildTime} = getSortedBuildCombinations(getfreeWuJiangBuild(freeNames,"市场"),s.turn);
      for (const combo of combinations) {
        if (combo.buildTime + s.turn <= maxturn) {
          actions.push({actionType: "市场",needtime: combo.buildTime,wujiangArr: combo.wujiangArr});
        }
      }
      if (minBuildTime > 市场最小时间) {isNeedDoNothing = true;}
    } else if (isNeedDoNothing) {
      actions.push({actionType: "啥都不做",needtime: 0,wujiangArr: []});
    }
  }
  return actions;
}

// 终局结算(对应 recordFinalResult):把剩余回合的月收入一次性补齐,并扣掉剩余回合的必做金币
function finalSettlement (s: stat): number {
  for (let i = s.turn; i <= maxturn; i++) {
    if (i % 3 === 0) {s.实时金 += calMonthIncome(s,i,s.治安);}
  }
  const turnMustDo = baseStat0.thisTurnMustDo;
  for (let i = s.turn,len = turnMustDo.length; i < len; i++) {
    const item = turnMustDo[i];
    if (item?.金币消耗) {s.实时金 -= item.金币消耗;}
  }
  if (s.实时金 > bestGold) {
    bestGold = s.实时金;
    bestSnapshot = s;
  }
  return s.实时金;
}

// 全做完:除「啥都不做」外所有建筑 flag 均为 true(6 市场 + 1 造币厂 + 治安达标)
function isAllDone (s: stat): boolean {
  for (const mov in s.moving) {
    if (mov !== "啥都不做" && s.flag[mov] !== true) {return false;}
  }
  return true;
}

// 过回合(对应 passTurnMustDo):本回合发钱 → 分支定界 → 回合+1 → 建造/武将进度-1 → 行动力回复 → 帕累托剪枝
function passTurn (s: stat,isDone: boolean): Step {
  const n = deepCloneStat(s);
  if (n.turn % 3 === 0) {n.实时金 += calMonthIncome(n);}
  if (shouldPruneByFinalGold(n) || shouldPruneByBestResult(n)) {return {kind: "pruned"};}
  n.turn++;
  for (const mov in n.moving) {
    const buildingArr = n.moving[mov as keyof Moving].isBuilding;
    for (let i = 0,len = buildingArr.length; i < len; i++) {
      const current = buildingArr[i];
      if (current !== undefined) {buildingArr[i] = Math.max(current - 1,0);}
    }
  }
  for (const name in n.wujiangData) {
    const info = n.wujiangData[name];
    if (info === undefined) {continue;}
    info.free = Math.max(info.free - 1,0);
  }
  n.eachTrunStatWithMoney[n.turn - 1] = {
    市场:  [...n.moving.市场.isBuilding],
    治安:  n.治安,
    造币厂: [...n.moving.造币厂.isBuilding]
  };
  n.行动力 = Math.min(n.行动力 + baseStat0.每回合回复行动力,255);

  // 缓存层用「过回合前」的回合号(与前向搜索一致:记录的是上一回合结束时的状态)
  if (n.turn > maxturn || isDominated(s.turn,n)) {return {kind: "pruned"};}
  n.xunchaEd = false;
  if (isDone) {
    const afterMustDo = applyTurnMustDo(n);
    if (afterMustDo === null) {return {kind: "pruned"};}
    return {kind: "terminal",value: finalSettlement(afterMustDo)};
  }
  return {kind: "state",s: n};
}

// #endregion
function runApp (): void {
  console.log("========== src3:时间倒推 DP(后向归纳值函数) ==========");
  console.log("最大回合数:",maxturn,"初始金币:",initStat.实时金);
  console.log("倒推起点:第 1 回合;边界:全做完 / 回合耗尽;答案 = V(initStat) 返回值");
  const answer = V(deepCloneStat(initStat));
  console.log("---------- 从末回合往回的倒推层次(已求解状态 / 该层最大 V) ----------");
  for (let t = maxturn; t >= 1; t--) {
    const count = solvedByTurn[t];
    if (count === undefined || count === 0) {continue;}
    const layerBest = bestVByTurn[t];
    console.log(`第 ${t.toString()} 回合层: 已求解 ${count.toString()} 个状态, 层内最大 V = ${layerBest === undefined || layerBest === NEG ? "无" : layerBest.toString()}`);
  }
  console.log("倒推完成,已求解状态总数:",memo.size);
  console.log("最大经济 V(initStat):",answer);
  console.log("搜索自身 running best(仅剪枝用):",bestGold);
}

// 与本搜索当前最优解的逐回合完成度比较:治安/市场/造币厂三方面都不占优则剪
// @param s 当前状态
function shouldPruneByBestResult (s: stat): boolean {
  if (bestSnapshot === undefined || s.turn >= maxturn - 市场最小时间 - 3) {return false;}
  const bestDay = bestSnapshot.eachTrunStatWithMoney[s.turn];
  if (bestDay === undefined) {return false;}
  const isOk市场 = isCalBestBuildingEd(bestDay.市场,s.moving.市场.isBuilding,s.turn);
  const isOk造币厂 = isCalBestBuildingEd(bestDay.造币厂,s.moving.造币厂.isBuilding,s.turn);
  return !(isOk市场 || isOk造币厂 || s.治安 >= bestDay.治安);
}

// 乐观上界:假设剩余建造/巡查花费最小,后续收入按最大月收入估算; 若连这个乐观值都 ≤ 已知下界,该分支不可能刷新最大值 → 倒推时可直接返回 NEG.
// @param s 当前状态
function shouldPruneByFinalGold (s: stat): boolean {
  if (!bestGold || s.turn !== maxturn - 市场最小时间 - 3) {return false;}
  const need巡查次数 = Math.ceil((能接受的最大治安 - s.治安) / 最大巡查值);
  let needGold = Math.max(0,need巡查次数 * 100);
  needGold += (s.moving["市场"].mustBuildIn - s.moving["市场"].isBuilding.length) * s.moving["市场"].cost;
  needGold += (s.moving["造币厂"].mustBuildIn - s.moving["造币厂"].isBuilding.length) * s.moving["造币厂"].cost;
  const needTrun = maxturn - s.turn;
  const remainingMustDo = baseStat0.thisTurnMustDo.slice(-needTrun);
  for (const el of remainingMustDo) {
    if (el?.金币消耗) {needGold += el.金币消耗;}
  }
  let month9Income = 0;
  const zhian = Math.min(s.治安 + need巡查次数 * 最大巡查值,100);
  if (s.turn < 9) {month9Income = calMonthIncome(s,9,zhian);}
  return s.实时金 - needGold + month9Income + Math.floor(maxLastTurnIncome * zhian / 100) < bestGold;
}

// #endregion
// #region 后向归纳值函数 V(s)
/**
 * 倒推 DP 主递推:取所有后继状态的最优值,边界由终局结算直接给出,值因此从末回合反向归纳回第 1 回合.
 * @param s 当前状态
 * @returns 该状态到终局的最优值
 */
function V (s: stat): number {
  const key = fullKey(s);
  const cached = memo.get(key);
  if (cached !== undefined) {return cached;}
  const s1 = applyTurnMustDo(s);
  if (s1 === null || s1.turn > maxturn) {
    memo.set(key,NEG);
    return NEG;
  }
  let best = NEG;
  const consider = (step: Step): void => {
    if (step.kind === "pruned") {return;}
    const value = step.kind === "terminal" ? step.value : V(step.s);
    if (value > best) {best = value;}
  };
  const xindongli = s1.行动力;
  if (xindongli < 10) {
    consider(passTurn(s1,false)); // 行动力不足:只能过回合
  } else if (xindongli > 10 && xindongli < 20) {
    if ("吸收合并" in s1.moving) {
      for (const action of enumerateActions(s1,["吸收合并"])) {consider(applyAction(s1,action));}
    } else {
      consider(passTurn(s1,false));
    }
  } else if (xindongli >= 20) {
    const priority: (keyof Moving)[] = [];

    // 大建筑优先,造不成时尽早剪
    if (s1.moving["造币厂"].isBuilding.length < s1.moving["造币厂"].mustBuildIn && 造币厂最小时间 + s1.turn <= maxturn) {
      priority.push("造币厂");
    }
    if (s1.moving["市场"].isBuilding.length < s1.moving["市场"].mustBuildIn && 市场最小时间 + s1.turn <= maxturn) {
      priority.push("市场");
    }
    if (s1.治安 < 能接受的最大治安 && !s1.xunchaEd) {
      priority.push("巡查");
    }
    if (priority.length > 0) {priority.push("啥都不做");}
    for (const action of enumerateActions(s1,priority)) {consider(applyAction(s1,action));}
  }
  memo.set(key,best);
  const layer = s.turn;
  if (solvedByTurn[layer] !== undefined) {solvedByTurn[layer] += 1;}
  const prev = bestVByTurn[layer];
  if (prev !== undefined && best > prev) {bestVByTurn[layer] = best;}
  return best;
}
runApp();