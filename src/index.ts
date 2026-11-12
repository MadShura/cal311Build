import type {ActionChoice,Moving,stat} from "./types.js";
import {baseStat0,initStat,maxLastTurnIncome,maxturn,能接受的最大治安} from "./data.js";
import {calMonthIncome,deepCloneStat,generateXindongCacheKey,getfreeWuJiangBuild,getFreeWujiangNameIsArr,getfreeWuJiangXuncha,getSortedBuildCombinations,isCalBestBuildingEd,isCheckFlag,市场最小时间,最大巡查值,造币厂最小时间} from "./game-logic.js";
import {initCacheArray} from "axl-utils/js/array";
import {getBestGold,init,myWirteFile,recordPrune} from "./console.js";
import {readFileSync,writeFileSync} from "node:fs";

export let 全行动缓存: Map<string,number>[] = [];
let bestResultArr: stat[] = [];
let bestGold = 0; // 最大经济

// 根据当前空闲的武将,得到最好的巡查组合
全行动缓存 = initCacheArray(maxturn + 1);

// #region 执行操作
// 返回新 stat
function executeAction (stat: stat,action: ActionChoice): null | stat {
  const newStat = deepCloneStat(stat);
  const actionType = action.actionType;
  const {needtime,wujiangArr} = action;
  const wujiangArrStr = wujiangArr.join(",");

  // if (generateXindongCacheKey(stat) === "6 回合,治安99,行动力84 市场[3,3,0]造币厂[3]巡查[0]伦直0贾范3公孙恭3公孙康95公孙度95徐荣3公孙渊3杨代0卑衍0") {
  // console.log(stat,"executeAction");
  // }
  // Region 巡查操作
  if (actionType === "巡查") {
    const thisMov = newStat.moving[actionType];
    thisMov.isBuilding = [1];
    for (const wujiangName of wujiangArr) {
      const wujiang = newStat.wujiangData[wujiangName];
      if (wujiang === undefined) {continue;}
      wujiang.free += 1;
    }
    newStat.治安 = Math.min(newStat.治安 + needtime,100);
    newStat.行动力 -= thisMov.pointCost;
    newStat.实时金 -= thisMov.cost;
    newStat.flag["巡查"] = newStat.治安 >= 98;
    newStat.xunchaEd = true;
    const currentXindongCacheKey = generateXindongCacheKey(newStat);
    newStat.行动.push(`回合操作 巡查 ${wujiangArrStr} ${currentXindongCacheKey} 实时金:${newStat.实时金.toString()}`); // 每个操作后都 push
    let isAllDone = true;
    for (const movingName in newStat.moving) {
      if (movingName !== "啥都不做" && !newStat.flag[movingName]) {
        isAllDone = false;
      }
    }

    // 全做完就去过回合
    if (isAllDone) {
      passTurnMustDo(newStat,true);
      return null;
    }

    // 支配剪枝放下面 节省内存
    // If (全行动缓存.has(currentXindongCacheKey) && (全行动缓存.get(currentXindongCacheKey) ?? 0) >= newStat.实时金) {
    // RecordPrune("支配剪枝");
    // Return null;
    // }
    // 全行动缓存.set(currentXindongCacheKey,newStat.实时金);
    // RecordAction(actionType,wujiangArr,currentXindongCacheKey,newXindongCacheKey);
    return newStat;

    // 特殊行动
  }
  if (actionType === "啥都不做" || actionType === "无人空闲") {
    const currentXindongCacheKey = generateXindongCacheKey(newStat);
    newStat.行动.push(`${actionType} ${currentXindongCacheKey} 实时金:${newStat.实时金.toString()}`);
    return passTurnMustDo(newStat);
  }

  // Region 建筑操作
  const thisMov = newStat.moving[actionType];
  thisMov.isBuilding.push(needtime);
  thisMov.isBuilding.sort((a,b) => a - b); // 从小到大排序
  for (const wujiangName of wujiangArr) {
    const wujiang = newStat.wujiangData[wujiangName];
    if (wujiang === undefined) {continue;}
    wujiang.free += needtime;
  }
  newStat.行动力 -= thisMov.pointCost;
  newStat.实时金 -= thisMov.cost;

  // 更新 flag 并检查是否全部完成
  isCheckFlag(newStat);
  newStat.flag[actionType] = thisMov.isBuilding.length === thisMov.mustBuildIn;
  const currentXindongCacheKey = generateXindongCacheKey(newStat);
  newStat.行动.push(`回合操作 建造 ${actionType} ${wujiangArrStr} 花费${needtime.toString()}回合 ${currentXindongCacheKey} 实时金:${newStat.实时金.toString()}`);
  let isAllDone = true;
  for (const movingName in newStat.moving) {
    if (movingName !== "啥都不做" && !newStat.flag[movingName]) {
      isAllDone = false;
    }
  }
  if (isAllDone) {
    passTurnMustDo(newStat,true);
    return null;
  }

  // 支配剪枝放下面 节省内存
  // If (全行动缓存.has(currentXindongCacheKey) && (全行动缓存.get(currentXindongCacheKey) ?? 0) >= newStat.实时金) {
  // RecordPrune("支配剪枝");
  // Return null;
  // }
  // 全行动缓存.set(currentXindongCacheKey,newStat.实时金);
  // RecordAction(actionType,wujiangArr,currentXindongCacheKey,newXindongCacheKey);
  return newStat;
}

  // #region 回合强制操作
// 返回新 stat
function executeTurnAction (stat: stat): null | stat {
  const turnIndex = stat.turn - 1;
  const action = baseStat0.thisTurnMustDo[turnIndex];
  if (!action || stat.isDoMustDo.includes(turnIndex)) {return stat;}
  const newStat = deepCloneStat(stat);
  newStat.isDoMustDo.push(turnIndex);
  const mustDoParts: string[] = [];
  if (action.行动力消耗) {
    if (newStat.行动力 < action.行动力消耗) {
      recordPrune("当前状态行动力不符合剪枝");
      return null;
    }
    newStat.行动力 -= action.行动力消耗;
    mustDoParts.push(`消耗行动力${action.行动力消耗.toString()} `);
  }
  if (action.金币消耗) {
    newStat.实时金 -= action.金币消耗;
    mustDoParts.push(`消耗金币${action.金币消耗.toString()} `);
  }
  if (action.设置武将空闲) {
    for (const wujiangName in action.设置武将空闲) {
      const wujiang = newStat.wujiangData[wujiangName];
      const freeValue = action.设置武将空闲[wujiangName];
      if (wujiang === undefined || freeValue === undefined) {continue;}
      if (wujiang.free === 0) {
        wujiang.free = freeValue;
        mustDoParts.push(`${wujiangName}设置为${freeValue.toString()} `);
      } else {
        recordPrune("当前状态武将不空闲剪枝");
        return null;
      }
    }
  }
  newStat.行动.push(`[必做]${mustDoParts.join(",")} 实时金:${newStat.实时金.toString()}`);
  return newStat;
}

// #region 获取操作的可行组合
// 返回一个 action 数组 里面包含所有可以执行的操作
// MovingNameArr 可能是空数组
function getAllPossibleActions (stat: stat,movingNameArr: (keyof Moving)[]): ActionChoice[] {
  const actions: ActionChoice[] = [];
  const freeWujiangNameArr = getFreeWujiangNameIsArr(stat);

  // If (generateXindongCacheKey(stat) === "6 回合,治安99,行动力84 市场[3,3,0]造币厂[3]巡查[0]伦直0贾范3公孙恭3公孙康95公孙度95徐荣3公孙渊3杨代0卑衍0") {
  // Console.log(stat,"getAllPossibleActions");
  // }
  // Console.log(movingNameArr,freeWujiangNameArr);
  if (freeWujiangNameArr.length === 0) {   // 无人空闲
    actions.push({actionType: "无人空闲",needtime: 0,wujiangArr: []});
    return actions;
  }
  let maxXuncha = 0;
  let isNeedDoNothing = false;

  // Const choicesArr = stat.movingSortArr;
  for (const movingName of movingNameArr) {
    if (movingName === "巡查") { // 巡查 可能不会增加 action
      const [wujiangArr,xunchaZhi] = getfreeWuJiangXuncha(freeWujiangNameArr);
      maxXuncha = Math.max(maxXuncha,xunchaZhi);
      if (xunchaZhi < 最大巡查值) {
        isNeedDoNothing = true;
      }
      actions.push({actionType: "巡查",needtime: xunchaZhi,wujiangArr});
    } else if (movingName === "造币厂") {
      const {combinations,minBuildTime} = getSortedBuildCombinations(getfreeWuJiangBuild(freeWujiangNameArr,"造币厂"),stat.turn);
      for (const combo of combinations) {
        const wujiangArr = combo.wujiangArr;
        maxXuncha = Math.max(maxXuncha,minBuildTime);
        if (combo.buildTime + stat.turn <= maxturn) {
          actions.push({actionType: "造币厂",needtime: combo.buildTime,wujiangArr});
        }
      }
      if (minBuildTime > 造币厂最小时间) {
        isNeedDoNothing = true;
      }
    } else if (movingName === "市场") {
      const {combinations,minBuildTime} = getSortedBuildCombinations(getfreeWuJiangBuild(freeWujiangNameArr,"市场"),stat.turn);
      for (const combo of combinations) {
        const wujiangArr = combo.wujiangArr;
        maxXuncha = Math.max(maxXuncha,minBuildTime);
        if (combo.buildTime + stat.turn <= maxturn) {
          actions.push({actionType: "市场",needtime: combo.buildTime,wujiangArr});
        }
      }
      if (minBuildTime > 市场最小时间) {
        isNeedDoNothing = true;
      }
    } else if (isNeedDoNothing) {
      actions.push({actionType: "啥都不做",needtime: 0,wujiangArr: []});
    }
  }

  // Console.log(actions);
  // 4 回合,治安87,行动力56 市场[5,2]造币厂[5]巡查[0]伦直2贾范5公孙恭0公孙康97公孙度97徐荣5公孙渊5杨祚0卑衍0
  // 2 回合,治安80,行动力48 市场[]造币厂[]巡查[0]伦直0贾范0公孙恭0公孙康99公孙度99徐荣0公孙渊0杨祚0卑衍0
  // 4 回合,治安87,行动力36 市场[5,5,2]造币厂[5]巡查[0]伦直2贾范5公孙恭5公孙康97公孙度97徐荣5公孙渊5杨祚0卑衍0
  // If (generateXindongCacheKey(stat) === "4 回合,治安87,行动力36 市场[5,5,2]造币厂[5]巡查[0]伦直2贾范5公孙恭5公孙康97公孙度97徐荣5公孙渊5杨祚0卑衍0") {
  // Console.log(actions);
  // }
  return actions;
}

// #endregion
// #region 主函数
function main (): void {
  const stack: stat[] = [initStat];
  while (stack.length > 0) {
    const currentStat = stack.pop(); // 弹出当前状态,回到上一层
    if (currentStat === undefined) {break;}
    const nextStats = processStat(currentStat);
    for (let i = nextStats.length - 1; i >= 0; i--) {
      const item = nextStats[i];
      if (item !== undefined) {stack.push(item);} // 倒序压入子分支
    }
  }
  console.log("查找完成,开始生成缓存文件");

  // 打印所有全行动缓存
  for (let i = 0,len = maxturn; i < len; i++) {
    const cache = 全行动缓存[i];
    if (cache === undefined) {continue;}
    const cacheObj = Object.fromEntries(cache);
    const output = Object.entries(cacheObj)
      .map(([key,value]) => `${key}: ${value.toString()}`)
      .join("\n");
    writeFileSync(`src/311build/output/${i.toString()}回合结束缓存.log`,output);
  }
}

// #region 过回合逻辑
// 返回过回合后的状态
function passTurnMustDo (stat: stat,isDone?: boolean): null | stat {

  // WriteStatByTurn(stat);
  const newStat = deepCloneStat(stat);

  // If (generateXindongCacheKey(stat) === "9 回合,治安99,行动力156 市场[3,3,0,0,0,0]造币厂[0]巡查[0]伦直3贾范3公孙恭3公孙康92公孙度92徐荣3公孙渊3杨祚0卑衍0") {
  // Console.log(stat,"passTurnMustDo1");
  // }
  // 先计算本回合收入
  if (newStat.turn % 3 === 0) { // 发钱的回合
    newStat.实时金 += calMonthIncome(newStat);
  }

  // If (generateXindongCacheKey(newStat) === "9 回合,治安99,行动力156 市场[3,3,0,0,0,0]造币厂[0]巡查[0]伦直3贾范3公孙恭3公孙康92公孙度92徐荣3公孙渊3杨祚0卑衍0") {
  // Console.log(newStat,"passTurnMustDo3",isDone);
  // }
  // Region 最终结果钱多剪枝
  if (bestGold && newStat.turn === maxturn - 市场最小时间 - 3) {
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

    // If (generateXindongCacheKey(newStat) === "6 回合,治安99,行动力64 市场[3,3,3,0]造币厂[3]巡查[0]伦直3贾范3公孙恭3公孙康95公孙度95徐荣3公孙渊3杨祚3卑衍3") {
    // Console.log("passTurnMustDo3",newStat.turn,newStat.实时金,newStat.治安,_zhian,needGold,month9Income,newStat.moving["市场"].isBuilding,newStat.moving["造币厂"].isBuilding,newStat.实时金 - needGold + month9Income + Math.floor(maxLastTurnIncome * _zhian / 100),bestGold);
    // }
    if (newStat.实时金 - needGold + month9Income + Math.floor(maxLastTurnIncome * _zhian / 100) < bestGold) {
      recordPrune("最终结果钱比你多剪枝");

      // Console.log(newStat.实时金,newStat.turn,newStat.moving["市场"].isBuilding,newStat.moving["造币厂"].isBuilding,newStat.治安,bestGold);
      return null;
    }

    // Region 最终结果逐回合剪枝
    // 根据最终的结果,依次判断 治安 市场完成时间数 造币厂完成时间数.只要发现任意一个值能比最好结果好,即可通过 否则剪枝
  } else if (bestGold && newStat.turn < maxturn - 市场最小时间 - 3) {
    const bestStat = bestResultArr[0];
    const bestDay = bestStat?.eachTrunStatWithMoney[newStat.turn];
    if (bestDay !== undefined) {
      let nowB = newStat.moving.市场.isBuilding;
      let bestB = bestDay.市场;

      // Console.log(nowB,bestB);
      const isComP市场 = isCalBestBuildingEd(bestB,nowB,newStat.turn);
      nowB = newStat.moving.造币厂.isBuilding;
      bestB = bestDay.造币厂;
      const isComP造币厂 = isCalBestBuildingEd(bestB,nowB,newStat.turn);
      if (!(isComP市场 || isComP造币厂 || newStat.治安 >= bestDay.治安)) {
        recordPrune("啥都比不过最终结果剪枝");
        return null;
      }
    }
  }
  newStat.turn++; // 加回合数
  const {moving,wujiangData} = newStat;

  // 处理建造进度
  for (const mov in moving) {
    const buildingArr = moving[mov as keyof Moving].isBuilding;
    for (let i = 0,len = buildingArr.length; i < len; i++) {
      const current = buildingArr[i];
      if (current !== undefined) {buildingArr[i] = Math.max(current - 1,0);}
    }
  }

  // 武将空闲时间减少
  for (const wujiangName in wujiangData) {
    const eachMoving = wujiangData[wujiangName];
    if (eachMoving === undefined) {continue;}
    eachMoving.free = Math.max(eachMoving.free - 1,0);
  }
  newStat.eachTrunStatWithMoney[newStat.turn - 1] = {
    市场:  [...moving.市场.isBuilding],
    治安:  newStat.治安,
    造币厂: [...moving.造币厂.isBuilding]
  };
  newStat.行动力 = Math.min(newStat.行动力 + baseStat0.每回合回复行动力,255);
  const currentXindongCacheKey = generateXindongCacheKey(newStat);

  // 如果这个状态上面没跳出,那么这里能拦截 超过 maxturn 的状态直接丢弃
  if (newStat.turn > maxturn) {
    recordPrune("回合超出剪枝");
    return null;
  }

  // If (generateXindongCacheKey(newStat) === "9 回合,治安99,行动力196 市场[0,0,0,0]造币厂[0]巡查[0]伦直0贾范0公孙恭0公孙康92公孙度92徐荣0公孙渊0杨祚0卑衍0") {
  // Console.log(newStat,"passTurnMustDo2",全行动缓存.has(currentXindongCacheKey),全行动缓存.get(currentXindongCacheKey));
  // }
  // 故意设置的是 stat.turn 因为 如果是 newStat.turn 那么这里的记录就是7回合,原意是记录所有6回合结束的状态
  // 记录的操作时 '回合结束 x 回合' 这时候的状态 所以实际上是上一个回合的状态
  const cache = 全行动缓存[stat.turn];
  if (cache !== undefined) {
    if (cache.has(currentXindongCacheKey) && (cache.get(currentXindongCacheKey) ?? 0) >= newStat.实时金) {
      recordPrune("支配剪枝");
      return null;
    }
    cache.set(currentXindongCacheKey,newStat.实时金);
  }
  newStat.xunchaEd = false;
  newStat.行动.push(`回合结束 ${currentXindongCacheKey} 实时金:${newStat.实时金.toString()}`); // 过回合
  if (isDone) {
    const _newStat = executeTurnAction(newStat);
    recordPrune("全做完剪枝");
    if (_newStat) {
      recordFinalResult(_newStat);
    }
    return null;
  }
  return newStat;
}

// #region 根据行动力选操作
// 返回执行了操作后的 stat 数组
function processStat (stat: stat): stat[] {
  const results: stat[] = [];

  // If (generateXindongCacheKey(stat) === "9 回合,治安89 市场[0,0,0,0,3]造币厂[0]巡查[0]伦直3贾范0公孙恭0公孙康92公孙度92徐荣0公孙渊0杨祚0卑衍0") {
  // Console.log(stat,"processStat1");
  // }
  const newStat = executeTurnAction(stat);   // 先执行必做操作
  if (!newStat) {return results;}
  if (newStat.turn > maxturn) {  // 检查是否需要结束
    results.push(newStat);
    return results;
  }
  let actions: ActionChoice[] = [];
  const xindongli = newStat.行动力;
  if (xindongli < 10) {
    const statAfterPass = passTurnMustDo(newStat);     // 行动力不足,直接过回合
    if (statAfterPass) {
      results.push(statAfterPass);
      return results;
    }
  } else if (xindongli > 10 && xindongli < 20) {
    if ("吸收合并" in newStat.moving) {
      actions = getAllPossibleActions(newStat,["吸收合并"]);
    } else {
      const statAfterPass = passTurnMustDo(newStat);     // 行动力不足,直接过回合
      if (statAfterPass) {
        results.push(statAfterPass);
        return results;
      }
    }
  } else if (xindongli >= 20) {
    const ACTION_PRIORITY: (keyof Moving)[] = [];

    // 务必大建筑发前面小建筑放后面,这样大建筑无法做的时候 直接剪枝
    if (newStat.moving["造币厂"].isBuilding.length < newStat.moving["造币厂"].mustBuildIn && 造币厂最小时间 + newStat.turn <= maxturn) {
      ACTION_PRIORITY.push("造币厂");
    }
    if (newStat.moving["市场"].isBuilding.length < newStat.moving["市场"].mustBuildIn && 市场最小时间 + newStat.turn <= maxturn) {
      ACTION_PRIORITY.push("市场");
    }
    if (newStat.治安 < 能接受的最大治安 && !newStat.xunchaEd) {
      ACTION_PRIORITY.push("巡查");
    }

    // 有事情做的时候 才考虑 '啥都不做' 操作
    if (ACTION_PRIORITY.length > 0) {
      ACTION_PRIORITY.push("啥都不做");
    }

    // If (generateXindongCacheKey(stat) === "9 回合,治安99,行动力196 市场[0,0,0,0]造币厂[0]巡查[0]伦直0贾范0公孙恭0公孙康92公孙度92徐荣0公孙渊0杨祚0卑衍0") {
    // Console.log(stat,"processStat3",ACTION_PRIORITY);
    // }
    // 找武将干活 获取所有武将干这个活的搭配
    actions = getAllPossibleActions(newStat,ACTION_PRIORITY);

    // If (generateXindongCacheKey(stat) === "9 回合,治安89 市场[0,0,0,0,3]造币厂[0]巡查[0]伦直3贾范0公孙恭0公孙康92公孙度92徐荣0公孙渊0杨祚0卑衍0") {
    // Console.log(stat,"processStat4",actions);
    // }
  }
  for (const action of actions) {
    const statAfterAction = executeAction(newStat,action);
    if (statAfterAction) { // 如果返回 null,说明这个分支被剪枝了,跳过

      // If (generateXindongCacheKey(statAfterAction) === "6 回合,治安99,行动力84 市场[3,3,0]造币厂[3]巡查[0]伦直0贾范3公孙恭3公孙康95公孙度95徐荣3公孙渊3杨祚0卑衍0") {
      // Console.log(statAfterAction,"porcessStat2",results);
      // }
      results.push(statAfterAction);
    }
  }
  return results;
}

// #region 记录最终结果 只有全做完要做的操作才会进来
/**
 * 记录最终结果
 * @param stat 最终状态
 */
function recordFinalResult (stat: stat): undefined {

  // 给他加上最后的全经济
  for (let i = stat.turn,len = maxturn; i <= len; i++) {
    if (i % 3 === 0) {

      // If (generateXindongCacheKey(stat) === "10 回合,治安99,行动力156 市场[3,3,0,0,0,0]造币厂[0]巡查[0]伦直3贾范3公孙恭3公孙康92公孙度92徐荣3公孙渊3杨祚0卑衍0") {
      // Console.log(stat.turn,stat.实时金,"recordFinalResult1",i,stat.治安,calMonthIncome(stat,i,stat.治安));
      // }
      stat.实时金 += calMonthIncome(stat,i,stat.治安);
    }
  }

  // If (stat.实时金 === 3628) {
  // Console.log("==================");
  // }
  // Console.log(stat.turn,stat.实时金,stat.治安,stat.moving["市场"].isBuilding,stat.moving["造币厂"].isBuilding,bestGold);
  // Console.log("=========================");
  // 减少必要的回合固定消耗 因为可能这个消耗晚于你这个全做完的回合 9回合刚好算10回合的 turnMustDo
  const turnMustDo = baseStat0.thisTurnMustDo;
  for (let i = stat.turn,len = turnMustDo.length; i < len; i++) {
    const item = turnMustDo[i];
    if (item?.金币消耗) {
      stat.实时金 -= item.金币消耗;
    }
  }
  stat.行动.push(`最终结果 ${generateXindongCacheKey(stat)} 实时金:${stat.实时金.toString()}`);
  updateBestResultMap(stat);
}
function runApp (): void {
  bestGold = getBestGold();
  try {
    bestResultArr = JSON.parse(readFileSync("src/result.json","utf8")) as stat[];
  } catch (error) {
    console.log("无最大值",error);
  }
  console.log(getBestGold());
  console.log("最大经济:",bestGold);
  init();
  main();
}
function updateBestResultMap (stat: stat): void {
    if (stat.实时金 > bestGold) {
      bestResultArr = [stat];
      bestGold = stat.实时金;
      console.log("更好结果",`最终金额 ${stat.实时金.toString()}`,stat.行动.at(-1));
      myWirteFile("result",bestResultArr,true);
    } else if (stat.实时金 === bestGold) {
      bestResultArr.push(stat);

      // Console.log("相同结果",`最终金额 ${stat.实时金.toString()} `,stat.行动.at(-1));
      myWirteFile("result",bestResultArr);
    }
  }
runApp();