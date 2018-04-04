/**************************************
多交易对现货短线程序化操作策略V1.0
说明：
1.因为多个交易对收益合并到一个曲线，所以同一个机器人使用的基础货币要是一样的。
2.在牛市的环境下，以持币升值为主，只在死叉的时候止盈卖出一定比例（如30%），仅在掉出防守线（持仓成本价）的时候止损平仓，以过滤掉过多的卖出信号，长时间持币
3.在熊市的环境下，以波段操作为主，谨慎买入积极止盈，只要有见顶信号或是逃顶信号就卖出一定比例（如50%）止盈，在死叉出现或掉出防守线时平仓退出，找机会再建仓，更多更积极的短信操作。
4.短线操作每次都会全仓操作，所以不能与长线投资策略共用交易对，否则会被低价卖出的风险

支持多个交易对，参数通过JSON传递过来
MarketEnvironment	市场环境	0表示熊市，1表示牛市，据据不同的市场环境下操作策略有所区别	下拉选择	熊市|牛市
ArgsJson	策略参数JSON内容	JSON内容为以下多个交易对的数组JSON	字符串型(string)

单个交易对的策略参数如下
参数	描述	类型	默认值
TradePairName	交易对名称	字符串型(string)	
BalanceLimit	买入金额数量限制	数字型(number)	300
NowCoinPrice	当前持仓价格		数字型(number)	0
BuyFee	平台买入手续费		数字型(number)	0.002
SellFee	平台卖出手续费		数字型(number)	0.002
PriceDecimalPlace	交易对价格小数位		数字型(number)	2 
StockDecimalPlace	交易对数量小数位		数字型(number)	4 
MinStockAmount	限价单最小交易数量		数字型(number)	1
Debug	调试状态	1为开打当前交易对日志信息，0为关闭	数字型(number)	0

策略交互如下
NewBalanceLimit	更新买入金额数量限制	填写格式：TradePairName|Balance    字符串型(string) _|_
Debug	更新调试状态	值的填写格式如下:TradePairName(更新全部交易对用ALL)|0/1 字符串型(string) ALL|0
************************************************/

//全局常数定义
//操作类型常量
var OPERATE_STATUS_NONE = -1;
var OPERATE_STATUS_BUY = 0; 
var OPERATE_STATUS_SELL_TARGETPROFIT = 1;
var OPERATE_STATUS_SELL_COSTPRICE = 2;
var OPERATE_STATUS_SELL_INSTANT = 3;
//单次止盈卖出账户币数比例
var TARGET_PROFIT_PERCENT = 0.3;	//每次止盈卖出持仓总量的比例

//全局变量定义
function TradePair(){
	this.Name = "";	//交易对名称,用于定量加前缀，格式如Huobi_LTC_BTC
	this.Title = "";	//交易对标题，用于表格显示，格式如Huobi/LTC_BTC
	this.Exchange = {};	//交易所对像exchange
	this.TPInfo = {};	//交易对当前信息
	this.Args = {};	//本交易对参数
	this.LastUpdate = {};	//最后更新时间
}
var TradePairs = [];	//所有交易对数组
var NowTradePairIndex = 0;		//当前的交易所对索引
var TotalProfit = 0;	//策略累计收益
var StartTime = _D();	//策略启动时间
var TickTimes = 0;		//刷新次数
var ArgTables;		//已经处理好的用于显示的参数表，当参数更新时置空重新生成，以加快刷新速度
var AccountTables;	//当前的账户信息表，如果当前已经有表，只要更新当前交易对，这样可以加快刷新速度，减少内存使用

//取得交易所对像
function getExchange(name){
	var e;
	for(var i=0;i<exchanges.length;i++){
		var exchangeName = exchanges[i].GetName()+"_"+exchanges[i].GetCurrency();
		if(exchangeName == name){
			e = exchanges[i];
			break;
		}
	}
	return e;
}

//验证JSON内容格式
function isJSON(str) {
    if (typeof str == 'string') {
        try {
            var obj=JSON.parse(str);
            if(typeof obj == 'object' && obj ){
                return true;
            }else{
                return false;
            }

        } catch(e) {
            Log("不正确的JSON格式内容！请确认参数JSON内容是否正确！");
            return false;
        }
    }
}

//初始运行检测
function checkArgs(tp){
	var ret = true;
	var a = tp.Args;
	//检测参数的填写
	if(a.BalanceLimit === 0){
		Log(tp.Name,"交易对参数：买入金额数量限制为0，必须填写此字段。 #FF0000");
		ret = false;
	}
	var Account = _C(tp.Exchange.GetAccount);
	if(Account.Stocks > 0 && a.NowCoinPrice === 0){
		Log(tp.Name,"交易对参数：当前持仓价格为0，但账户有持仓，必须填写此字段。 #FF0000");
		ret = false;
	}
	if(a.BuyFee === 0 || a.SellFee === 0){
		Log(tp.Name,"交易对参数：平台买卖手续费为0，必须填写此字段。 #FF0000");
		ret = false;
	}
	if(a.PriceDecimalPlace === 0 || a.StockDecimalPlace === 0){
		Log(tp.Name,"交易对参数：交易对价格/数量小数位为0，必须填写此字段。 #FF0000");
		ret = false;
	}
	if(a.MinStockAmount === 0){
		Log(tp.Name,"交易对参数：限价单最小交易数量为0，必须填写此字段。 #FF0000");
		ret = false;
	}
	Log(tp.Title,"交易对接收参数如下：买入金额数量限制", a.BalanceLimit, "，当前持仓价格为，", a.NowCoinPrice, "，平台买卖手续费（", a.BuyFee, a.SellFee,"），交易对价格/数量小数位（", a.PriceDecimalPlace, a.StockDecimalPlace,"），限价单最小交易数量", a.MinStockAmount,"，调试开关", a.Debug);
	return ret;
}

//解释参数JSON内容
function parseArgsJson(json){
	Log("准备解析传入的JSON参数...");
	var ret = false;
	if(isJSON(json)){
		Log("JSON格式检测通过...");
		var args = eval(json);
		if(args){
			Log("JSON转成JS对像成功，传入交易对参数有",args.length,"对...");
			for(var i=0;i<args.length;i++){
				var tp = new TradePair();
				tp.Name = args[i].ExchangeName+"_"+args[i].TradePairName;
				tp.Title = args[i].ExchangeName+"/"+args[i].TradePairName;
				var Args = {
					BalanceLimit:args[i].BalanceLimit,
					NowCoinPrice:args[i].NowCoinPrice,
					BuyFee:args[i].BuyFee,
					BuyFee:args[i].BuyFee,
					SellFee:args[i].SellFee,
					PriceDecimalPlace:args[i].PriceDecimalPlace,
					StockDecimalPlace:args[i].StockDecimalPlace,
					MinStockAmount:args[i].MinStockAmount,
					Debug:args[i].Debug
				};					
				tp.Args = Args;
				tp.Exchange = getExchange(tp.Name);
				if(tp.Exchange){
					Log("匹配到交易对：",tp.Title);
					//检测参数的填写
					if(!checkArgs(tp)){
						continue;
					}
					TradePairs.push(tp);
					//初始化其他参数
					_G(tp.Name+"_BalanceLimit",Args.BalanceLimit);
					if(!_G(tp.Name+"_AvgPrice")) _G(tp.Name+"_AvgPrice",Args.NowCoinPrice);
					if(!_G(tp.Name+"_BuyTimes")) _G(tp.Name+"_BuyTimes",0);
					if(!_G(tp.Name+"_SellTimes")) _G(tp.Name+"_SellTimes",0);
					if(!_G(tp.Name+"_SubProfit")) _G(tp.Name+"_SubProfit",0);
					if(!_G(tp.Name+"_LastBuyTS")) _G(tp.Name+"_LastBuyTS",0);
					if(!_G(tp.Name+"_LastBuyPrice")) _G(tp.Name+"_LastBuyPrice",0);
					if(!_G(tp.Name+"_StopLinePrice")) _G(tp.Name+"_StopLinePrice",0);
					if(!_G(tp.Name+"_LastSignalTS")) _G(tp.Name+"_LastSignalTS",0);
					if(!_G(tp.Name+"_TargetProfitTimes")) _G(tp.Name+"_TargetProfitTimes",0);
					if(!_G(tp.Name+"_CanTargetProfitNum")) _G(tp.Name+"_CanTargetProfitNum",0);		
					if(!_G(tp.Name+"_EveryTimesTPSN")) _G(tp.Name+"_EveryTimesTPSN",0);							
					if(!_G(tp.Name+"_CanBuy")) _G(tp.Name+"_CanBuy",1);
					if(!_G(tp.Name+"_LastOrderId")) _G(tp.Name+"_LastOrderId",0);
					if(!_G(tp.Name+"_OperatingStatus")) _G(tp.Name+"_OperatingStatus",OPERATE_STATUS_NONE);
					if(!_G(tp.Name+"_AddTime")) _G(tp.Name+"_AddTime",_D());
					ret = true;
				}else{
					Log("未匹配交易对参数：",tp.Name,"请确认交易对的添加是否正确！");
				}
			}
		}
		Log("成功匹配到",TradePairs.length,"个交易对。");
	}
	return ret;
}
//初始化运行参数
function init(){
	//重置日志
    LogReset();
	SetErrorFilter("403:|502:|503:|Forbidden|tcp|character|unexpected|network|timeout|WSARecv|Connect|GetAddr|no such|reset|http|received|EOF|reused");

	Log("启动多交易对现货短线程序化操作策略程序...");  

	//初始化存储变量
	if(!_G("TotalProfit")) _G("TotalProfit",0);

	//解析JSON参数
	parseArgsJson(ArgsJson);
}

/***************************
**识别当前K线型状
型状和值对应如下：
100.十字星
15.大阳线
14.光头大阳线
13.光脚大阳线
12.上下有影大阳线
11.光头阳线
10.光脚阳线
9.上锤头阳线
8.下锤头阳线
7.小阳线
6.上下有影阳线
5.上下有影下阳线
4.上下有影上阳线
3.上剑型阳线
2.下剑型阳线
1.T字型
0.一字型或当前刚刚开盘
-1.倒T字型
-2.下剑型阴线
-3.上剑型阴线
-4.上下有影上阴线
-5.上下有影下阴线
-6.上下有影阴线
-7.小阴线
-8.下锤头阴线
-9.上锤头阴线
-10.光脚阴线
-11.光头阴线
-12.上下有影大阴线
-13.光脚大阴线
-14.光头大阴线
-15.大阴线
***************************/
function getTickerType(record){
    var high = record.High;
    var low = record.Low;
    var open = record.Open;
    var close = record.Close;
    var ret = 0;
    var max = Math.max(open,close);
    var min = Math.min(open,close);
    if(open == close || (max/min) < 1.0002){
        //一字型或十字星
        if(high == low && (high == open || low == close)){
            //0.一字型或刚刚开盘
        }else if(open == high){
            //1.T字型
            ret = 1;
        }else if(open == low){
            //-1.倒T字型
            ret = -1;
        }else{
            //100.十字星   
            ret = 100;
        }
    }else if(open < close){
        //阳线部分
        if(open == low && close == high){
            //纯阳线
            if(high/low > 1.01){
                //15.大阳线
                ret = 15;
            }else{
                //7.小阳线
                ret = 7;
            }
        }else if(open == low && close < high){
            //有上影线
            if(close < ((high-low)/3+low)){
                //8.下锤头阳线
                ret = 8;
            }else if(close > ((high-low)/2+low) && (close/open)>1.01){
                //13.光脚大阳线
                ret = 13;
            }else{
                //10.光脚阳线
                ret = 10;
            }
        }else if(open > low && close == high){
            //有下影线
            if(open > ((high-low)/3*2+low)){
                //9.上锤头阳线
                ret = 9;
            }else if(open < ((high-low)/3+low) && (close/open)>1.01){
                //14.光头大阳线
                ret = 14;
            }else{
                //11.光头阳线
                ret = 11;
            }
        }else{
            //上下影线都有
            if((close-open) > (high-low)/10){
                //正常阳线
                if((close/open)>1.01 && ((close-open) > (high-low)/2)){
                    //12.上下有影大阳线
                    ret = 12;
                }else if(open >= ((high-low)/2+low) && ((close-open) < (high-low)/2)){
                   //4.上下有影上阳线    
                   ret = 4;
                }else if(close <= ((high-low)/2+low) && ((close-open) < (high-low)/2)){
                   //5.上下有影下阳线    
                   ret = 5;
                }else{
                   //6.上下有影阳线   
                   ret = 6;
                }
            }else{
                //剑型阳线
                if(close < ((high-low)/2+low)){
                    //2.下剑型阳线
                    ret = 2;
                }else{
                    //3.上剑型阳线
                    ret = 3;
                }
            }
        }
    }else{
        //阴线部分
        if(close == low && open == high){
            //纯阴线
            if(high/low > 1.01){
                //-15.大阴线
                ret = -15;
            }else{
                //-7.小阴线
                ret = -7;
            }
        }else if(close == low && open < high){
            //有上影线
            if(open < ((high-low)/3+low)){
                //-8.下锤头阴线
                ret = -8;
            }else if(open > ((high-low)/2+low) && (open/close)>1.01){
                //-13.光脚大阴线
                ret = -13;
            }else{
                //-10.光脚阴线
                ret = -10;
            }
        }else if(close > low && open == high){
            //有下影线
            if(close > ((high-low)/3*2+low)){
                //-9.上锤头阴线
                ret = -9;
            }else if(close < ((high-low)/3+low) && (open/close)>1.01){
                //-14.光头大阴线
                ret = -14;
            }else{
                //-11.光头阴线
                ret = -11;
            }
        }else{
            //上下影线都有
            if((open-close) > (high-low)/10){
                //正常阴线
                if((open/close)>1.01 && ((open-close) > (high-low)/2)){
                    //-12.上下有影大阴线
                    ret = -12;
                }else if(close >= ((high-low)/2+low) && ((open-close) < (high-low)/2)){
                   //-4.上下有影上阴线    
                   ret = -4;
                }else if(open <= ((high-low)/2+low) && ((open-close) < (high-low)/2)){
                   //-5.上下有影下阴线    
                   ret = -5;
                }else{
                   //-6.上下有影阴线   
                   ret = -6;
                }
            }else{
                //剑型阴线
                if(open < ((high-low)/2+low)){
                    //-2.下剑型阴线
                    ret = -2;
                }else{
                    //-3.上剑型阴线
                    ret = -3;
                }
            }
        }
    }
    return ret;
}

//获得EMA当前交叉数
function getEmaCrossNum(emaarray1,emaarray2){
    var crossNum = 0;
    for (var i = emaarray2.length-1; i >= 0; i--) {
        if (typeof(emaarray1[i]) !== 'number' || typeof(emaarray2[i]) !== 'number') {
            break;
        }
        if (emaarray1[i] < emaarray2[i]) {
            if (crossNum > 0) {
                break;
            }
            crossNum--;
        } else if (emaarray1[i] > emaarray2[i]) {
            if (crossNum < 0) {
                break;
            }
            crossNum++;
        } else {
            break;
        }
    }
    return crossNum;
}

//识别当前K线类型并添加结果到K线数组当中
function addTickerType(records){
    for(var i=0;i<records.length;i++){
        records[i].Type = getTickerType(records[i]);
    }
}


/*************************
判断当前是否适合买入
判断依据：
1.当前处于金叉之后的阳线，且阳线为上升形K线
2.当前价格在14日均线之上
3.当前K线往前推直到找到阴线为止的最后一条阳线的开盘价与当前价差要超过百分之一
4.当前K线往前就是阴线的话那当前K线的开盘价与当前价差要超过百分之1.5
5.并且成交量要大于平均值
必须同时满总以上条件才可以
买入点的检测为的是在小幅震荡阴跌行情下频繁买入卖出
*************************************/
function checkCanBuy(records, ticker, ma, crossnum){
	Log("判断当前是否适合买入");
    var ret = false;
	var ktypes = [4, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    var nowticker = records[records.length-1];
    var manow = ma[ma.length-1];
    if(crossnum > 0 && nowticker.Close > manow && ktypes.indexOf(nowticker.Type) != -1){
		//满总前两个条件，判断后三个条件
		Log("满总前两个条件，判断后三个条件");
		var volumeok = false;
		var fristticker = nowticker;
		//计算平均成交量
		var kcycle = (records[records.length-1].Time-records[records.length-2].Time)/60000;
		var knuminhour = 60/kcycle;
		var dayavgvolume = ticker.Volume/24/knuminhour;
		//判断当前K线成交易够不够
		if(dayavgvolume < nowticker.Volume){
			Log("当前K线成交量大于平均值，达到成交量的条件");
			volumeok = true;
			//也要找到第一根阳K线
			for(var i= records.length-2;i>-1;i--){
				if(records[i].Type <= 0){
					break;
				}else{
					//找到上一条阳线
					fristticker = records[i];
				}
			}
		}else{
			//当前K线不够，可能是当前K线刚刚开始，算前几条K线平均值
			var subvolume = 0;
			var knum = 0;
			for(var i= records.length-2;i>-1;i--){
				if(records[i].Type <= 0){
					break;
				}else{
					//找到上一条阳线
					fristticker = records[i];
					subvolume += fristticker.Volume;
					knum++;
				}
			}
			Log("nowticker",_D(nowticker.Time),"fristticker",_D(fristticker.Time),"不包当前K的knum",knum,"subvolume",subvolume);
			if(dayavgvolume < subvolume/knum){
				//满总成交量的条件
				Log("不算当前K往前推的所有阳线平均成交量，达到成交量的条件");
				volumeok = true;
			}
		}
		if(volumeok){
			Log("满足成交量的条件，再来判断涨幅是否能达到条件");
			if(fristticker.Time == nowticker.Time && nowticker.Close/fristticker.Open > 1.02 || fristticker.Time != nowticker.Time && (nowticker.Close/fristticker.Open > 1.015 || (nowticker.Close/records[records.length-crossnum].Open) > 1.015)){
				//符合买入条件
				ret = true;
				Log("符合买入条件");
			}
		}
	}
    return ret;
}

/********************
识别阴阳阴K线特征
当前K线的最低价可能随时有可能低于14日均线，然后又升收盘，所以之前还没有确认出现过阴阳阴之前往前看一条K线
之前确实出现过阴阳阴那就看当前信号
***********************/
function identifyYinYangYin(tp, records, ma, crossnum){
	Log("识别阴阳阴K线特征");
    var ret = false;
    var readid = 1;
    //如果之前没出现过信号（lastsignalts = 0）就往前看一根K线为准，已经出现过信号，那就看当前K线实时信号
	var lastsignalts = _G(tp.Name+"_LastSignalTS");
    if(lastsignalts > 0){
		//发生过信号，判断信号点是否就是当前K，如果是不重复操作
		if(lastsignalts == records[records.length-1].Time) return ret; //不在同一跟K线进行多次止盈
	}else{
		readid = 2;
	}
    var nowticker = records[records.length-readid];
    var manow = ma[ma.length-readid];
    //首先判断K线的收盘价是否在14均线之下
    if(nowticker.Close < manow){
        //首要条件成立，再判断当前收盘价是否已经低于均价，如果低也算是阴阳阴
		if(nowticker.Close < _G(tp.Name+"_AvgPrice")){
			ret = true;
		}else{
			//如果没有低于均价，回找当前K线之前的K线有没有出现收盘价较高的阴线
			var start = records.length-readid;
			var end = start - crossnum;
			var haveyangk = false;
			for(var i = start;i>end;i--){
				if(records[i].Type > 0){
					haveyangk = true;    
				}
				//判断是否有收盘价高于当前K的阴线
				if(haveyangk && records[i].Type < 0 && records[i].Close > nowticker.Close){
					ret = true;
					break;
				}
			}
		}
		if(ret && tp.Args.Debug){
			if(lastsignalts > 0){
				Log("当前K线出现阴阳阴信号，上一次出现止盈信号是在",_D(lastsignalts));
			}else{
				Log("当前K线出现阴阳阴信号，这是买入后第一次出现");
			}
        }
    }
    return ret;
}

/********************************
识别顶部抛压信号,抛压压力源于空车势力太强，空单太多，多方上攻无力。
在波段的顶部出现十字星、倒T字型-1、下剑型阴/阳线、下锤头阴/阳线及上下有影下阴/阳线，光脚阴线，光脚大阴线和大阴线，这些一个或多个这类长上影线的K线时，说明顶部抛压严重
如果是之前没有出现过信号，那么就看上一个，如果有现过就看当前K
顶部抛压信号必须当前K线为阴线
*********************************/
function identifyTopSellOffSignal(tp, records){
	Log("识别顶部抛压信号");
    var ret = false;
    var signs = [-1, -2, -5, -8, -10, -13, -15, 2, 5, 8, 100];
    var readid = 2;
    //如果之前没出现过信号（lastsignalts = 0）就往前看一根K线为准，已经出现过信号，那就看当前K线实时信号
	var lastsignalts = _G(tp.Name+"_LastSignalTS");
	if(lastsignalts == records[records.length-1].Time) return ret; //不在同一跟K线进行多次止盈
	//if(records[records.length-1].Type>0) return ret;	//如果当前K线是阳线状态就不理
	//获取买入后的最高价
	var maxprice = records[records.length-1].High;
	var lastbuyts = _G(tp.Name+"_LastBuyTS");
	for(var i=records.length-readid;i>=0;i--){
		if(records[i].Time>=lastbuyts){
			maxprice = Math.max(maxprice,records[i].High);
		}else{
			break;
		}
	}
    var nowticker = records[records.length-readid];
	Log("nowticker.Time",_D(nowticker.Time));
	Log("nowticker.Type",nowticker.Type);
    if((nowticker.High > maxprice || (maxprice/nowticker.High) < 1.01) && signs.indexOf(nowticker.Type) != -1){
        ret = true;
		if(tp.Args.Debug){
			if(lastsignalts > 0){
				Log("当前K线出现顶部抛压做空信号，上一次出现止盈信号是在",_D(lastsignalts));
			}else{
				Log("当前K线出现顶部抛压做空信号，这是买入后第一次出现");
			}
		}
    }
    return ret;
}

/***************************
识别庄家快速拉升之后快速出货（俗称：乌云盖顶）
上一个是长阳线，后一个是大阴线，后然阴线收盘价掉到了上一阳线的一半以下
***************************/
function identifyDarkCloudCover(tp, records){
	Log("识别庄家快速拉升之后快速出货（俗称：乌云盖顶）");
    var ret = false;
    var readid = 1;
    //如果之前没出现过信号（lastsignalts = 0）就往前看一根K线为准，已经出现过信号，那就看当前K线实时信号
	var lastsignalts = _G(tp.Name+"_LastSignalTS");
    if(lastsignalts > 0){
		//发生过信号，判断信号点是否就是当前K，如果是不重复操作
		if(lastsignalts == records[records.length-1].Time) return ret; //不在同一跟K线进行多次止盈
	}else{
		readid = 2;
	}
    var nowticker = records[records.length-readid];
    var lastticker = records[records.length-readid-1];
    var nowtype = [-4, -5, -6, -7, -10, -11, -12, -13, -14, -15];
    var middletype = [7, 10, 11]; //中阳线
    var bigtype = [12, 13, 14, 15]; //大阳线
	Log(nowtype.indexOf(nowticker.Type)," != -1 && (",bigtype.indexOf(lastticker.Type)," != -1 || ",middletype.indexOf(lastticker.Type)," != -1 && ",lastticker.Close/lastticker.Open," > 1.006 || (",lastticker.Type," > 0 && ",(nowticker.High-nowticker.Low)," > ",(lastticker.High-lastticker.Low),"))");
    if(nowtype.indexOf(nowticker.Type) != -1 && (bigtype.indexOf(lastticker.Type) != -1 || middletype.indexOf(lastticker.Type) != -1 && lastticker.Close/lastticker.Open > 1.006 || (lastticker.Type > 0 && (nowticker.High-nowticker.Low) > (lastticker.High-lastticker.Low) && nowticker.Close < ((lastticker.High-lastticker.Low)/2+lastticker.Low)))){
		Log("符合第一条件")
		//线型是符合了，再看看后K体是否超过前K体的一半，并且收盘价低于前K收盘价的一半
        if((nowticker.Open-nowticker.Close) > (lastticker.Close - lastticker.Open)/2 && nowticker.Close < ((lastticker.High-lastticker.Low)/2+lastticker.Low)){
            ret = true;    
        }else if((nowticker.High - nowticker.Low) > (lastticker.High-lastticker.Low)){
			//可能最后收盘不一定是在上条K体中间，但是最大下跌幅定超过了上个K线的上升幅度
			ret = true;
		}
		if(ret && tp.Args.Debug){
			if(lastsignalts > 0){
				Log("当前K线出现乌云盖顶的庄家拉升出货信号，上一次出现止盈信号是在",_D(lastsignalts));
			}else{
				Log("当前K线出现乌云盖顶的庄家拉升出货信号，这是买入后第一次出现");
			}
		}
    }
    return ret;
}

//从帐户中获取当前持仓信息
function getAccountStocks(account){
	var stocks = 0;
	if(account) stocks = account.Stocks;
	return stocks;
}

//处理卖出成功之后数据的调整
function changeDataForSell(tp,account,order){
	//算出扣除平台手续费后实际的数量
	var avgPrice = _G(tp.Name+"_AvgPrice");
	var TotalProfit = _G("TotalProfit");
	var SubProfit = _G(tp.Name+"_SubProfit");
	var profit = parseFloat((order.AvgPrice*order.DealAmount*(1-tp.Args.SellFee) - avgPrice*order.DealAmount*(1+tp.Args.BuyFee)).toFixed(tp.Args.PriceDecimalPlace));
	SubProfit += profit;
	TotalProfit += profit;
	tp.Profit = SubProfit;
	_G(tp.Name+"_SubProfit", SubProfit);
	_G("TotalProfit", TotalProfit);
	LogProfit(TotalProfit);
	
	if(order.DealAmount === order.Amount ){
		Log(tp.Title,"交易对订单",_G(tp.Name+"_LastOrderId"),"交易成功!平均卖出价格：",order.AvgPrice,"，平均持仓价格：",avgPrice,"，卖出数量：",order.DealAmount,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}else{
		Log(tp.Title,"交易对订单",_G(tp.Name+"_LastOrderId"),"部分成交!卖出数量：",order.DealAmount,"，剩余数量：",order.Amount - order.DealAmount,"，平均卖出价格：",order.AvgPrice,"，平均持仓价格：",avgPrice,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}
	
	//更新交易次数
	var tradeTimes = _G(tp.Name+"_SellTimes");
	tradeTimes++;
	_G(tp.Name+"_SellTimes",tradeTimes);
	
	//如果是止盈卖出的话,还要更新止盈次数和数量,如果只是部分成交不算
	if(_G(tp.Name+"_OperatingStatus") == OPERATE_STATUS_SELL_TARGETPROFIT){
		var canTargetProfitNum = _G(tp.Name+"_CanTargetProfitNum")-order.DealAmount;
		if(canTargetProfitNum <= tp.Args.MinStockAmount){
			//可止盈卖出数量接近0，表示做完一次止盈操作
			_G(tp.Name+"_CanTargetProfitNum", 0);
			var times = _G(tp.Name+"_TargetProfitTimes")+1;
			_G(tp.Name+"_TargetProfitTimes", times);
			Log(tp.Title,"交易对完成一次止盈操作。");
		}else{
			_G(tp.Name+"_CanTargetProfitNum", canTargetProfitNum);
		}
	}
}

//检测卖出订单是否成功
function checkSellFinish(tp, account, ticker, lastrecord){
    var ret = true;
	var lastOrderId = _G(tp.Name+"_LastOrderId");
	var order = tp.Exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		changeDataForSell(tp,account,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			changeDataForSell(tp,account,order);
		}else{
			Log(tp.Title,"交易对订单",lastOrderId,"未有成交!卖出价格：",order.Price,"，当前价：",ticker.Last,"，价格差：",_N(order.Price - ticker.Last, tp.Args.PriceDecimalPlace));
		}
		//撤消没有完成的订单
		tp.Exchange.CancelOrder(lastOrderId);
		Log(tp.Title,"交易对取消卖出订单：",lastOrderId);
		Sleep(1300);
	}
    return ret;
}

//处理买入成功之后数据的调整
function changeDataForBuy(tp,account,order){
	//读取原来的持仓均价和持币总量
	var avgPrice = _G(tp.Name+"_AvgPrice");
	var coinAmount = getAccountStocks(account);
	
	//计算持仓总价
	var Total = parseFloat((avgPrice*(coinAmount-order.DealAmount*(1-tp.Args.BuyFee))+order.AvgPrice * order.DealAmount).toFixed(tp.Args.PriceDecimalPlace));
	
	//计算并调整平均价格
	avgPrice = parseFloat((Total / coinAmount).toFixed(tp.Args.PriceDecimalPlace));
	_G(tp.Name+"_AvgPrice",avgPrice);
	
	//买入之后重置止损线，方便在策略里面进行设置。
	_G(tp.Name+"_StopLinePrice", avgPrice);
	
	if(order.DealAmount === order.Amount ){
		Log(tp.Title,"交易对买入订单",_G(tp.Name+"_LastOrderId"),"交易成功!成交均价：",order.AvgPrice,"，数量：",order.DealAmount,"，持仓价格调整到：",avgPrice,"，总持仓数量：",coinAmount,"，总持币成本：",Total);			
	}else{
		Log(tp.Title,"交易对买入订单",_G(tp.Name+"_LastOrderId"),"部分成交!成交均价：",order.AvgPrice,"，数量：",order.DealAmount,"，持仓价格调整到：",avgPrice,"，总持仓数量：",coinAmount,"，总持币成本：",Total);			
	}
	
	//设置最后一次买入价格,仅在买入量超过一半的情况下调整最后买入价格，没到一半继续买入
	if(order.DealAmount>(order.Amount/2)){
		_G(tp.Name+"_LastBuyPrice",order.AvgPrice);
	}
	
	//更新交易次数
	var tradeTimes = _G(tp.Name+"_BuyTimes");
	tradeTimes++;
	_G(tp.Name+"_BuyTimes",tradeTimes);

	//重置止盈相关变量
	_G(tp.Name+"_EveryTimesTPSN", 0);
	_G(tp.Name+"_CanTargetProfitNum", 0);
}

//检测买入订单是否成功
function checkBuyFinish(tp, account, ticker){
	var lastOrderId = _G(tp.Name+"_LastOrderId");
	var order = tp.Exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		//处理买入成功后的数据调整
		changeDataForBuy(tp,account,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			//处理买入成功后的数据调整
			changeDataForBuy(tp,account,order);
		}else{
			Log(tp.Title,"交易对买入订单",lastOrderId,"未有成交!订单买入价格：",order.Price,"，当前卖一价：",ticker.Sell,"，价格差：",_N(order.Price - ticker.Sell, tp.Args.PriceDecimalPlace));
		}
		//撤消没有完成的订单
		tp.Exchange.CancelOrder(lastOrderId);
		Log(tp.Title,"交易对取消未完成的买入订单：",lastOrderId);
		Sleep(1300);
	}
}

//取得指定交易对
function getTradePair(name){
	var tp;
	for(var i=0;i<TradePairs.length;i++){
		if(TradePairs[i].Name == name){
			tp = TradePairs[i];
			break;
		}
	}
	return tp;
}

//策略交互处理函数
function commandProc(){
    var cmd=GetCommand();
	if(cmd){
		var cmds=cmd.split(":");
		var values;
		var tp;
		if(cmds.length === 2){
			values = cmds[1].split("|");
			if(values.length === 2){
				if(values[0].toUpperCase() != "ALL"){
					tp = getTradePair(values[0]);
					if(!tp){
						Log("没有取到相应的交易对，请确认交易对名称的正确性，格式为交易所名_交易对名!。 #FF0000");
						return;
					}
				}
			}else{
				Log("提交的交互内容格式不正式，格式为_|_!。 #FF0000");
				return;
			}
			if(cmds[0] == "NewBalanceLimit"){
				if(values[1] == 0){
					Log(tp.Name,"输入的买入金额数量限制为0，拒绝操作！！！");
				}else{
					Log(tp.Name,"更新买入金额数量限制为",values[1]);
					_G(tp.Name+"_BalanceLimit",values[1]);
					ArgTables = null;
				}
			}else if(cmds[0] == "Debug"){
				if(values[0].toUpperCase() == "ALL"){
					for(var i=0;i<TradePairs.length;i++){
						TradePairs[i].Args.Debug = values[1];
					}
					Log("更新所有交易对调试状态为",values[1]," #FF0000");
				}else{
					if(tp){
						tp.Args.Debug = values[1];
						Log("更新",tp.Name,"交易对调试状态为",values[1]," #FF0000");
					}
				}
				ArgTables = null;
			}
		}else{
			Log("提交的交互内容格式不正式，格式为_|_! #FF0000");
		}
	}
}

//计算操作粒度（一次的操作数量）
function getOperateFineness(tp, type){
	var depth = _C(tp.Exchange.GetDepth);
	var totalamount = 0;
	var getlen = 0;
	if(type === 1){
		getlen = depth.Asks.length>=20 ? 20 : depth.Asks.length;
	}else{
		getlen = depth.Bids.length>=20 ? 20 : depth.Bids.length;
	}
	for(var i=0;i<getlen;i++){
		if(type === 1){
			//获取卖单1~20的累计数量
			totalamount += depth.Asks[i].Amount;
		}else{
			//获取买单1~20的累计数量
			totalamount += depth.Bids[i].Amount;
		}
	}
	return parseInt(totalamount/getlen);
}

//做买入交易
function doBuy(tp, Account, Ticker, lastrecordtime){
	//计算操作粒度（一次的操作数量）1为卖单，2为买单
	var operatefineness = getOperateFineness(tp, 1);
	var balancelimit = _G(tp.Name+"_BalanceLimit");
	//火币现货Buy()参数是买入个数，不是总金额
	var canpay = balancelimit - tp.TPInfo.CostTotal;
	if(Account.Balance < canpay){
		canpay = Account.Balance;
	}
	var canbuy = canpay/Ticker.Sell;
	var opAmount = canbuy > operatefineness? operatefineness : canbuy;
	opAmount = _N(opAmount, tp.Args.StockDecimalPlace);
	if(opAmount > tp.Args.MinStockAmount){
		Log("准备操作买入，限仓金额",balancelimit,"，还可买金额",canpay,"，可买数量",canbuy,"，本次买入数量",opAmount,"，当前卖1价格",Ticker.Sell); 
		var orderid = tp.Exchange.Buy(Ticker.Sell,opAmount);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_BUY);	
			_G(tp.Name+"_LastBuyTS", lastrecordtime);
			_G(tp.Name+"_LastSignalTS", 0);
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		//买入操作完成。
		Log("当交易对持仓成本",tp.TPInfo.CostTotal,"，限仓金额",balancelimit,"，账户余额",Account.Balance,"，算出的可买数量只有",opAmount,"，已经无法继续买入，买入操作完成。");
	}
}

//做止盈卖出交易
function doTargetProfitSell(tp, Account, Ticker){
	//计算操作粒度（一次的操作数量）1为卖单，2为买单
	var operatefineness = getOperateFineness(tp, 2);
	var canTargetProfitNum = _G(tp.Name+"_CanTargetProfitNum");
	if(canTargetProfitNum === 0){
		var persell = _G(tp.Name+"_EveryTimesTPSN");
		if(persell === 0){
			persell = Account.Stocks*TARGET_PROFIT_PERCENT;	//一次止盈按设定比例（如50%），但按操作粒度来操作
			_G(tp.Name+"_EveryTimesTPSN", persell);
		}else{
			//最后一次会出现单位止盈数大于实际持仓量的情况，进行调整
			if(persell > Account.Stocks) persell = Account.Stocks;
		}
		Log("现在总持仓",parseFloat(Account.Stocks).toFixed(8),"，每次止盈卖出",parseFloat(persell).toFixed(tp.Args.StockDecimalPlace));
		canTargetProfitNum = persell;
		_G(tp.Name+"_CanTargetProfitNum", canTargetProfitNum);
	}
	var opAmount = canTargetProfitNum > operatefineness? operatefineness : _N(canTargetProfitNum,tp.Args.StockDecimalPlace);
	if(opAmount > Account.Stocks) opAmount = 0; //因为存储的可止盈数可能实际发生了变化，所以加上较正数量上可能出现的问题
	if(opAmount > tp.Args.MinStockAmount){
		Log("准备以当前买1价格止盈卖出，可卖数量为",canTargetProfitNum,"，挂单数量为",opAmount,"，当前买1价格为",Ticker.Buy); 
		var orderid = tp.Exchange.Sell(Ticker.Buy,opAmount);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_SELL_TARGETPROFIT);	
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		Log("当前持仓",Account.Stocks,"，本次可止盈数量为",canTargetProfitNum,"，当前可卖出数量小于最小交易量，本次止盈操作完成。");
	}
	//不让再买入了
	_G(tp.Name+"_CanBuy", 0);
}

/***********
按成本价平仓
跌出防守线，但还没有出现死叉，以成本价挂卖
********************/
function doCostPriceSell(tp, Account, Ticker){
	//不按粒度操作，直接快速卖出
	if(Account.Stocks > tp.Args.MinStockAmount){
		var costPrice = _G(tp.Name+"_AvgPrice")*(1+tp.Args.BuyFee+tp.Args.SellFee);
		Log("准备以持仓成本价卖出当前所有的币，数量为",Account.Stocks,"，成本价格为",costPrice); 
		var orderid = tp.Exchange.Sell(costPrice,Account.Stocks);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_SELL_COSTPRICE);	
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		Log("当前持仓",Account.Stocks,"，当前可卖出数量小于最小交易量，本次按成本价平仓操作完成。");
	}
	//不让再买入了
	_G(tp.Name+"_CanBuy", 0);
}


/***********
按市价立即卖出
死叉出现，快现卖出
********************/
function doInstantSell(tp, Account, Ticker){
	//不按粒度操作，直接快速卖出
	if(Account.Stocks > tp.Args.MinStockAmount){
		Log("准备以当前市价卖出当前所有的币，数量为",Account.Stocks,"，参考价格为",Ticker.Sell); 
		var orderid = tp.Exchange.Sell(-1,Account.Stocks);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_SELL_INSTANT);	
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		Log("当前持仓",Account.Stocks,"，当前可卖出数量小于最小交易量，本次按市价立即卖出操作完成。");
	}
	//不让再买入了
	_G(tp.Name+"_CanBuy", 0);
}

//牛市策略，主业务流程 
//在牛市的环境下，以持币升值为主，只在死叉的时候止盈卖出一定比例（如50%），
//仅在掉出防守线（持仓成本价）的时候止损平仓，以过滤掉过多的卖出信号，长时间持币
function BullMarketTactics(tp) {
	//初始化系统对像
	var debug = tp.Args.Debug;
	if(debug) Log("启动牛市短线策略，现在进行行情数据的读取和分析。");
    var Records =  _C(tp.Exchange.GetRecords);
    var Ticker =  _C(tp.Exchange.GetTicker);
	var LastRecord = Records[Records.length-1];
	var Account = _C(tp.Exchange.GetAccount);
    var MAArray = TA.MA(Records,14);
    var EMAArray1 = TA.EMA(Records,7);
    var EMAArray2 = TA.EMA(Records,21);
    var CrossNum = getEmaCrossNum(EMAArray1, EMAArray2);   
    //识别当前K线类型并添加结果到K线数组当中
    addTickerType(Records);
    //识别当前行情波段，以对买卖做判断依据
    //var Market = identifyTheMarket(Records, MAArray, EMAArray1, EMAArray2, CrossNum)
    var avgPrice = _G(tp.Name+"_AvgPrice");
    var costTotal = parseFloat((avgPrice*(Account.Stocks+Account.FrozenStocks)).toFixed(tp.Args.PriceDecimalPlace));	//从帐户中获取当前持仓信息和平均价格算出来
	var stockValue = parseFloat(((Account.Stocks+Account.FrozenStocks)*Ticker.Last).toFixed(tp.Args.PriceDecimalPlace));
	if(debug) Log("交易对情况：余额", parseFloat(Account.Balance+Account.FrozenBalance).toFixed(8), "，持币数", parseFloat(Account.Stocks+Account.FrozenStocks).toFixed(8), "，持仓均价", parseFloat(avgPrice).toFixed(tp.Args.PriceDecimalPlace) , "，持仓成本", costTotal, "，当前币价", Ticker.Last , "，持仓价值", stockValue);

	//收集当前交易对信息
	var tpInfo = {
		Balance:Account.Balance,	//余额
		FrozenBalance:Account.FrozenBalance,	//冻结余额
		Stocks:Account.Stocks,	//可用币数
		FrozenStocks:Account.FrozenStocks,	//冻结币数
		AvgPrice:avgPrice,	//持仓均价
		CostTotal:costTotal,	//持仓成本
		TickerLast:Ticker.Last,	//当前币价
		StockValue:stockValue	//持币价值
	};
	tp.TPInfo = tpInfo; 
	
	//检测上一个订单，成功就改状态，不成功就取消重新发
	if(_G(tp.Name+"_LastOrderId") && _G(tp.Name+"_OperatingStatus") != OPERATE_STATUS_NONE){
		if(_G(tp.Name+"_OperatingStatus") > OPERATE_STATUS_BUY){
			checkSellFinish(tp,Account,Ticker, LastRecord);
		}else{
			checkBuyFinish(tp,Account,Ticker);
		}
		//刚才上一次订单ID清空，不再重复判断
		_G(tp.Name+"_LastOrderId",0);
		//重置操作状态
		_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_NONE);
	}

	//根据当前的行情来决定操作
	if(CrossNum > 0){
		//当前处理上升行情
		//判断当前是否可以买入，如果可以就买入，不能买就观察
		if(Account.Balance > tp.Args.MinStockAmount*Ticker.Last && stockValue < _G(tp.Name+"_BalanceLimit")){
			//还可以买入，看看当前能不能买
			if(checkCanBuy(Records, Ticker, MAArray, CrossNum)){
				if(debug) Log("当前上行行情，交叉数为",CrossNum,"，当前还有仓位并且也满足开仓条件，准备操作买入操作。");
				doBuy(tp, Account, Ticker, LastRecord.Time);
			}else{
				if(debug) Log("当前上行行情，交叉数为",CrossNum,"，当前还有仓位，但当前没有达到开仓条件，继续观察行情。");
			}
		}else{
			//买入之后设置止损线，如果当前价没有超持仓均价的30%，就设置为当前价的90%，否则为当前持仓均价上浮20%
			var stopline = _G(tp.Name+"_StopLinePrice");
			if(stopline == avgPrice){
				//防守线还是均价，买入后第一次，需要重新调整
				if((Ticker.Last/avgPrice) < 1.3){
					stopline = Ticker.Last*0.9;
				}else{
					stopline = avgPrice*1.2;
				}
				_G(tp.Name+"_StopLinePrice", stopline);
				if(debug) Log("买入完成后还没有调整止损线，现在调整止损线为",stopline);
			}
		}
	}else{
		//当前处于下降行情
		//死叉出现，判断是否有持仓：
		//1)如果有，操作卖出，如果已经达到止损线，那就全部出货，否则只开仓卖出30%仓位，底部再开仓买入调整持仓量和成本
		//2)没有，输出信息不作处理。
		if(Account.Stocks > tp.Args.MinStockAmount){
			if(_G(tp.Name+"_CanTargetProfitNum") > 0){
				//正在操作的止盈还没有完成
				if(debug) Log("本次止盈操作还没有完成，还有",_G(tp.Name+"_CanTargetProfitNum"),"个币需要卖出，继续操作止盈。");
				doTargetProfitSell(tp, Account, Ticker);
			}else if(_G(tp.Name+"_TargetProfitTimes") === 0){
				if(debug) Log("当前出现死叉，交叉数为",CrossNum,"，当前还未止盈过，准备操作止盈。");
				doTargetProfitSell(tp, Account, Ticker);
			}else{
				if(debug) Log("当前出现死叉，交叉数为",CrossNum,"，已经止盈过，等候适合机会再补入低价的货。");
			}
		}else{
			if(debug) Log("当前下跌行情中，因为没有持仓，所在静观市场变化，有机会再买入。");
		}
	}
}

//熊市策略，主业务流程 
//在熊市的环境下，以波段操作为主，谨慎买入积极止盈，只要有见顶信号或是逃顶信号就卖出一定比例（如50%）止盈，
//在死叉出现或掉出防守线时平仓退出，找机会再建仓，更多更积极的短信操作。
function BearMarketTactics(tp) {
	//初始化系统对像
	var debug = tp.Args.Debug;
	if(debug) Log("启动熊市短线策略，现在进行行情数据的读取和分析。");
    var Records =  _C(tp.Exchange.GetRecords);
    var Ticker =  _C(tp.Exchange.GetTicker);
	var LastRecord = Records[Records.length-1];
	var Account = _C(tp.Exchange.GetAccount);
    var MAArray = TA.MA(Records,14);
    var EMAArray1 = TA.EMA(Records,7);
    var EMAArray2 = TA.EMA(Records,21);
    var CrossNum = getEmaCrossNum(EMAArray1, EMAArray2);   
    //识别当前K线类型并添加结果到K线数组当中
    addTickerType(Records);
    //识别当前行情波段，以对买卖做判断依据
    //var Market = identifyTheMarket(Records, MAArray, EMAArray1, EMAArray2, CrossNum)
    
    var avgPrice = _G(tp.Name+"_AvgPrice");
    var costTotal = parseFloat((avgPrice*(Account.Stocks+Account.FrozenStocks)).toFixed(tp.Args.PriceDecimalPlace));	//从帐户中获取当前持仓信息和平均价格算出来
	var stockValue = parseFloat(((Account.Stocks+Account.FrozenStocks)*Ticker.Last).toFixed(tp.Args.PriceDecimalPlace));
	if(debug) Log("交易对情况：余额", parseFloat(Account.Balance+Account.FrozenBalance).toFixed(8), "，持币数", parseFloat(Account.Stocks+Account.FrozenStocks).toFixed(8), "，持仓均价", parseFloat(avgPrice).toFixed(tp.Args.PriceDecimalPlace) , "，持仓成本", costTotal, "，当前币价", Ticker.Last , "，持仓价值", stockValue);

	//收集当前交易对信息
	var tpInfo = {
		Balance:Account.Balance,	//余额
		FrozenBalance:Account.FrozenBalance,	//冻结余额
		Stocks:Account.Stocks,	//可用币数
		FrozenStocks:Account.FrozenStocks,	//冻结币数
		AvgPrice:avgPrice,	//持仓均价
		CostTotal:costTotal,	//持仓成本
		TickerLast:Ticker.Last,	//当前币价
		StockValue:stockValue	//持币价值
	};
	tp.TPInfo = tpInfo; 
	
	//检测上一个订单，成功就改状态，不成功就取消重新发
	if(_G(tp.Name+"_LastOrderId") && _G(tp.Name+"_OperatingStatus") != OPERATE_STATUS_NONE){
		if(_G(tp.Name+"_OperatingStatus") > OPERATE_STATUS_BUY){
			checkSellFinish(tp,Account,Ticker, LastRecord);
		}else{
			checkBuyFinish(tp,Account,Ticker);
		}
		//刚才上一次订单ID清空，不再重复判断
		_G(tp.Name+"_LastOrderId",0);
		//重置操作状态
		_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_NONE);
	}

	//根据当前的行情来决定操作
	if(CrossNum > 0){
		//当前处理上升行情
		//1.判断当前是否还有持仓，如果有：
		//1)判断当前价是否掉出防守线，如果是，操作止损
		//2)判断当前价是否有盈利空间，如果有是否有见顶或逃顶信号，如果有，操作止盈
		//3)否则判断是否还有仓位，如果有可以在当前买入
		//2.没有持仓，判断当前是否可以买入，如果可以就买入
		if(debug) Log("当前上行行情，交叉数为",CrossNum,"，当前K线类型为", LastRecord.Type);
		if(Account.Stocks <= tp.Args.MinStockAmount && _G(tp.Name+"_CanBuy") === 1){
			//没有持仓，可以考虑买入
			if(checkCanBuy(Records, Ticker, MAArray, CrossNum)){
				if(debug) Log("当前没有建仓，满足建仓条件，准备操作买入操作。");
				doBuy(tp, Account, Ticker, LastRecord.Time);
			}else{
				if(debug) Log("当前没有建仓，但当前没有达到建仓条件，继续观察行情。");
			}
		}else{
			if((Ticker.Last/avgPrice) <= 1.015 && (identifyDarkCloudCover(tp, Records) || identifyYinYangYin(tp, Records, MAArray, CrossNum))){
				//如果在没有达到1.5%浮盈之前出现阴阳阴或是乌云压顶，那尽快进行止损
				if(debug) Log("在没有达到1.5%浮盈之前出现阴阳阴或是乌云压顶，那尽快进行止损。");
				doInstantSell(tp, Account, Ticker);
			}else if(_G(tp.Name+"_CanTargetProfitNum") > 0){
				//正在操作的止盈还没有完成
				if(debug) Log("本次止盈操作还没有完成，还有",_G(tp.Name+"_CanTargetProfitNum"),"个币需要卖出，继续操作止盈。");
				doTargetProfitSell(tp, Account, Ticker);
			}else if(((Ticker.Last/avgPrice) > 1.015) && (identifyTopSellOffSignal(tp, Records) || identifyDarkCloudCover(tp, Records) || identifyYinYangYin(tp, Records, MAArray, CrossNum))){
				//写入信号发现的K线，不在同一个信号点多次操作止盈
				var lastsignalts = _G(tp.Name+"_LastSignalTS");
				if(lastsignalts === 0){
					//如果是第一次发现信号，形态形成的时间应该是上一个K线
					_G(tp.Name+"_LastSignalTS", Records[Records.length-2].Time);
				}else{
					_G(tp.Name+"_LastSignalTS", LastRecord.Time);
				}
				//取得金叉以来拉升的点数
				var firstprice =  Records[Records.length-CrossNum].Open;
				if(CrossNum<5 && Ticker.High/firstprice >1.05){
					if(debug) Log("金叉到现在最高价已经超过5个点，拉得太快，跌得也会快，尽快出手。");
					doInstantSell(tp, Account, Ticker);
				}else{
					if(debug) Log("出现止盈信号，准备操作止盈卖出。");
					doTargetProfitSell(tp, Account, Ticker);
				}
			}else if(_G(tp.Name+"_CanBuy") === 1 && Account.Balance > tp.Args.MinStockAmount*Ticker.Last && costTotal < _G(tp.Name+"_BalanceLimit")){
				//有持仓，当是还可以买入，看看行情可不可以继续买入
				if(checkCanBuy(Records, Ticker, MAArray, CrossNum)){
					if(debug) Log("当前还有仓位并且达到开仓条件，准备操作买入操作。");
					doBuy(tp, Account, Ticker, LastRecord.Time);
				}else{
					if(debug) Log("当前还有仓位，但当前没有达到开仓条件，继续观察行情。");
				}
			}else{
				if(debug) Log("当前已经建仓完成，继续观察行情。");
			}
		}
	}else{
		//当前处于下降行情
		//死叉出现，判断是否有持仓：
		//1)如果有，立即进行卖出操作
		//2)没有，输出信息不作处理。
		if(Account.Stocks > tp.Args.MinStockAmount){
			if(debug) Log("当前死叉已经出现，交叉数为",CrossNum,"，手上还有",Account.Stocks,"个币，准备操作平仓出货。");
			doInstantSell(tp, Account, Ticker);
		}else{
			if(debug) Log("当前下跌行情，交叉数为",CrossNum,"，当前已经完成平仓，继续观察行情。");
			//重置止盈次数及买完成标识
			_G(tp.Name+"_TargetProfitTimes", 0);
			_G(tp.Name+"_CanBuy", 1);
		}
	}
}

//获取当前交易状态
function getOperatingStatus(statusnum){
	var tstatus = "无操作";
	if(statusnum === OPERATE_STATUS_BUY){
		tstatus = "买入中";
	}else if(statusnum === OPERATE_STATUS_SELL_TARGETPROFIT){
		tstatus = "止盈中";
	}else if(statusnum > OPERATE_STATUS_SELL_TARGETPROFIT){
		tstatus = "卖出中";
	}
	return tstatus;
}


//处理状态的显示
function showStatus(nowtp){
	TickTimes++;
	//显示参数信息
	if(!ArgTables){
		var argtables = [];
		for(var i=0;i<TradePairs.length;i++){
			var tp = TradePairs[i];
			var table = {};
			table.type="table";
			table.title = tp.Title;
			table.cols = ['参数', '参数名称', '值'];
			var rows = [];
			rows.push(['BalanceLimit','买入金额数量限制', _G(tp.Name+"_BalanceLimit")]);		
			rows.push(['NowCoinPrice','当前持仓价格', tp.Args.NowCoinPrice]);		
			rows.push(['BuyFee','平台买入手续费', tp.Args.BuyFee]);		
			rows.push(['SellFee','平台卖出手续费', tp.Args.SellFee]);		
			rows.push(['PriceDecimalPlace','交易对价格小数位', tp.Args.PriceDecimalPlace]);		
			rows.push(['StockDecimalPlace','交易对数量小数位', tp.Args.StockDecimalPlace]);		
			rows.push(['MinStockAmount','限价单最小交易数量', tp.Args.MinStockAmount]);		
			rows.push(['Debug','调试状态', tp.Args.Debug]);		
			table.rows = rows;
			argtables.push(table);
		}
		ArgTables = argtables;
	}		

	//显示帐户信息
	if(!AccountTables){
		var accounttables = [];
		var accounttable1 = {};
		accounttable1.type="table";
		accounttable1.title = "交易对状态信息";
		accounttable1.cols = ['交易对','买入次数','卖出次数','总交易次数','止盈次数','当前仓位','累计收益','交易状态','添加时间','最后更新'];
		var rows = [];
		for(var r=0;r<TradePairs.length;r++){
			var tp = TradePairs[r];
			var i = tp.TPInfo;
			rows.push([tp.Title, _G(tp.Name+"_BuyTimes"), _G(tp.Name+"_SellTimes"), (_G(tp.Name+"_BuyTimes")+_G(tp.Name+"_SellTimes")), 
				_G(tp.Name+"_TargetProfitTimes"),parseFloat(i.CostTotal*100/_G(tp.Name+"_BalanceLimit")).toFixed(2)+'%', parseFloat(_G(tp.Name+"_SubProfit").toFixed(8)), getOperatingStatus(_G(tp.Name+"_OperatingStatus")), _G(tp.Name+"_AddTime"), tp.LastUpdate]);
		}
		accounttable1.rows = rows;
		accounttables.push(accounttable1);
		var accounttable2 = {};
		accounttable2.type="table";
		accounttable2.title = "交易对价格信息";
		accounttable2.cols = ['交易对', '余额', '持仓数量','持仓均价','持仓成本','当前币价','持币价值','持仓浮盈','浮盈率','止损价'];
		rows = [];
		for(var r=0;r<TradePairs.length;r++){
			var tp = TradePairs[r];
			var i = tp.TPInfo;
			rows.push([tp.Title, parseFloat((i.Balance+i.FrozenBalance).toFixed(8)), parseFloat((i.Stocks+i.FrozenStocks).toFixed(6)), i.AvgPrice, i.CostTotal, i.TickerLast, i.StockValue,  
			parseFloat((i.CostTotal-i.StockValue).toFixed(tp.Args.PriceDecimalPlace)),  parseFloat(((i.TickerLast-i.AvgPrice)*100/i.AvgPrice).toFixed(2))+'%', parseFloat(_G(tp.Name+"_StopLinePrice").toFixed(tp.Args.PriceDecimalPlace))]);
		}
		accounttable2.rows = rows;
		accounttables.push(accounttable2);
		AccountTables = accounttables;
	}else{
		var accounttable1 = AccountTables[0];
		for(var r=0;r<accounttable1.rows.length;r++){
			if(nowtp.Title == accounttable1.rows[r][0]){
				accounttable1.rows[r] =[nowtp.Title, _G(nowtp.Name+"_BuyTimes"), _G(nowtp.Name+"_SellTimes"), (_G(nowtp.Name+"_BuyTimes")+_G(nowtp.Name+"_SellTimes")), 
					_G(nowtp.Name+"_TargetProfitTimes"), parseFloat((nowtp.TPInfo.CostTotal*100/_G(nowtp.Name+"_BalanceLimit")).toFixed(2))+'%', parseFloat(_G(nowtp.Name+"_SubProfit").toFixed(8)), getOperatingStatus(_G(nowtp.Name+"_OperatingStatus")), _G(nowtp.Name+"_AddTime"), nowtp.LastUpdate];
				break;
			}	
		}
		var accounttable2 = AccountTables[1];
		for(var r=0;r<accounttable2.rows.length;r++){
			if(nowtp.Title == accounttable2.rows[r][0]){
				var i = nowtp.TPInfo;
				accounttable2.rows[r] =[nowtp.Title, parseFloat((i.Balance+i.FrozenBalance).toFixed(8)), parseFloat((i.Stocks+i.FrozenStocks).toFixed(6)), i.AvgPrice, i.CostTotal, i.TickerLast, i.StockValue,  
				parseFloat((i.CostTotal-i.StockValue).toFixed(nowtp.Args.PriceDecimalPlace)),  parseFloat(((i.TickerLast-i.AvgPrice)*100/i.AvgPrice).toFixed(2))+'%', parseFloat(_G(nowtp.Name+"_StopLinePrice").toFixed(nowtp.Args.PriceDecimalPlace))];
				break;
			}	
		}		
	}
	LogStatus("`" + JSON.stringify(ArgTables)+"`\n`" + JSON.stringify(AccountTables)+"`\n 当前市场环境："+ (MarketEnvironment ? "牛市" : "熊市")+ "，策略累计收益："+ _G("TotalProfit")+ "\n 策略启动时间："+ StartTime + " 累计刷新次数："+ TickTimes + " 最后刷新时间："+ _D());	
}

function main() {
	Log("开始执行主事务程序...");  
	while (true) {
		if(TradePairs.length){
			//策略交互处理函数
			commandProc();
			//获取当前交易对
			var tp = TradePairs[NowTradePairIndex];
			if(tp.Args.Debug) Log("开始操作",tp.Title,"交易对...");
			//设置小数位，第一个为价格小数位，第二个为数量小数位
			tp.Exchange.SetPrecision(tp.Args.PriceDecimalPlace, tp.Args.StockDecimalPlace);
			//操作交易策略
			if(MarketEnvironment){
				BullMarketTactics(tp);
			}else{
				BearMarketTactics(tp);
			}
			//操作状态显示
			tp.LastUpdate = _D();
			showStatus(tp);
			//控制轮询
            var interval = 5;
			//提高买入和立即卖出的速度，可以降低买入成本
			var operatingstatus = _G(tp.Name+"_OperatingStatus");
			if(operatingstatus != OPERATE_STATUS_BUY || operatingstatus != OPERATE_STATUS_SELL_INSTANT){
				if(NowTradePairIndex === TradePairs.length-1){
					NowTradePairIndex = 0;
					//同时清除日志保留最后80000条，以缩减托管者上SqlLit3文件的大小
					LogReset(80000);
				}else{
					NowTradePairIndex++;
				}
				interval = 60/TradePairs.length;
				if(interval < 5) interval = 5;
				if(interval > 20) interval = 20;				
			}
            Sleep(interval * 1000);
		}else{
			Log("匹配的交易对为空，请提供正常的交易对参数JSON内容。");
			break;
		}
	}
}
