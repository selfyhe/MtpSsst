/**************************************
多交易对现货短线程序化操作策略V1.0
短线交易的原则:
短线交易的核心思想是要通过复利使得资本金不断增加，那必须要能过一定的投资回报率的基本上加大资本周转次数来实现更多的收益。
复利的计算公式是这样的：F=P*(1+i)^n，终值=现值（1+回报率）^周转次数
所以在做策略的过程当中，胜率和周转次数非常重要，而每次获胜之后的回报率就没有胜率那么重要了，但如果要提高胜率，往往周转次数和回报率都会下降。
说明：
1.因为多个交易对收益合并到一个曲线，所以同一个机器人使用的基础货币要是一样的。
2.在牛市的环境下，以持币升值为主，只在死叉的时候止盈卖出一定比例（如30%），仅在掉出防守线（持仓成本价）的时候止损平仓，以过滤掉过多的卖出信号，长时间持币
3.在熊市的环境下，以波段操作为主，谨慎买入积极止盈，只要有见顶信号或是逃顶信号就卖出一定比例（如50%）止盈，在死叉出现或掉出防守线时平仓退出，找机会再建仓，更多更积极的短信操作。
4.短线操作每次都会全仓操作，所以不能与长线投资策略共用交易对，否则会被低价卖出的风险

熊市主要有以下几种行情分类：
1.恐慌出逃，牛市之顶泡沫破裂，所有的人恐慌抛出手中的货，指数急速下跌。在一条K线创出超过10%的大幅下跌，等人们稍为镇定一下之后，一般会回弹80%以上，再进入持续下跌形态
2.持续下跌，空头攻势凶猛，多头节节败退，偶现弱反弹，但也无力支撑，下跌幅度大于上涨幅度
3.底部修正，到达一定的低部之后，多空心里较有底了，都想通过大幅震荡短线获益，上涨和下跌幅度接近，幅度都比较大
4.盘桓储力，多空双方的观点接近一致，都认为底部已经形成，空头不想放出，头还想继续低部吸筹不放价。幅度都非常小。
5.反弹上攻，多头力量已经形成，大幅上攻，上涨幅度大于下跌幅度。


支持多个交易对，参数通过JSON传递过来
MarketEnvironment	市场环境	0表示熊市，1表示牛市，据据不同的市场环境下操作策略有所区别	下拉选择	熊市|牛市
ArgsJson	策略参数JSON内容	JSON内容为以下多个交易对的数组JSON	字符串型(string)

单个交易对的策略参数如下
参数	描述	类型	默认值
ExchangeName	交易所名称	字符串型(string)
TradePairName	交易对名称	字符串型(string)	
ConjunctureType	行情类型	值范围：0牛市行情,1恐慌出逃,2持续下跌,3底部修正,4盘桓储力,5反弹上攻	数字型(number)	2
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
NewConjunctureType	更新行情类型	填写格式：TradePairName(更新全部交易对用ALL)|类型0~5    字符串型(string) _|_
Debug	更新调试状态	值的填写格式如下:TradePairName(更新全部交易对用ALL)|0/1 字符串型(string) ALL|0
************************************************/

//全局常数定义
//操作类型常量
var OPERATE_STATUS_NONE = -1;
var OPERATE_STATUS_BUY = 0; 
var OPERATE_STATUS_SELL_TARGETPROFIT = 1;
var OPERATE_STATUS_SELL_INSTANT = 2;
//单次止盈卖出账户币数比例
var TARGET_PROFIT_PERCENT = 0.3;	//每次止盈卖出持仓总量的比例
//定义行情类型
var CONJUNCTURE_TYPE_NAMES = ["牛市行情","恐慌出逃","持续下跌","底部修正","盘桓储力","反弹上攻"];				


//全局变量定义
function TradePair(){
	this.Name = "";	//交易对名称,用于定量加前缀，格式如Huobi_LTC_BTC
	this.Title = "";	//交易对标题，用于表格显示，格式如Huobi/LTC_BTC
	this.Exchange = {};	//交易所对像exchange
	this.TPInfo = {};	//交易对当前信息
	this.Args = {};	//本交易对参数
	this.Records =  {};	//交易对K线数据
	this.Ticker =  {};	//当前实时行情
	this.LastRecord = {};	//最后一条K线情况
	this.Account = {};	//当前账户情况
	this.MAArray = [];	//14均线
	this.EMAArray1 = [];	//7均线
	this.EMAArray2 = [];	//21均线
	this.CrossNum = 0; 	//当前k线7与21均线交叉数
	this.LastProfit = 0;	//上一次卖出收益
	this.LastUpdate = {};	//最后更新时间
}
var TradePairs = [];	//所有交易对数组
var NowTradePairIndex = 0;		//当前的交易所对索引
var TotalProfit = 0;	//策略累计收益
var StartTime = _D();	//策略启动时间
var TickTimes = 0;		//刷新次数
var ArgTables;		//已经处理好的用于显示的参数表，当参数更新时置空重新生成，以加快刷新速度
var AccountTables;	//当前的账户信息表，如果当前已经有表，只要更新当前交易对，这样可以加快刷新速度，减少内存使用
var LastCrossNum = 0;	//上一次的交叉数，用来判断当前是否发生了交叉转换
var LastDeathCrossTime = 0;	//上一次死叉的时间
var LastIdentifyMarket = 0; //上一次分析行情时间

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
					ConjunctureType:args[i].ConjunctureType,
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
					_G(tp.Name+"_BalanceLimit",Args.BalanceLimit);	//本交易对限仓金额
					if(!_G(tp.Name+"_AvgPrice")) _G(tp.Name+"_AvgPrice",Args.NowCoinPrice);		//当前持仓均价conjuncture
					if(!_G(tp.Name+"_ConjunctureType")) _G(tp.Name+"_ConjunctureType",Args.ConjunctureType);		//当前交易对行情类型					
					if(!_G(tp.Name+"_BuyTimes")) _G(tp.Name+"_BuyTimes",0);		//买入次数
					if(!_G(tp.Name+"_SellTimes")) _G(tp.Name+"_SellTimes",0);	//卖出次数
					if(!_G(tp.Name+"_SubProfit")) _G(tp.Name+"_SubProfit",0);	//累计盈利
					if(!_G(tp.Name+"_LastBuyTS")) _G(tp.Name+"_LastBuyTS",0);	//上一次买入时间戳
					if(!_G(tp.Name+"_FirstBuyTS")) _G(tp.Name+"_FirstBuyTS",0);			//上一次平仓后第一次买入时间戳		
					if(!_G(tp.Name+"_LastBuyPrice")) _G(tp.Name+"_LastBuyPrice",0);		//上一次买入价格
					if(!_G(tp.Name+"_LastSellPrice")) _G(tp.Name+"_LastSellPrice",0);		//上一次卖出价格
					if(!_G(tp.Name+"_StopLinePrice")) _G(tp.Name+"_StopLinePrice",0);	//止损价格
					if(!_G(tp.Name+"_LastBuyArea")) _G(tp.Name+"_LastBuyArea",0);		//上一次买入的区域
					if(!_G(tp.Name+"_LastSignalTS")) _G(tp.Name+"_LastSignalTS",0);		//上一次止盈信号发出K线的时间戳
					if(!_G(tp.Name+"_DoedTargetProfit")) _G(tp.Name+"_DoedTargetProfit",0);	//已经操作止盈标识（是，否）
					if(!_G(tp.Name+"_TargetProfitTimes")) _G(tp.Name+"_TargetProfitTimes",0);	//累计止盈次数
					if(!_G(tp.Name+"_CanTargetProfitNum")) _G(tp.Name+"_CanTargetProfitNum",0);		//本次止盈还可卖出数量
					if(!_G(tp.Name+"_EveryTimesTPSN")) _G(tp.Name+"_EveryTimesTPSN",0);		//每次止盈数量					
					if(!_G(tp.Name+"_LastOrderId")) _G(tp.Name+"_LastOrderId",0);	//上一次交易订单编号
					if(!_G(tp.Name+"_OperatingStatus")) _G(tp.Name+"_OperatingStatus",OPERATE_STATUS_NONE);	//当前操作状态标识
					if(!_G(tp.Name+"_AddTime")) _G(tp.Name+"_AddTime",_D());	//交易对添加时间
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

/***
 * 识别当前K线类型并添加结果到K线数组当中
 * @param {} records
 */
function addTickerType(records){
    for(var i=0;i<records.length;i++){
        records[i].Type = getTickerType(records[i]);
    }
}

/**************************
检测当前是否可以在金叉区域买入
**************************/
function checkCanBuyKingArea(tp){
	Log("检测当前是否可以在金叉区域买入");
    var ret = false;
	//根据当前行情选择操作方式
	var ctype = _G(tp.Name+"_ConjunctureType");
	switch(ctype){
		case 1:	//恐慌出逃行情
			//不建议在此行情金叉后买入
			break;
		case 2:	//持续下跌行情
	    	if(tp.CrossNum >=5) ret = checkCanBuyKingArea2(tp, tp.Records, tp.Ticker, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
			break;
		case 3:	//底部修正行情
			ret = checkCanBuyKingArea3(tp, tp.Records, tp.Ticker, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
			break;
		case 4:	//盘桓储力行情
			ret = checkCanBuyKingArea4(tp, tp.Records, tp.Ticker, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
			break;
		case 5:	//反弹上攻行情
			ret = checkCanBuyKingArea5(tp, tp.Records, tp.Ticker, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
			break;
	}	
    return ret;
}

/*******************************
检测是否可以在熊市持续下跌的行情当中做买入
持续下跌行情，空头攻势凶猛，多头节节败退，偶现弱反弹，但也无力支撑，下跌幅度大于上涨幅度
1.在空头占优势的情况下，偶尔出现多头发力爆拉，但也在1~4条K线之内必然出现爆跌，所以不能在交叉数为5之前的时候买入，绝大多数会买在高点，亏得很惨
2.为了防止在金叉过程当中突然出现大单卖出瞬间产生的死叉后反正现像造成错误买入损失，不在上一个死叉信号发生的15分钟内进行买入操作
3.在交叉数大于5之后才考虑买入，基础要求当前K线必须是阳线，前K开盘必须在14线之上，且当前有效升幅要超过金叉后三线升幅的8成以上
1）连续两根阳线，且累计有效升幅超过1.5%，时间也在后3分钟，可以买入
2）连续三根阳线，且价格屡创新高，前K收盘价高于金叉7线价0.5%，且大于金叉7线到最低价的距离，可以买入
3）第一条K线经过了不超过0.5%的小幅下跌之后，开始了大幅拉升，连续两条K线升幅超过1%，前K收盘价高于金叉7线价0.5%，且当前价已经超过前K收盘价，可以买入
3）三个阳线跳空高开，主力进场，可以买入
4.排除一些不合理的情况，同时要对一些情况进行时间验证，以确保更高成功率。
*******************************/
function checkCanBuyKingArea2(tp, records, ticker, ema7, ema21, ma14, crossnum){
	Log("检测当前是否可以在持续下跌行情中金叉区域买入");
	var ret = false;
	if(crossnum < 5) return ret;
	var lastrecord = records[records.length-1];
	if(lastrecord.Type < 0) return ret;
	//判断是否假死叉带来的反正
	var now = new Date().getTime();
	if(now - LastDeathCrossTime < 15*60*1000){
		Log("遇到了假死叉带来的15分钟内死叉又返正现像，排除。")
		return ret;
	}
	//获取几个主要的数据：
	//1.死叉点的7线价和金叉点的7线价
	//2.死叉内的最低价和金叉前三根K线当中的最高价
	//3.金叉点的7线价与最低价的比值，金叉后三K最高价与金叉点的7线价和当前价与金叉点的7线价的比值
	var ema7_king = ema7[ema7.length-crossnum];
	var max_king = 0;
	for(var i=2;i<=crossnum;i++){
		if(i>=crossnum) break;
		var maxprice=Math.max(max_king,records[records.length-i].Close);
		if(maxprice>max_king){
			max_king = maxprice;
		}
	}
	var max_kingk123 = 0;
	for(var i=0;i<=2;i++){
		var maxprice=Math.max(max_kingk123,records[records.length-crossnum+i].Close);
		if(maxprice>max_kingk123){
			max_kingk123 = maxprice;
		}
	}
	//找到死叉后的最低价
	var secondrecord = records[records.length-2];
	var thirdrecord = records[records.length-3];
	var lowprice = lastrecord.Close;
	for(var i=2;i<=14+crossnum;i++){
		var minprice=Math.min(lowprice,records[records.length-i].Close);
		if(minprice<lowprice){
			lowprice = minprice;
		}
	}
	Log("金叉点的7线价",ema7_king,"死叉内的最低价",lowprice,"金叉前三根K线当中的最高价",max_kingk123);
	//如果当前交叉数小于等于4
	var value1 = secondrecord.Close/ema7_king;
	//前K开盘必须在14线之上，且当前有效升幅要超过金叉后三线价以上，且平均三条K线升幅不超过1个点
	if(secondrecord.Open > ma14[ma14.length-2] && lastrecord.Close > max_king){
		//必须连续两根阳线，且累计有效升幅超过1.5%，时间也在后3分钟，可以买入
		if(secondrecord.Type > 0 && lastrecord.Close/secondrecord.Open >= 1.015 &&  now >= (lastrecord.Time+720000)){
			Log("上一根是阳线，且当前也是阳线，累计有效升幅超过1.5%，可以买入");
			ret = true;
		}else if(thirdrecord.Type > 0 && secondrecord.Type > 0 && secondrecord.Close > thirdrecord.Close && thirdrecord.Close >= max_kingk123 && lastrecord.Close > secondrecord.Close && value1 > 1.005 && value1 > ema7_king/lowprice){
			Log("当前K线型态符合普通买入条件，可以买入");
			ret = true;
		}else if(thirdrecord.Type < 0 && secondrecord.Type > 0 && thirdrecord.Open/thirdrecord.Close < 1.005 && lastrecord.Close/secondrecord.Open > 1.01 && value1 > 1.005 && lastrecord.Close > secondrecord.Close){
			Log("在下跌后重新起飞，可以买入");
			ret = true;
		}else if(thirdrecord.Type > 0 && secondrecord.Type > 0 && secondrecord.Open >= thirdrecord.Close && lastrecord.Open >= secondrecord.Close){
			var fourthrecord = records[records.length-4];
			if(thirdrecord.Open >= fourthrecord.Open){
				Log("连续三个跳空高开的情况，可以买入");
				ret = true;
			}
		}else if(lastrecord.Close/lastrecord.Open >= 1.015 && lastrecord.Volume >= records[records.length-crossnum].Volume*2){
			Log("当前K线涨幅达到1.5%，且成交量超过金叉点K线成交量的2倍，可以买入");
			ret = true;
		}
	}
	//排除一些不合理的情况
	var signs = [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13, -14, -15, 2, 3, 5, 8, 100];
	if(ret){
		if(lastrecord.Close/lowprice >= 1.03 && lastrecord.Volume < records[records.length-crossnum].Volume*2 && thirdrecord.Close >= max_kingk123 && secondrecord.Close >= max_kingk123){
			//持续下跌的行情下反弹已经超过3%，且连续上升没有回调过后续空间不大，已经回调过除外
			Log("持续下跌的行情下反弹已经超过3%，成交量没有超过金叉点K线成交量的2倍且连续上升没有回调过后续空间不大，那就放弃。");
			ret = false;
		}else if(signs.indexOf(secondrecord.Type) != -1 && signs.indexOf(thirdrecord.Type) != -1 || Math.abs(secondrecord.Close-secondrecord.Open)/(secondrecord.High-secondrecord.Close) < 0.3 && Math.abs(thirdrecord.Close-thirdrecord.Open)/(thirdrecord.High-thirdrecord.Close) < 0.3){
			//如果前面连续两条线都有抛压表现，那就放弃
			Log("前面连续两条线都有抛压表现，那就放弃。");
			ret = false;
		}
	}
	//如果交叉数为10之前，且之前连续阳升或是前面存在顶部抛压K线，那么就要做时间验证，必须要在后3分钟才可以买
	if(ret && now < (lastrecord.Time+600000) && crossnum<=10 && lastrecord.Volume < records[records.length-crossnum].Volume && (thirdrecord.Close >= max_kingk123 || signs.indexOf(secondrecord.Type) != -1 || signs.indexOf(thirdrecord.Type) != -1)){
		Log("当前K线是前10分钟，且前面的K线存在抛压信号K线，继续观察。");
		ret = false;
	}
	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",secondrecord.Open);
	return ret;
}


/*******************************
检测是否可以在熊市底部修正的行情当中做买入
底部修正，到达一定的低部之后，多空心里较有底了，都想通过大幅震荡短线获益，上涨和下跌幅度接近，幅度都比较大
1.这个区域是持续下跌到一定程度之后是多空分歧最大的区域，但势力均等，在一个较大的震荡箱体里面相互拼杀，小游资在跟随底吸高抛做波段
2.这段区域上涨的空间会比持续下跌大，把空间限制在6%比较合现
3.这个区域如果多头挣脱震荡箱体，那就有可能冲高带来小牛，如果空头胜利将继续下跌，进入持续下跌或是横盘整理
1）这里的买入条件比持续下跌要更松，可以在金叉的交叉数为1的时候买入
2）可以去除较多的排除性条件
*******************************/
function checkCanBuyKingArea3(tp, records, ticker, ema7, ema21, ma14, crossnum){
	Log("检测当前是否可以在底部修正行情中金叉区域买入");
	var ret = false;
	var lastrecord = records[records.length-1];
	if(lastrecord.Type < 0) return ret;
	//判断是否假死叉带来的反正
	var now = new Date().getTime();
	if(now - LastDeathCrossTime < 15*60*1000){
		Log("遇到了假死叉带来的15分钟内死叉又返正现像，排除。")
		return ret;
	}
	//获取几个主要的数据：
	//1.死叉点的7线价和金叉点的7线价
	//2.死叉内的最低价和金叉前三根K线当中的最高价
	//3.金叉点的7线价与最低价的比值，金叉后三K最高价与金叉点的7线价和当前价与金叉点的7线价的比值
	var ema7_king = ema7[ema7.length-crossnum];
	var max_kingk123 = 0;
	var max_kcrossnum = 0;
	for(var i=0;i<=2;i++){
		if(i>=crossnum) break;
		var maxprice=Math.max(max_kingk123,records[records.length-crossnum+i].Close);
		if(maxprice>max_kingk123){
			max_kingk123 = maxprice;
			max_kcrossnum = i+1;
		}
	}
	//找到死叉后的最低价
	var secondrecord = records[records.length-2];
	var thirdrecord = records[records.length-3];
	var lowprice = lastrecord.Close;
	for(var i=2;i<=14+crossnum;i++){
		var minprice=Math.min(lowprice,records[records.length-i].Close);
		if(minprice<lowprice){
			lowprice = minprice;
		}
	}
	//找到冲高后回调的低价
	var seclowprice = lastrecord.Low;
	for(var i=2;i<=crossnum-max_kcrossnum;i++){
		var minprice=Math.min(seclowprice,records[records.length-i].Low);
		if(minprice<seclowprice){
			seclowprice = minprice;
		}
	}
	Log("金叉点的7线价",ema7_king,"死叉内的最低价",lowprice,"金叉前三根K线当中的最高价",max_kingk123,"金叉前三根K线当中的最高价K线交叉数是",max_kcrossnum,"金叉前三根K线当中的最高价后的最低价是",seclowprice);
	//如果当前交叉数小于等于4
	var value1 = secondrecord.Close/ema7_king;
	//前K开盘必须在14线之上，且当前有效升幅要超过金叉后三线价以上，且平均三条K线升幅不超过1个点
	if(secondrecord.Open > ma14[ma14.length-2] && (lastrecord.Close-lowprice)/(max_kingk123-lowprice) > 0.6){
		//必须连续两根阳线，且累计有效升幅超过1%，可以买入
		if(secondrecord.Type > 0 && lastrecord.Close/secondrecord.Open >= 1.01){
			Log("上一根是阳线，且当前也是阳线，累计有效升幅超过1%，可以买入");
			ret = true;
		}else if(thirdrecord.Type > 0 && secondrecord.Type > 0 && secondrecord.Close > thirdrecord.Close && lastrecord.Close > secondrecord.Close && value1 > 1.005 && value1 > ema7_king/lowprice){
			//连续阳升或是冲高回调后再回升超过60%
			if(thirdrecord.Close >= max_kingk123 || (max_kingk123-seclowprice)/max_kingk123 >1.01 && (secondrecord.Close-seclowprice)/(max_kingk123-seclowprice) > 0.6){
				Log("当前K线型态符合普通买入条件，可以买入");
				ret = true;
			}
		}else if(thirdrecord.Type < 0 && secondrecord.Type > 0 && thirdrecord.Open/thirdrecord.Close < 1.005 && lastrecord.Close/secondrecord.Open > 1.01 && value1 > 1.005 && lastrecord.Close > secondrecord.Close){
			Log("在下跌后重新起飞，可以买入");
			ret = true;
		}else if(thirdrecord.Type > 0 && secondrecord.Type > 0 && secondrecord.Open >= thirdrecord.Close && lastrecord.Open >= secondrecord.Close){
			var fourthrecord = records[records.length-4];
			if(thirdrecord.Open >= fourthrecord.Open){
				Log("连续三个跳空高开的情况，可以买入");
				ret = true;
			}
		}else if(lastrecord.Close/lastrecord.Open >= 1.01 && lastrecord.Volume >= records[records.length-crossnum].Volume){
			Log("当前K线涨幅达到1%，且成交量达到金叉点K线成交量时，可以买入");
			ret = true;
		}
	}
	//排除一些不合理的情况
	var signs = [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13, -14, -15, 2, 3, 5, 8, 100];
	if(ret){
		if(lastrecord.Close/lowprice >= 1.05 && lastrecord.Volume < records[records.length-crossnum].Volume*2 && thirdrecord.Close >= max_kingk123 && secondrecord.Close >= max_kingk123){
			//持续下跌的行情下反弹已经超过5%，且连续上升没有回调过后续空间不大，已经回调过除外
			Log("持续下跌的行情下反弹已经超过5%，成交量没有超过金叉点K线成交量的2倍且连续上升没有回调过后续空间不大，那就放弃。");
			ret = false;
		}else if(signs.indexOf(secondrecord.Type) != -1 && signs.indexOf(thirdrecord.Type) != -1 || Math.abs(secondrecord.Close-secondrecord.Open)/(secondrecord.High-secondrecord.Close) < 0.3 && Math.abs(thirdrecord.Close-thirdrecord.Open)/(thirdrecord.High-thirdrecord.Close) < 0.3){
			//如果前面连续两条线都有抛压表现，那就放弃
			Log("前面连续两条线都有抛压表现，那就放弃。");
			ret = false;
		}
	}
	//如果交叉数为10之前，且之前连续阳升或是前面存在顶部抛压K线，那么就要做时间验证，必须要在后3分钟才可以买
	if(ret && now < (lastrecord.Time+600000) && crossnum<=10 && lastrecord.Volume < records[records.length-crossnum].Volume && (thirdrecord.Close >= max_kingk123 || signs.indexOf(secondrecord.Type) != -1 || signs.indexOf(thirdrecord.Type) != -1)){
		Log("当前K线是前10分钟，且前面的K线存在抛压信号K线，继续观察。");
		ret = false;
	}
	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",secondrecord.Open);
	return ret;
}


/*******************************
检测是否可以在熊市盘桓储力的行情当中做买入
盘桓储力，多空双方的观点接近一致，都认为底部已经形成，空头不想放出，头还想继续低部吸筹不放价。幅度都非常小。
1.在一个很狭小的箱体内，多空双方玩抓小偷游戏，小偷一旦松开了就狂跑，然后另一方就再追上去按住，多方做小偷时跑出来一个5个点左右的垂直拉升，空方做小偷时跑出来时再来个5个点多左右的爆布
2.只要进入了盘桓阶段，只要是正叉都可以买入，但为了排除有下跌可能在达到有效升幅后买胜率要高，
3.卖出就要注意了，只有死叉后3条K线内连续下跌超过2%之后才可以卖出
*******************************/
function checkCanBuyKingArea4(tp, records, ticker, ema7, ema21, ma14, crossnum){
	Log("检测当前是否可以在盘桓储力行情中金叉区域买入");
	var ret = false;
	var lastrecord = records[records.length-1];
	if(lastrecord.Type < 0) return ret;
	//判断是否假死叉带来的反正
	var now = new Date().getTime();
	if(now - LastDeathCrossTime < 15*60*1000){
		Log("遇到了假死叉带来的15分钟内死叉又返正现像，排除。")
		return ret;
	}
	var ema7_king = ema7[ema7.length-crossnum];
	var secondrecord = records[records.length-2];
	var thirdrecord = records[records.length-3];
	if(lastrecord.Close/ema7_king > 1.02){
		Log("当前K线升超金叉点7线价2%的情况，可以买入");
		ret = true;
	}else if(secondrecord.Type > 0 && ema7_king > secondrecord.Open && lastrecord.Close/secondrecord.Open >= 1.025){
		Log("连续两根阳线且一根是在金叉之前，累计涨幅达到2.5%以上的情况，可以买入");
		ret = true;
	}else if(secondrecord.Type > 0 && ema7_king < secondrecord.Open && lastrecord.Close/secondrecord.Open >= 1.02){
		Log("连续两根阳线都在金叉之后且较上一K线连续有效升幅超过1%以上的情况，可以买入");
		ret = true;
	}else if(secondrecord.Type > 0 && thirdrecord.Type > 0 && ema7_king > thirdrecord.Open && lastrecord.Close/thirdrecord.Open >= 1.025){
		Log("三连阳，第一根在金叉之前，且较连续有效升幅超过2.5%以上的情况，可以买入");
		ret = true;
	}else if(secondrecord.Type > 0 && thirdrecord.Type > 0 && ema7_king < thirdrecord.Open && lastrecord.Close/thirdrecord.Open >= 1.02){
		Log("三连阳且都在金叉之后，有效升幅超过2%以上的情况，可以买入");
		ret = true;
	}
	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",ema7_king*0.98);
	return ret;
}


/*******************************
检测是否可以在熊市反弹上攻的行情当中做买入
反弹上攻，多头力量已经形成，大幅上攻，多头点主要优势，空头节节败退，涨幅不断拉大，上涨幅度大于下跌幅度。
1.在这种行情下可以放心买入，金叉之后上攻的概率很高
2.上涨的幅度可以达到5%~20%
3.放心在死叉区域抄底买入，在低部买入的货不再需要在金叉之后第二根K线立即卖出。只在死叉部位卖出平仓，不作按点止盈
4.不需要设置任何排除条件。
*******************************/
function checkCanBuyKingArea5(tp, records, ticker, ema7, ema21, ma14, crossnum){
	Log("检测当前是否可以在持续下跌行情中金叉区域买入");
	var ret = false;
	var lastrecord = records[records.length-1];
	if(lastrecord.Type < 0) return ret;
	//判断是否假死叉带来的反正
	var now = new Date().getTime();
	if(now - LastDeathCrossTime < 15*60*1000){
		Log("遇到了假死叉带来的15分钟内死叉又返正现像，排除。")
		return ret;
	}
	var secondrecord = records[records.length-2];
	var thirdrecord = records[records.length-3];
	var fourrecord = records[records.length-4];
	if(thirdrecord.Type > 0 && secondrecord.Type > 0 && thirdrecord.Close > fourrecord.Close && secondrecord.Close > thirdrecord.Close && lastrecord.Close >= secondrecord.Close){
		Log("连续三个阳线不断收高的情况，可以买入");
		ret = true;
	}else if(secondrecord.Type > 0 && lastrecord.Close/secondrecord.Open >= 1.01){
		Log("连续两根阳线涨幅达到1%以上的情况，可以买入");
		ret = true;
	}else if(lastrecord.Close/lastrecord.Open >= 1.015 && lastrecord.Close/secondrecord.Open > 1.01){
		Log("当前K线的升幅超过1.5%，且较上一K线连续有效升幅超过1%以上的情况，可以买入");
		ret = true;
	}
	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",thirdrecord.Low);
	return ret;
}

/**************************
检测当前是否可以在死叉区域买入
**************************/
function checkCanBuyDeathArea(tp){
	Log("检测当前是否可以在死叉区域买入");
    var ret = false;
	//根据当前行情选择操作方式
	var ctype = _G(tp.Name+"_ConjunctureType");
	switch(ctype){
		case 1:	//恐慌出逃行情
			if(tp.CrossNum >= -2) ret = checkCanBuyInDeathArea1(tp, tp.Records, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
			break;
		case 2:	//持续下跌行情
			//if(tp.CrossNum <= -2) ret = checkCanBuyInDeathArea2(tp, tp.Records, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
		case 3:	//底部修正行情
			//if(tp.CrossNum <= -2) ret = checkCanBuyInDeathArea3(tp, tp.Records, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
		case 5:	//反弹上攻行情
			//if(tp.CrossNum <= -2) ret = checkCanBuyInDeathArea5(tp, tp.Records, tp.EMAArray1, tp.EMAArray2, tp.MAArray, tp.CrossNum);
			break;
		case 4:	//盘桓储力行情
			//不建议在底部买入，虽然可能成本更低，但是失败的风险高
			break;
	}	
    return ret;
}

/*********************************
在熊市持续下跌行情下，检测是否可以抄底买入
*********************************/
function checkCanBuyInDeathArea2(tp, records, ema7, ema21, ma14, crossnum){
	Log("在熊市持续下跌行情下，检测是否可以抄底买入");
    var ret = false;
    //取得当前死叉内价格最低的K线
    var lastrecord = records[records.length-1];
    Log("if(",lastrecord.Type,">0 && ",ema7[ema7.length-1],"<",ema21[ema21.length-1],"){");
    if(lastrecord.Type>0 && ema7[ema7.length-1]<ema21[ema21.length-1]){
        Log("交叉数是",crossnum,"当前K线是",_D(lastrecord.Time),"当前价是",lastrecord.Close,"当前K线涨幅有",(lastrecord.Close-lastrecord.Low)/lastrecord.Low,"当前7日均线价是",ema7[ema7.length-1],"当前21日均线价是",ema21[ema21.length-1])
        //符合条件1，当前K线是个阳线，当前价高于7日均线价
        Log("符合条件1，当前是阳线，且7线在21线之前。");
        //获取死叉内平均K线跌幅,最高价和最低价
        var highrecord = lastrecord;
        var lowrecord = lastrecord;
        lowrecord.emaid = ema7.length-1;
        lowrecord.recordid = records.length-1;
        var klen = Math.abs(crossnum)+2;    //-1之前的那条K线的大幅下跌才引起死叉，所以要把它算上
        for(var i=2;i<klen;i++){
            var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
            if(minprice < lowrecord.Low){
                lowrecord = records[records.length-i];
                lowrecord.emaid = ema7.length-i;
                lowrecord.recordid = records.length-i;
            }
            var maxprice = Math.max(highrecord.High, records[records.length-i].High);
            if(maxprice > highrecord.High){
                highrecord = records[records.length-i];
            }
        }
        Log("当前死叉内价格最低的K线是",_D(lowrecord.Time),"其最高价是",lowrecord.High,"最低价是",lowrecord.Low,"7日均线价是",ema7[lowrecord.emaid]);
        var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
        var avgdownrange = downrange/(klen-1);
        Log("当前死叉内最高价格K线是",_D(highrecord.Time),"最高价是",highrecord.High,"K线数有",(klen-1),"跌幅",downrange,"平均跌幅",avgdownrange,"交叉数是",crossnum);
		var secondrecord = records[records.length-2];	
		if(crossnum>=-2 && avgdownrange>=0.005){
			//急跌急涨型态
			Log("初步判断为急跌急拉型态");
			if(secondrecord.High/secondrecord.Low > 1.02 && lastrecord.Close/lastrecord.Low > 1.01){
				Log("在急跌急涨型态中，上一K线的跌幅超过2%，当前K线反弹超过1个点，可以买入");
				ret = true;
			}
		}else if(crossnum<-2 && crossnum>=-5 && avgdownrange>0.002){
			//快速跌涨型态
			Log("初步判断为快速跌涨型态");
			if(lastrecord.Close > ((highrecord.High-lowrecord.Low)/2+lowrecord.Low)){
				if(downrange > 0.02){
					Log("在快速跌涨型态中，跌幅超过2%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.01 && ma14[ma14.length-1] > ema21[ema21.length-1]){
					Log("在快速跌涨型态中，跌幅超过1%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.006 && ma14[ma14.length-1] > ema21[ema21.length-1] && lastrecord.Close>=ema7[ema7.length-1]){
					Log("在快速跌涨型态中，跌幅超过0.6%且当前价已经回升超过7线，适合买入");
					ret = true;
				}
				//排除一些不合理的情况
				if(ret){
					if(lowrecord.Time == lastrecord.Time && (lastrecord.Close - lastrecord.Low)/(highrecord.High-lowrecord.Low) >=0.6 ){
						//除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足
						Log("除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足");
						ret = false;
					}
					if(ret && lowrecord.Type > 0 && (lowrecord.Open-lowrecord.Low)/lowrecord.Open > 0.001 && (lastrecord.Close < ((highrecord.High-lastrecord.Open)/2+lastrecord.Open) || lastrecord.Close<ema7[ema7.length-1] || secondrecord.Type<0)){
						//当最低价是阳线，验证条件更严格
						Log("当最低价是阳线，且开盘之后再大幅下跌，验证条件更严格，没有通过");
						ret = false;
					}
					if(ret && lowrecord.Type < 0 &&  records[lowrecord.recordid-1].Type>0){
						//当最低价是阴线，但最低价的前K是阳线验证条件更严格
						Log("当最低价是阴线，但最低价的前K是阳线验证条件更严格");
						ret = false;
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange>0.002){
			//持续下跌型态
			Log("初步判断为持续下跌型态");
			if(crossnum > -12){
				Log("在持续下跌型态，当前交叉数为",crossnum,"下跌还不够深入");
			}else{
				Log("在持续下跌型态，当前交叉数为",crossnum,"可以考虑看看是否有机会了");
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
							ret = true;
						}
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
							ret = true;
						}
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) < 14){
			//阴跌型态
			Log("初步判断为阴跌型态");
			if(downrange > 0.01 && lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在阴跌型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				if(avgdownrange > 0.0005){
					Log("平均跌幅超过0.0005，使用3倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
								ret = true;
							}else if((lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入3");
								ret = true;
							}
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}
						}
					}					
				}else{
					Log("平均跌幅小于0.0005，使用4倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
								ret = true;
							}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
								ret = true;
							}
						}
					}					
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) >= 14){
			//L型型态
			Log("初步判断为L型型态");
			if(lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在L型型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				//重新发现7个K线以内的最低价和最高价
				highrecord = lastrecord;
				lowrecord = lastrecord;
				lowrecord.emaid = ema7.length-1;
				lowrecord.recordid = records.length-1;
				klen = 7;
				for(var i=2;i<klen;i++){
					var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
					if(minprice < lowrecord.Low){
						lowrecord = records[records.length-i];
						lowrecord.emaid = ema7.length-i;
						lowrecord.recordid = records.length-i;
					}
					var maxprice = Math.max(highrecord.High, records[records.length-i].High);
					if(maxprice > highrecord.High){
						highrecord = records[records.length-i];
					}
				}
				//重新计算跌幅和平均跌幅
				var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
				var avgdownrange = downrange/klen;
				Log("重新找到的低价K线是",_D(lowrecord.Time),"最低价是",lowrecord.Low,"最高价是",highrecord.High,"跌幅是",downrange,"平均跌幅是",avgdownrange);
				//重新计算的跌幅没有超过0.7%，那就放弃
				if(downrange<0.007 || (ema7[lowrecord.emaid] - lowrecord.Low)/lowrecord.Low < 0.007){
					Log("在L型型态中，重新找到的底部有效跌幅不足0.7%，不符合买入条件");
					return ret;
				}
				//再来以4倍检验条件是否达到
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
							ret = true;
						}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
							ret = true;
						}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
							ret = true;
						}
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
							ret = true;
						}
					}
				}					
			}
		}
		//排除阴跌型态中的所有K线都在7线之上，出现的大阴大阳的组合
		var havebelow7line = false;
		if(ret){
			//过滤所有K线都在7线之上后的情况
			for(var i=1;i<7;i++){
				if(records[records.length-i].High/ema7[ema7.length-i]<0.999){
					havebelow7line = true;
					break;
				}
			}
			if(!havebelow7line){
				if(crossnum > -5){
					Log("所有的K线的高点都在7线之上，在急跌急涨行情中显得有效下跌空间不足，放弃买入");
					ret = false;
				}else{
					var now = new Date().getTime();
					if(now-lastrecord.Time < 10*60*1000){
						//当前K线还没有超过10分钟，有可能会忽高忽低，在K线内又跌下去，所以10分钟内忽略
						Log("所有的K线的高点都在7线之上，当前K线还没有超过10分钟，有可能会忽高忽低，在K线内又跌下去，所以10分钟内忽略");
						ret = false;
					}
				}
			}			
		}
		if(ret && crossnum < -7){
			if(!havebelow7line || secondrecord.High > lastrecord.Close){
				Log("持续下跌或是阴跌型态下，前K在7线之上、前K高于当前K线最高价，要进一步验证。");
				if(secondrecord.Type < 0){
					//前K是条阴线
					var downnum = secondrecord.Open-secondrecord.Close;
					var upnum = lastrecord.Close-lastrecord.Open;
					var max = Math.max(upnum,downnum);
					var min = Math.min(upnum,downnum);
					var now = new Date().getTime();
					if(max/min <= 0.1 || lastrecord.Close < secondrecord.High*(1+avgdownrange*2) || (now-lastrecord.Time) < 10*60*1000){
						//排除1.阳体小于阴体
						//排除2.当前价没有超过前K高价的2个平均跌幅
						ret = false;
						Log("排除阴跌型态中的大阴大阳组合造成的错误信号");
					}
				}
			}
			if(ret){
				//当前K线高于前K
				var signs = [-1, -2, -3, -4, -5, -6, -8, 2, 3, 4, 5, 6, 8, 100];
				if(signs.indexOf(secondrecord.Type) > -1 && lastrecord.Close < ema7[ema7.length-1]*(1+avgdownrange)){
					//前K是个长上影线的K线，说明上涨有压力，当前K线必须在超过7日线一个平均跌幅之后才买入
					Log("前K是个长上影线的K线，说明上涨有压力，当前K线必须在超过7日线一个平均跌幅之后才买入");
					ret = false;
				}else if((lowrecord.Type<0 || signs.indexOf(lowrecord.Type)) > -1 && lowrecord.High > ema7[lowrecord.emaid] && records.length-lowrecord.recordid>=3){
					Log("最低K已经跨上了7线，且在3条K线之后才达到条件，说明上涨动力暂无力冲破压力");
					ret = false;
				}
			}
		}
    }
    	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",lowrecord.Low);
    return ret; 
}

/*********************************
在熊市恐慌出逃行情下，检测是否可以抄底买入
*********************************/
function checkCanBuyInDeathArea1(tp, records, ema7, ema21, ma14, crossnum){
	Log("在熊市恐慌出逃行情下，检测是否可以抄底买入");
    var ret = false;
    //当前K线或是前一K线到现在跌幅超过10%，每次下跌2%买入一次
    var lastrecord = tp.LastRecord;
    var secondrecord = records[records.length-2];
    if(lastrecord.Close/lastrecord.Open > 1.1 || lastrecord.Close/secondrecord.Open > 1.1 ){
    	if(_G(tp.Name+"_LastBuyTS") >= secondrecord.Time && lastrecord.Close/_G(tp.Name+"_LastBuyPrice") > 1.02){
    		Log("当前价比上一次买入价再下降2%，买入抄底");
    		ret = true;
    	}else if(_G(tp.Name+"_LastBuyTS") < secondrecord.Time){
    		Log("在进入恐慌出逃行情后第一次买入，买入抄底");
    		ret = true;
    	}
    }
    return ret; 
}

/*********************************
在熊市持续下跌行情下，检测是否可以抄底买入
*********************************/
function checkCanBuyInDeathArea2(tp, records, ema7, ema21, ma14, crossnum){
	Log("在熊市持续下跌行情下，检测是否可以抄底买入");
    var ret = false;
    //取得当前死叉内价格最低的K线
    var lastrecord = tp.LastRecord;
    if(lastrecord.Type>0 && ema7[ema7.length-1]<ema21[ema21.length-1]){
        Log("交叉数是",crossnum,"当前K线是",_D(lastrecord.Time),"当前价是",lastrecord.Close,"当前K线涨幅有",(lastrecord.Close-lastrecord.Low)/lastrecord.Low,"当前7日均线价是",ema7[ema7.length-1],"当前21日均线价是",ema21[ema21.length-1])
        //符合条件1，当前K线是个阳线，当前价高于7日均线价
        Log("符合条件1，当前是阳线，且7线在21线之前。");
        //获取死叉内平均K线跌幅,最高价和最低价
        var highrecord = lastrecord;
        var lowrecord = lastrecord;
        lowrecord.emaid = ema7.length-1;
        lowrecord.recordid = records.length-1;
        var klen = Math.abs(crossnum)+2;    //-1之前的那条K线的大幅下跌才引起死叉，所以要把它算上
        for(var i=2;i<klen;i++){
            var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
            if(minprice < lowrecord.Low){
                lowrecord = records[records.length-i];
                lowrecord.emaid = ema7.length-i;
                lowrecord.recordid = records.length-i;
            }
            var maxprice = Math.max(highrecord.High, records[records.length-i].High);
            if(maxprice > highrecord.High){
                highrecord = records[records.length-i];
            }
        }
        Log("当前死叉内价格最低的K线是",_D(lowrecord.Time),"其最高价是",lowrecord.High,"最低价是",lowrecord.Low,"7日均线价是",ema7[lowrecord.emaid]);
        var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
        var avgdownrange = downrange/(klen-1);
        Log("当前死叉内最高价格K线是",_D(highrecord.Time),"最高价是",highrecord.High,"K线数有",(klen-1),"跌幅",downrange,"平均跌幅",avgdownrange,"交叉数是",crossnum);
		var secondrecord = records[records.length-2];
		var deathrecord = records[records.length-Math.abs(crossnum)];
		if(crossnum>=-2 && avgdownrange>=0.005){
			//急跌急涨型态
			Log("初步判断为急跌急拉型态");
			if(secondrecord.High/secondrecord.Low > 1.02 && lastrecord.Close/lastrecord.Low > 1.01){
				Log("在急跌急涨型态中，上一K线的跌幅超过2%，当前K线反弹超过1个点，可以买入");
				ret = true;
			}
		}else if(crossnum<-2 && crossnum>=-5 && avgdownrange>0.002){
			//快速跌涨型态
			Log("初步判断为快速跌涨型态");
			if(lastrecord.Close > ((highrecord.High-lowrecord.Low)/2+lowrecord.Low)){
				if(downrange > 0.02){
					Log("在快速跌涨型态中，跌幅超过2%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.01 && ma14[ma14.length-1] > ema21[ema21.length-1]){
					Log("在快速跌涨型态中，跌幅超过1%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.006 && ma14[ma14.length-1] > ema21[ema21.length-1] && lastrecord.Close>=ema7[ema7.length-1]){
					Log("在快速跌涨型态中，跌幅超过0.6%且当前价已经回升超过7线，适合买入");
					ret = true;
				}
				//排除一些不合理的情况
				if(ret){
					if(lowrecord.Time == lastrecord.Time && (lastrecord.Close - lastrecord.Low)/(highrecord.High-lowrecord.Low) >=0.6 ){
						//除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足
						Log("除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足");
						ret = false;
					}
					if(ret && lowrecord.Type > 0 && lastrecord.Volume < deathrecord.Volume*2 && (lowrecord.Open-lowrecord.Low)/lowrecord.Open > 0.001 && (lastrecord.Close < ((highrecord.High-lastrecord.Open)/2+lastrecord.Open) || lastrecord.Close<ema7[ema7.length-1] || secondrecord.Type<0)){
						//当最低价是阳线，验证条件更严格
						Log("当最低价是阳线，且开盘之后再大幅下跌，验证条件更严格，没有通过");
						ret = false;
					}
					if(ret && lowrecord.Type < 0 && records[lowrecord.recordid-1].Type>0 && lastrecord.Volume < deathrecord.Volume*2){
						//当最低价是阴线，但最低价的前K是阳线验证条件更严格
						Log("当最低价是阴线，但最低价的前K是阳线验证条件更严格");
						ret = false;
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange>0.002){
			//持续下跌型态
			Log("初步判断为持续下跌型态");
			if(crossnum > -12){
				Log("在持续下跌型态，当前交叉数为",crossnum,"下跌还不够深入");
			}else{
				Log("在持续下跌型态，当前交叉数为",crossnum,"可以考虑看看是否有机会了");
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
						ret = true;
					}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
							ret = true;
						}
					}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
							ret = true;
						}
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) < 14){
			//阴跌型态
			Log("初步判断为阴跌型态");
			if(downrange > 0.01 && lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在阴跌型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				if(avgdownrange > 0.0005){
					Log("平均跌幅超过0.0005，使用3倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
							ret = true;
						}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
								ret = true;
							}else if((lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入3");
								ret = true;
							}
						}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}
						}
					}					
				}else{
					Log("平均跌幅小于0.0005，使用4倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
							ret = true;
						}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
								ret = true;
							}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*3 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
								Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
								ret = true;
							}
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
								ret = true;
							}
						}
					}					
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) >= 14){
			//L型型态
			Log("初步判断为L型型态");
			if(lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在L型型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				//重新发现7个K线以内的最低价和最高价
				highrecord = lastrecord;
				lowrecord = lastrecord;
				lowrecord.emaid = ema7.length-1;
				lowrecord.recordid = records.length-1;
				klen = 7;
				for(var i=2;i<klen;i++){
					var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
					if(minprice < lowrecord.Low){
						lowrecord = records[records.length-i];
						lowrecord.emaid = ema7.length-i;
						lowrecord.recordid = records.length-i;
					}
					var maxprice = Math.max(highrecord.High, records[records.length-i].High);
					if(maxprice > highrecord.High){
						highrecord = records[records.length-i];
					}
				}
				//重新计算跌幅和平均跌幅
				var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
				var avgdownrange = downrange/klen;
				Log("重新找到的低价K线是",_D(lowrecord.Time),"最低价是",lowrecord.Low,"最高价是",highrecord.High,"跌幅是",downrange,"平均跌幅是",avgdownrange);
				//重新计算的跌幅没有超过0.7%，那就放弃
				if(downrange<0.007 || (ema7[lowrecord.emaid] - lowrecord.Low)/lowrecord.Low < 0.007){
					Log("在L型型态中，重新找到的底部有效跌幅不足0.7%，不符合买入条件");
					return ret;
				}
				//再来以4倍检验条件是否达到
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
						ret = true;
					}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
							ret = true;
						}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
							ret = true;
						}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
							ret = true;
						}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在L型型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
							ret = true;
						}
					}
				}					
			}
		}
		
		if(ret){
			//如果当前阳线拉出2倍的巨量，那不作排除验证
			if(lowrecord.Time != lastrecord.Time && lastrecord.Volume >= lowrecord.Volume*2 || lowrecord.Time == lastrecord.Time && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
				return ret;
			}
			//排除阴跌型态中的所有K线都在7线之上，出现的大阴大阳的组合
			var havebelow7line = false;
			//过滤所有K线都在7线之上后的情况
			for(var i=1;i<7;i++){
				if(records[records.length-i].High/ema7[ema7.length-i]<0.999){
					havebelow7line = true;
					break;
				}
			}
			if(!havebelow7line){
				if(crossnum > -5){
					Log("所有的K线的高点都在7线之上，在急跌急涨行情中显得有效下跌空间不足，放弃买入");
					ret = false;
				}else{
					var now = new Date().getTime();
					if(now-lastrecord.Time < 10*60*1000){
						//当前K线还没有超过10分钟，有可能会忽高忽低，在K线内又跌下去，所以10分钟内忽略
						Log("所有的K线的高点都在7线之上，当前K线还没有超过10分钟，有可能会忽高忽低，在K线内又跌下去，所以10分钟内忽略");
						ret = false;
					}
				}
			}			
			if(ret && crossnum < -7){
				if(!havebelow7line || secondrecord.High > lastrecord.Close){
					Log("持续下跌或是阴跌型态下，前K在7线之上、前K高于当前K线最高价，要进一步验证。");
					if(secondrecord.Type < 0){
						//前K是条阴线
						var downnum = secondrecord.Open-secondrecord.Close;
						var upnum = lastrecord.Close-lastrecord.Open;
						var max = Math.max(upnum,downnum);
						var min = Math.min(upnum,downnum);
						var now = new Date().getTime();
						if(max/min <= 0.1 || lastrecord.Close < secondrecord.High*(1+avgdownrange*2) || (now-lastrecord.Time) < 10*60*1000){
							//排除1.阳体小于阴体
							//排除2.当前价没有超过前K高价的2个平均跌幅
							ret = false;
							Log("排除阴跌型态中的大阴大阳组合造成的错误信号");
						}
					}
				}
				if(ret){
					//当前K线高于前K
					var signs = [-1, -2, -3, -4, -5, -6, -8, 2, 3, 4, 5, 6, 8, 100];
					if(signs.indexOf(secondrecord.Type) > -1 && lastrecord.Close < ema7[ema7.length-1]*(1+avgdownrange)){
						//前K是个长上影线的K线，说明上涨有压力，当前K线必须在超过7日线一个平均跌幅之后才买入
						Log("前K是个长上影线的K线，说明上涨有压力，当前K线必须在超过7日线一个平均跌幅之后才买入");
						ret = false;
					}else if((lowrecord.Type<0 || signs.indexOf(lowrecord.Type)) > -1 && lowrecord.High > ema7[lowrecord.emaid] && records.length-lowrecord.recordid>=3){
						Log("最低K已经跨上了7线，且在3条K线之后才达到条件，说明上涨动力暂无力冲破压力");
						ret = false;
					}
				}
			}
		}
    }
    	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",lowrecord.Low);
    return ret; 
}

/*********************************
在熊市底部修正行情下，检测是否可以抄底买入
*********************************/
function checkCanBuyInDeathArea3(tp, records, ema7, ema21, ma14, crossnum){
	Log("在熊市底部修正行情下，检测是否可以抄底买入");
    var ret = false;
    //取得当前死叉内价格最低的K线
    var lastrecord = tp.LastRecord;
    if(lastrecord.Type>0 && ema7[ema7.length-1]<ema21[ema21.length-1]){
        Log("交叉数是",crossnum,"当前K线是",_D(lastrecord.Time),"当前价是",lastrecord.Close,"当前K线涨幅有",(lastrecord.Close-lastrecord.Low)/lastrecord.Low,"当前7日均线价是",ema7[ema7.length-1],"当前21日均线价是",ema21[ema21.length-1])
        //符合条件1，当前K线是个阳线，当前价高于7日均线价
        Log("符合条件1，当前是阳线，且7线在21线之前。");
        //获取死叉内平均K线跌幅,最高价和最低价
        var highrecord = lastrecord;
        var lowrecord = lastrecord;
        lowrecord.emaid = ema7.length-1;
        lowrecord.recordid = records.length-1;
        var klen = Math.abs(crossnum)+2;    //-1之前的那条K线的大幅下跌才引起死叉，所以要把它算上
        for(var i=2;i<klen;i++){
            var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
            if(minprice < lowrecord.Low){
                lowrecord = records[records.length-i];
                lowrecord.emaid = ema7.length-i;
                lowrecord.recordid = records.length-i;
            }
            var maxprice = Math.max(highrecord.High, records[records.length-i].High);
            if(maxprice > highrecord.High){
                highrecord = records[records.length-i];
            }
        }
        Log("当前死叉内价格最低的K线是",_D(lowrecord.Time),"其最高价是",lowrecord.High,"最低价是",lowrecord.Low,"7日均线价是",ema7[lowrecord.emaid]);
        var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
        var avgdownrange = downrange/(klen-1);
        Log("当前死叉内最高价格K线是",_D(highrecord.Time),"最高价是",highrecord.High,"K线数有",(klen-1),"跌幅",downrange,"平均跌幅",avgdownrange,"交叉数是",crossnum);
		var secondrecord = records[records.length-2];
		var deathrecord = records[records.length-Math.abs(crossnum)];
		if(crossnum>=-2 && avgdownrange>=0.005){
			//急跌急涨型态
			Log("初步判断为急跌急拉型态");
			if(secondrecord.High/secondrecord.Low > 1.02 && lastrecord.Close/lastrecord.Low > 1.01){
				Log("在急跌急涨型态中，上一K线的跌幅超过2%，当前K线反弹超过1个点，可以买入");
				ret = true;
			}
		}else if(crossnum<-2 && crossnum>=-5 && avgdownrange>0.002){
			//快速跌涨型态
			Log("初步判断为快速跌涨型态");
			if(lastrecord.Close > ((highrecord.High-lowrecord.Low)/2+lowrecord.Low)){
				if(downrange > 0.02){
					Log("在快速跌涨型态中，跌幅超过2%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.01 && ma14[ma14.length-1] > ema21[ema21.length-1]){
					Log("在快速跌涨型态中，跌幅超过1%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.006 && ma14[ma14.length-1] > ema21[ema21.length-1] && lastrecord.Close>=ema7[ema7.length-1]){
					Log("在快速跌涨型态中，跌幅超过0.6%且当前价已经回升超过7线，适合买入");
					ret = true;
				}
				//排除一些不合理的情况
				if(ret){
					if(lowrecord.Time == lastrecord.Time && (lastrecord.Close - lastrecord.Low)/(highrecord.High-lowrecord.Low) >=0.6 ){
						//除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足
						Log("除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足");
						ret = false;
					}
					if(ret && lowrecord.Type > 0 && lastrecord.Volume < deathrecord.Volume*2 && (lowrecord.Open-lowrecord.Low)/lowrecord.Open > 0.001 && (lastrecord.Close < ((highrecord.High-lastrecord.Open)/2+lastrecord.Open) || lastrecord.Close<ema7[ema7.length-1] || secondrecord.Type<0)){
						//当最低价是阳线，验证条件更严格
						Log("当最低价是阳线，且开盘之后再大幅下跌，验证条件更严格，没有通过");
						ret = false;
					}
					if(ret && lowrecord.Type < 0 && records[lowrecord.recordid-1].Type>0 && lastrecord.Volume < deathrecord.Volume*2){
						//当最低价是阴线，但最低价的前K是阳线验证条件更严格
						Log("当最低价是阴线，但最低价的前K是阳线验证条件更严格");
						ret = false;
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange>0.002){
			//持续下跌型态
			Log("初步判断为持续下跌型态");
			if(crossnum > -12){
				Log("在持续下跌型态，当前交叉数为",crossnum,"下跌还不够深入");
			}else{
				Log("在持续下跌型态，当前交叉数为",crossnum,"可以考虑看看是否有机会了");
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
						ret = true;
					}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
							ret = true;
						}
					}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
							ret = true;
						}
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) < 14){
			//阴跌型态
			Log("初步判断为阴跌型态");
			if(downrange > 0.01 && lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在阴跌型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				if(avgdownrange > 0.0005){
					Log("平均跌幅超过0.0005，使用3倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
							ret = true;
						}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
								ret = true;
							}else if((lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入3");
								ret = true;
							}
						}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}
						}
					}					
				}else{
					Log("平均跌幅小于0.0005，使用4倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
							ret = true;
						}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
								ret = true;
							}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*3 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
								Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
								ret = true;
							}
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
								ret = true;
							}
						}
					}					
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) >= 14){
			//L型型态
			Log("初步判断为L型型态");
			if(lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在L型型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				//重新发现7个K线以内的最低价和最高价
				highrecord = lastrecord;
				lowrecord = lastrecord;
				lowrecord.emaid = ema7.length-1;
				lowrecord.recordid = records.length-1;
				klen = 7;
				for(var i=2;i<klen;i++){
					var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
					if(minprice < lowrecord.Low){
						lowrecord = records[records.length-i];
						lowrecord.emaid = ema7.length-i;
						lowrecord.recordid = records.length-i;
					}
					var maxprice = Math.max(highrecord.High, records[records.length-i].High);
					if(maxprice > highrecord.High){
						highrecord = records[records.length-i];
					}
				}
				//重新计算跌幅和平均跌幅
				var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
				var avgdownrange = downrange/klen;
				Log("重新找到的低价K线是",_D(lowrecord.Time),"最低价是",lowrecord.Low,"最高价是",highrecord.High,"跌幅是",downrange,"平均跌幅是",avgdownrange);
				//重新计算的跌幅没有超过0.7%，那就放弃
				if(downrange<0.007 || (ema7[lowrecord.emaid] - lowrecord.Low)/lowrecord.Low < 0.007){
					Log("在L型型态中，重新找到的底部有效跌幅不足0.7%，不符合买入条件");
					return ret;
				}
				//再来以4倍检验条件是否达到
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
						ret = true;
					}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
							ret = true;
						}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
							ret = true;
						}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
							ret = true;
						}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在L型型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
							ret = true;
						}
					}
				}					
			}
		}
		
		if(ret){
			//如果当前阳线拉出2倍的巨量，那不作排除验证
			if(lowrecord.Time != lastrecord.Time && lastrecord.Volume >= lowrecord.Volume*2 || lowrecord.Time == lastrecord.Time && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
				return ret;
			}
			//排除阴跌型态中的所有K线都在7线之上，出现的大阴大阳的组合
			var havebelow7line = false;
			//过滤所有K线都在7线之上后的情况
			for(var i=1;i<7;i++){
				if(records[records.length-i].High/ema7[ema7.length-i]<0.999){
					havebelow7line = true;
					break;
				}
			}
			if(!havebelow7line){
				if(crossnum > -5){
					Log("所有的K线的高点都在7线之上，在急跌急涨行情中显得有效下跌空间不足，放弃买入");
					ret = false;
				}else{
					var now = new Date().getTime();
					if(now-lastrecord.Time < 10*60*1000){
						//当前K线还没有超过10分钟，有可能会忽高忽低，在K线内又跌下去，所以10分钟内忽略
						Log("所有的K线的高点都在7线之上，当前K线还没有超过10分钟，有可能会忽高忽低，在K线内又跌下去，所以10分钟内忽略");
						ret = false;
					}
				}
			}			
		}
    }
    	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",lowrecord.Low);
    return ret; 
}

/*********************************
在熊市反弹上攻行情下，检测是否可以抄底买入
*********************************/
function checkCanBuyInDeathArea5(tp, records, ema7, ema21, ma14, crossnum){
	Log("在熊市反弹上攻行情下，检测是否可以抄底买入");
    var ret = false;
    //取得当前死叉内价格最低的K线
    var lastrecord = tp.LastRecord;
    if(lastrecord.Type>0 && ema7[ema7.length-1]<ema21[ema21.length-1]){
        Log("交叉数是",crossnum,"当前K线是",_D(lastrecord.Time),"当前价是",lastrecord.Close,"当前K线涨幅有",(lastrecord.Close-lastrecord.Low)/lastrecord.Low,"当前7日均线价是",ema7[ema7.length-1],"当前21日均线价是",ema21[ema21.length-1])
        //符合条件1，当前K线是个阳线，当前价高于7日均线价
        Log("符合条件1，当前是阳线，且7线在21线之前。");
        //获取死叉内平均K线跌幅,最高价和最低价
        var highrecord = lastrecord;
        var lowrecord = lastrecord;
        lowrecord.emaid = ema7.length-1;
        lowrecord.recordid = records.length-1;
        var klen = Math.abs(crossnum)+2;    //-1之前的那条K线的大幅下跌才引起死叉，所以要把它算上
        for(var i=2;i<klen;i++){
            var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
            if(minprice < lowrecord.Low){
                lowrecord = records[records.length-i];
                lowrecord.emaid = ema7.length-i;
                lowrecord.recordid = records.length-i;
            }
            var maxprice = Math.max(highrecord.High, records[records.length-i].High);
            if(maxprice > highrecord.High){
                highrecord = records[records.length-i];
            }
        }
        Log("当前死叉内价格最低的K线是",_D(lowrecord.Time),"其最高价是",lowrecord.High,"最低价是",lowrecord.Low,"7日均线价是",ema7[lowrecord.emaid]);
        var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
        var avgdownrange = downrange/(klen-1);
        Log("当前死叉内最高价格K线是",_D(highrecord.Time),"最高价是",highrecord.High,"K线数有",(klen-1),"跌幅",downrange,"平均跌幅",avgdownrange,"交叉数是",crossnum);
		var secondrecord = records[records.length-2];
		var deathrecord = records[records.length-Math.abs(crossnum)];
		if(crossnum>=-2 && avgdownrange>=0.005){
			//急跌急涨型态
			Log("初步判断为急跌急拉型态");
			if(secondrecord.High/secondrecord.Low > 1.02 && lastrecord.Close/lastrecord.Low > 1.01){
				Log("在急跌急涨型态中，上一K线的跌幅超过2%，当前K线反弹超过1个点，可以买入");
				ret = true;
			}
		}else if(crossnum<-2 && crossnum>=-5 && avgdownrange>0.002){
			//快速跌涨型态
			Log("初步判断为快速跌涨型态");
			if(lastrecord.Close > ((highrecord.High-lowrecord.Low)/2+lowrecord.Low)){
				if(downrange > 0.02){
					Log("在快速跌涨型态中，跌幅超过2%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.01 && ma14[ma14.length-1] > ema21[ema21.length-1]){
					Log("在快速跌涨型态中，跌幅超过1%且当前价已经反弹超过跌幅的1/2，适合买入");
					ret = true;
				}else if(downrange > 0.006 && ma14[ma14.length-1] > ema21[ema21.length-1] && lastrecord.Close>=ema7[ema7.length-1]){
					Log("在快速跌涨型态中，跌幅超过0.6%且当前价已经回升超过7线，适合买入");
					ret = true;
				}
				//排除一些不合理的情况
				if(ret){
					if(lowrecord.Time == lastrecord.Time && (lastrecord.Close - lastrecord.Low)/(highrecord.High-lowrecord.Low) >=0.6 ){
						//除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足
						Log("除当前K线之外前面的K线跌幅很小，说明没有下跌充分就上涨，那么实际跌幅不足");
						ret = false;
					}
					if(ret && lowrecord.Type > 0 && lastrecord.Volume < deathrecord.Volume*2 && (lowrecord.Open-lowrecord.Low)/lowrecord.Open > 0.001 && (lastrecord.Close < ((highrecord.High-lastrecord.Open)/2+lastrecord.Open) || lastrecord.Close<ema7[ema7.length-1] || secondrecord.Type<0)){
						//当最低价是阳线，验证条件更严格
						Log("当最低价是阳线，且开盘之后再大幅下跌，验证条件更严格，没有通过");
						ret = false;
					}
					if(ret && lowrecord.Type < 0 && records[lowrecord.recordid-1].Type>0 && lastrecord.Volume < deathrecord.Volume*2){
						//当最低价是阴线，但最低价的前K是阳线验证条件更严格
						Log("当最低价是阴线，但最低价的前K是阳线验证条件更严格");
						ret = false;
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange>0.002){
			//持续下跌型态
			Log("初步判断为持续下跌型态");
			if(crossnum > -12){
				Log("在持续下跌型态，当前交叉数为",crossnum,"下跌还不够深入");
			}else{
				Log("在持续下跌型态，当前交叉数为",crossnum,"可以考虑看看是否有机会了");
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
						ret = true;
					}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
							ret = true;
						}
					}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在持续下跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在持续下跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
							ret = true;
						}
					}
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) < 14){
			//阴跌型态
			Log("初步判断为阴跌型态");
			if(downrange > 0.01 && lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在阴跌型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				if(avgdownrange > 0.0005){
					Log("平均跌幅超过0.0005，使用3倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的3倍,适合买入");
							ret = true;
						}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入1");
								ret = true;
							}else if((lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入2");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入3");
								ret = true;
							}
						}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}
						}
					}					
				}else{
					Log("平均跌幅小于0.0005，使用4倍系数");
					if(lowrecord.Time == lastrecord.Time){
						Log("当前K线就是最低价K线");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
							ret = true;
						}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*3 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("当前K线不是最低价K线");
						if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
							Log("最低价K线的高价与7线有一个平均跌幅的距离");
							if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
								ret = true;
							}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
								ret = true;
							}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
								ret = true;
							}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*3 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
								Log("在阴跌型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
								ret = true;
							}
						}else{
							Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
							if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
								Log("在阴跌型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
								ret = true;
							}
						}
					}					
				}
			}
		}else if(crossnum<-5 && avgdownrange<=0.002 && (records.length-1-lowrecord.recordid) >= 14){
			//L型型态
			Log("初步判断为L型型态");
			if(lastrecord.Close>=ema7[ema7.length-1] && (ema7[ema7.length-1]>=ma14[ma14.length-1] || secondrecord.Type>0 && records[records.length-3].Type>0 /*&& ema7[ema7.length-2]>=ema7[ema7.length-3]*/)){
				Log("在L型型态中发现操作机会，现在当前价超过7线，且7线在14线之上或是已经出现三连阳");
				//重新发现7个K线以内的最低价和最高价
				highrecord = lastrecord;
				lowrecord = lastrecord;
				lowrecord.emaid = ema7.length-1;
				lowrecord.recordid = records.length-1;
				klen = 7;
				for(var i=2;i<klen;i++){
					var minprice = Math.min(lowrecord.Low, records[records.length-i].Low);
					if(minprice < lowrecord.Low){
						lowrecord = records[records.length-i];
						lowrecord.emaid = ema7.length-i;
						lowrecord.recordid = records.length-i;
					}
					var maxprice = Math.max(highrecord.High, records[records.length-i].High);
					if(maxprice > highrecord.High){
						highrecord = records[records.length-i];
					}
				}
				//重新计算跌幅和平均跌幅
				var downrange = (highrecord.High-lowrecord.Low)/highrecord.High;
				var avgdownrange = downrange/klen;
				Log("重新找到的低价K线是",_D(lowrecord.Time),"最低价是",lowrecord.Low,"最高价是",highrecord.High,"跌幅是",downrange,"平均跌幅是",avgdownrange);
				//重新计算的跌幅没有超过0.7%，那就放弃
				if(downrange<0.007 || (ema7[lowrecord.emaid] - lowrecord.Low)/lowrecord.Low < 0.007){
					Log("在L型型态中，重新找到的底部有效跌幅不足0.7%，不符合买入条件");
					return ret;
				}
				//再来以4倍检验条件是否达到
				if(lowrecord.Time == lastrecord.Time){
					Log("当前K线就是最低价K线");
					if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的升幅超过了平均跌幅的4倍,适合买入");
						ret = true;
					}else if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
						Log("在L型型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
						ret = true;
					}
				}else{
					Log("当前K线不是最低价K线");
					if((ema7[lowrecord.emaid]-Math.max(lowrecord.Close,lowrecord.Open))/ema7[lowrecord.emaid] >= avgdownrange){
						Log("最低价K线的高价与7线有一个平均跌幅的距离");
						if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*2 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*2){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入2");
							ret = true;
						}else if((ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange*3 && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入3");
							ret = true;
						}else if((lastrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的3倍,适合买入4");
							ret = true;
						}else if((lastrecord.Close-lastrecord.Low)/lastrecord.Low >= avgdownrange*2 && lastrecord.Volume >= Math.max(deathrecord.Volume,secondrecord.Volume)*2){
							Log("在L型型态中，当前K线就是最低价K线,并且当前价的超过了平均跌幅同时交易量明显放大,适合买入");
							ret = true;
						}
					}else{
						Log("最低价K线的高价与7线没有达到一个平均跌幅的距离");
						if((lowrecord.Close-lowrecord.Low)/lowrecord.Low >= avgdownrange*4 || (ema7[lowrecord.emaid]-lowrecord.Low)/lowrecord.Low > avgdownrange && (lastrecord.Close-ema7[ema7.length-1])/ema7[ema7.length-1] > avgdownrange*3){
							Log("在L型型态中，当前K线不是最低价K线,但当前有效升幅超过了平均跌幅的4倍,适合买入5");
							ret = true;
						}
					}
				}					
			}
		}
    }
    	//设置防守线
	if(ret) _G(tp.Name+"_StopLinePrice",lowrecord.Low);
    return ret; 
}

/**************************
检测是否跌破止损线（防守线）
1.防守线是当前K线往前推两根K线的开盘价
2.看当前价是否低于14线且在防守线之下，如果是返回来真
**************************/
function checkBreakDefenseLine(tp){
	Log("检测是否跌破止损线（防守线）");
	var ret = false;
	var defenseline = _G(tp.Name+"_StopLinePrice");
	if(!defenseline) defenseline = _G(tp.Name+"_AvgPrice")*(1+tp.Args.BuyFee+tp.Args.SellFee);
	var ma = tp.MAArray;
	var ticker = tp.Ticker;
	var maprice = ma[ma.length-1];
	if(ticker.Last < maprice && ticker.Last < defenseline){
		ret = true;
		Log("检测当前已经跌破止损线（防守线）");
	}
	return ret;
}
 
/********************
识别阴阳阴K线特征
1.当前K线或是判断K线就是最开始买入的K线时，返回为假，因为当前K线的价格会有波动，当前K线的最低价可能随时有可能低于14日均线，然后又升收盘，所以判断意义不大
2.然后判断当前阴线收盘价是否低于14日均线，如果低于就继续往下查找阴阳阴形态
3.如果后阴收盘价低于持仓均价，返回为真，
4.如果阴阳阴形态存在并且后阴收盘价低于前阴收盘价,那返回为真
***********************/
function identifyYinYangYin(tp){
	Log("识别阴阳阴K线特征");
    var ret = false;
    var readid = 1;
    //如果之前没出现过信号（lastsignalts = 0）就往前看一根K线为准，已经出现过信号，那就看当前K线实时信号
	var lastsignalts = _G(tp.Name+"_LastSignalTS");
    if(lastsignalts > 0){
		//发生过信号，判断信号点是否就是当前K，如果是不重复操作
		if(lastsignalts == tp.LastRecord.Time) return ret; //不在同一跟K线进行多次止盈
	}else{
		readid = 2;
	}
	var records = tp.Records;
	var ma = tp.MAArray;
    var nowticker = records[records.length-readid];
	var firstbuy = _G(tp.Name+"_FirstBuyTS");
	if(nowticker.Time == firstbuy) return ret;	//当前K线就是初次买入的K线，没有阴阳阴判断意义，退出返回为假
    var manow = ma[ma.length-readid];
    //首先判断K线的收盘价是否在14均线之下
    if(nowticker.Type < 0 && nowticker.Close < manow){
        //首要条件成立，再判断当前收盘价是否已经低于均价，如果低也算是阴阳阴
		if(nowticker.Close < _G(tp.Name+"_AvgPrice")){
			//Log("nowk",_D(tp.LastRecord.Time),"readid",readid,"当前K",_D(nowticker.Time),"当前价",nowticker.Close,"低于成本线",_G(tp.Name+"_AvgPrice"));
			ret = true;
		}else{
			//如果没有低于均价，回找当前K线之前的K线有没有出现收盘价较高的阴线
			var start = records.length-readid;
			var end = start - tp.CrossNum;
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
function identifyTopSellOffSignal(tp){
	Log("识别顶部抛压信号");
    var ret = false;
    var signs = [-1, -2, -5, -8, -10, -13, -15, 2, 5, 8, 100];
    var readid = 2;
    //如果之前没出现过信号（lastsignalts = 0）就往前看一根K线为准，已经出现过信号，那就看当前K线实时信号
	var lastsignalts = _G(tp.Name+"_LastSignalTS");
	if(lastsignalts == tp.LastRecord.Time) return ret; //不在同一跟K线进行多次止盈
	//Log("lastsignalts",_D(lastsignalts));
	//if(tp.LastRecord.Type>0) return ret;	//如果当前K线是阳线状态就不理
	//获取买入后的最高价
	var records = tp.Records;
	var maxprice = tp.LastRecord.High;
	var lastbuyts = _G(tp.Name+"_LastBuyTS");
	for(var i=records.length-readid;i>=0;i--){
		if(records[i].Time>=lastbuyts){
			maxprice = Math.max(maxprice,records[i].High);
		}else{
			break;
		}
	}
    var nowticker = records[records.length-readid];
	//Log("nowticker.Time",_D(nowticker.Time));
	//Log("nowticker.Type",nowticker.Type);
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
function identifyDarkCloudCover(tp){
	Log("识别庄家快速拉升之后快速出货（俗称：乌云盖顶）");
    var ret = false;
    var readid = 1;
    //如果之前没出现过信号（lastsignalts = 0）就往前看一根K线为准，已经出现过信号，那就看当前K线实时信号
	var lastsignalts = _G(tp.Name+"_LastSignalTS");
    if(lastsignalts > 0){
		//发生过信号，判断信号点是否就是当前K，如果是不重复操作
		if(lastsignalts == tp.LastRecord.Time) return ret; //不在同一跟K线进行多次止盈
	}else{
		readid = 2;
	}
	var records = tp.Records;
    var nowticker = records[records.length-readid];
    var lastticker = records[records.length-readid-1];
    var nowtype = [-4, -5, -6, -7, -10, -11, -12, -13, -14, -15];
    var middletype = [7, 10, 11]; //中阳线
    var bigtype = [12, 13, 14, 15]; //大阳线
	//Log(nowtype.indexOf(nowticker.Type)," != -1 && (",bigtype.indexOf(lastticker.Type)," != -1 || ",middletype.indexOf(lastticker.Type)," != -1 && ",lastticker.Close/lastticker.Open," > 1.006 || (",lastticker.Type," > 0 && ",(nowticker.High-nowticker.Low)," > ",(lastticker.High-lastticker.Low),"))");
    if(nowtype.indexOf(nowticker.Type) != -1 && (bigtype.indexOf(lastticker.Type) != -1 || middletype.indexOf(lastticker.Type) != -1 && lastticker.Close/lastticker.Open > 1.006 || (lastticker.Type > 0 && (nowticker.High-nowticker.Low) > (lastticker.High-lastticker.Low) && nowticker.Close < ((lastticker.High-lastticker.Low)/2+lastticker.Low)))){
		//Log("符合第一条件")
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

/***************************
识别顶部的长上影线顶部抛压信号
1.上影线或是抛压深度超过或等于当前K线开盘价的2%，说明是条长上影线，要操作立即抛售
2.或者长上影线大于1.5%并且当前的价格已经低于成本价了
3.或者当前长上影线大于1%，最高价比成本价升了2个点以上，并且离买入的K线在5条K线内，说明是突然拉起，就有可能跌得很快
***************************/
function identifyShadowLine(tp){
	Log("识别顶部的长上影线顶部抛压信号");
    var ret = false;
    var nowticker = tp.LastRecord;
    if(tp.CrossNum > 3){
    	//超过交叉数为3，不是从底部爆拉上来的情况下，看上一条K线不看当前K线
    	nowticker = tp.Records[tp.Records.length - 2];
    }
    //做时间验证，有可能是闪跌
    var now = new Date().getTime();
    if(tp.LastRecord.Close > nowticker.Open || now - tp.LastRecord.Time < 10*60*1000){
    	//如果当前价没有跌破上一K线开盘价，或当前时间在10分钟内暂不视作为有效信号
    	return ret;
    }
	//获取买入后的最高价
	var maxprice = nowticker.High;
	var knum = 1;
	var lastbuyts = _G(tp.Name+"_LastBuyTS");
	var records = tp.Records;
	for(var i=records.length-2;i>=0;i--){
		if(records[i].Time>=lastbuyts){
			maxprice = Math.max(maxprice,records[i].High);
			knum++;
		}else{
			break;
		}
	}
	var costprice = _G(tp.Name+"_AvgPrice")*(1+tp.Args.BuyFee+tp.Args.SellFee);
	var downnum = nowticker.High - nowticker.Close;
	var kbody = nowticker.Close - nowticker.Open;
	var downpercent = downnum/nowticker.Open;
	//顶部确认
    if(nowticker.High >= maxprice || (maxprice/nowticker.High) < 1.01){
    	//1.上影线的高底大于体的高度，
		//2.已经拉成了阴线
    	if((downpercent >= 0.02 || (downnum > kbody || nowticker.Type < 0) && (downpercent >= 0.015 && nowticker.Close <= costprice || downpercent >= 0.015 && knum <= 5 && maxprice/costprice >= 1.02))){
	        ret = true;
			if(tp.Args.Debug){
				var lastsignalts = _G(tp.Name+"_LastSignalTS");
				if(lastsignalts > 0){
					Log("当前K线出现顶部的长上影线顶部抛压信号，上一次出现止盈信号是在",_D(lastsignalts));
				}else{
					Log("当前K线出现顶部的长上影线顶部抛压信号，这是买入后第一次出现");
				}
			}
    	}
    }
    return ret;

}

/**
 * 识别当前行情
 * 1.验证程序4小时做一次
 * 2.以4小时行情K线作为分析依据
 * 3.如果当前是熊市且当前K线价格有效升幅超过10%进行牛市行情
 * 2.如果价格在4小时内
 * @param {} tp
 */
function identifyTheMarket(tp){
	//进入行情识别
	Log("进入行情识别");
	var market = _G(tp.Name+"_ConjunctureType");
	var now = new Date().getTime();
	//先做快速涨跌判断,只针对当前K线
	var quickcheck = false;
	var secondrecord = tp.Records[tp.Records.length-2];
	var xrecord = tp.Records[tp.Records.length-Math.abs(tp.CrossNum)];
	if(market != 1 && ((tp.LastRecord.High-tp.LastRecord.Low)/tp.LastRecord.High >= 0.1 || (secondrecord.High-tp.LastRecord.Low)/secondrecord.High >= 0.1)){
		//当前K线快速下跌超过10%，行情转为恐慌出逃行情
		Log("当前K线快速下跌超过10%，行情转为恐慌出逃行情");
		MarketEnvironment = 0;
		market = 1;
		_G(tp.Name+"_DoedTargetProfit",0);	//行情转好，重置止盈标识
		quickcheck = true;
	}else if(market != 2 && tp.CrossNum < -2 && (xrecord.High-tp.LastRecord.Low)/xrecord.High >= 0.1){
		//死叉后连续下跌超过10%，行情转为持续下跌行情
		Log("死叉后连续下跌超过10%，行情转为持续下跌行情");
		MarketEnvironment = 0;
		market = 2;
		quickcheck = true;
	}else if(MarketEnvironment == 0 && tp.CrossNum > 0 && market == 2 && tp.LastRecord.High/xrecord.Low >= 1.05){
		//金叉后连续上涨超过5%，行情转为底部修正行情
		Log("持续下跌行情时金叉后连续上涨超过5%，行情转为底部修正行情");
		market = 3;
		quickcheck = true;
	}else if(MarketEnvironment == 0 && tp.CrossNum > 0 && market == 2 && tp.LastRecord.High/tp.LastRecord.Low >= 1.05){
		//当前K线快速拉涨超过5%，行情转为底部修正行情
		Log("持续下跌行情时当前K线快速拉涨超过5%，行情转为底部修正行情");
		market = 3;
		quickcheck = true;
	}else if(MarketEnvironment == 0 && tp.CrossNum > 0 && market > 1 && market < 5 && tp.LastRecord.High/xrecord.Low >= 1.1){
		//金叉后连续上涨超过5%，行情转为反弹上冲行情
		Log("金叉后连续上涨超过10%，行情转为反弹上冲行情");
		market = 5;
		_G(tp.Name+"_DoedTargetProfit",0);	//行情转好，重置止盈标识
		quickcheck = true;
	}else if(MarketEnvironment == 0 && tp.CrossNum > 0 && market > 1 && market < 5 && tp.LastRecord.High/tp.LastRecord.Low >= 1.1){
		//当前K线快速拉涨超过10%，行情转为反弹上冲行情
		Log("当前K线快速拉涨超过10%，行情转为反弹上冲行情");
		market = 5;
		_G(tp.Name+"_DoedTargetProfit",0);	//行情转好，重置止盈标识
		quickcheck = true;
	}
	if(quickcheck){
		LastIdentifyMarket = now;
	}
	
	//做完简单的快速验证如果没有匹配，再做1小时一次的验证
	var hourts = 60*60*1000;
	if(now < LastIdentifyMarket + hourts ) return market;
	//通过频率验证
	LastIdentifyMarket = now;
	//以4小时K线为分析依据
	var Records = _C(tp.Exchange.GetRecords, PERIOD_H1);
	var ema7 = TA.EMA(Records,7);
	var ema21 = TA.EMA(Records,21);
	var crossnum = getEmaCrossNum(ema7, ema21);  
	if(crossnum === 0) return market;	//在回测系统中读1小时K线只能读到14条，所以使得ema21数组为空，所以crossnum为0
	var lastrecord = Records[Records.length-1];
	//处理小行情
	if(MarketEnvironment == 0){
		//如果当前是熊市行情，再判断小行情
		if(crossnum > 0){
			//根据金叉后的行情进行判断切换
			var kingrecord = Records[Records.length-crossnum];
			if(market == 2 && crossnum >= 2 && lastrecord.High/kingrecord.Low > 1.02 && lastrecord.High/kingrecord.Low < 1.05 ){
				Log("持续下跌行情时当前K线快速拉涨超过2%，金叉后拉涨不超过5%，行情转为底部修正行情");
				market = 3; //底部修正行情
			}else if(market == 1){
				Log("恐慌出逃行情回神之后进入持续下跌行情");
				market = 2; 
			}else if(crossnum >= 24 || lastrecord.High/kingrecord.Low >= 1.1){
				if(tp.Ticker.Last/kingrecord.Open > 1.4){
					//连续上涨超过，进入牛市
					Log("金叉后连续拉涨超过40%，进入牛市行情");
					MarketEnvironment = 1;
					market = 0;
				}else if(market != 5){
					Log("金叉后连续拉涨超过10%或连续上涨期超过1天，进入反弹上冲行情");
					market = 5; //反弹上冲行情
					_G(tp.Name+"_DoedTargetProfit",0);	//行情转好，重置止盈标识
				}
			}
		}else{
			//根据死叉后的行情进行判断切换
			if(market != 2 && crossnum<=-24){
				Log("死叉后连续下跌1天，行情转为持续下跌行情");
				market = 2; //持续下跌行情
			}
			
		}
	}else{
		//在牛市当中时
		if(crossnum<0){
			//根据死叉后的行情判断切换
			if(crossnum >= -2){
				//找到上一个金叉当中的最高价
				var knum = getLastAreaKnum(ema7, ema21, crossnum);
				var max_king = 0;
				for(var i=1;i<=knum;i++){
					var maxprice=Math.max(max_king,records[records.length-i].High);
					if(maxprice>max_king){
						max_king = maxprice;
					}
				}
				if((max_king-tp.Ticker.Last)/max_king >= 0.2){
					//从最高价下跌20%，且带来了死叉，进入熊市的持续下跌行情
					Log("牛市时从最高价下跌20%，且带来了死叉，进入熊市的持续下跌行情");
					MarketEnvironment = 0;
					market = 2;
				}
			}else if(crossnum <= -24){
				//持续下跌了24小时，没有形成金叉，转变为持续下跌行情
				Log("牛市时持续下跌了24小时，没有形成金叉，转变为持续下跌行情");
				MarketEnvironment = 0;
				market = 2;
			}
		}
	}	
	return market;
}

//处理卖出成功之后数据的调整
function changeDataForSell(tp,order){
	//算出扣除平台手续费后实际的数量
	var avgPrice = _G(tp.Name+"_AvgPrice");
	var TotalProfit = _G("TotalProfit");
	var SubProfit = _G(tp.Name+"_SubProfit");
	var profit = parseFloat((order.AvgPrice*order.DealAmount*(1-tp.Args.SellFee) - avgPrice*order.DealAmount*(1+tp.Args.BuyFee)).toFixed(tp.Args.PriceDecimalPlace));
	SubProfit += profit;
	TotalProfit += profit;
	tp.LastProfit = profit;
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
		_G(tp.Name+"_DoedTargetProfit", 1); //标识已经操作止盈
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
	
	//设置本次卖出价格
	_G(tp.Name+"_LastSellPrice",order.AvgPrice);
}

//检测卖出订单是否成功
function checkSellFinish(tp){
    var ret = true;
	var lastOrderId = _G(tp.Name+"_LastOrderId");
	var order = tp.Exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		changeDataForSell(tp,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			changeDataForSell(tp,order);
		}else{
			Log(tp.Title,"交易对订单",lastOrderId,"未有成交!卖出价格：",order.Price,"，当前价：",tp.Ticker.Last,"，价格差：",_N(order.Price - tp.Ticker.Last, tp.Args.PriceDecimalPlace));
		}
		//撤消没有完成的订单
		tp.Exchange.CancelOrder(lastOrderId);
		Log(tp.Title,"交易对取消卖出订单：",lastOrderId);
		Sleep(1300);
	}
    return ret;
}

//处理买入成功之后数据的调整
function changeDataForBuy(tp,order){
	//读取原来的持仓均价和持币总量
	var avgPrice = _G(tp.Name+"_AvgPrice");
	var coinAmount = tp.Account.Stocks;
	
	//计算持仓总价
	var Total = parseFloat((avgPrice*(coinAmount-order.DealAmount*(1-tp.Args.BuyFee))+order.AvgPrice * order.DealAmount).toFixed(tp.Args.PriceDecimalPlace));
	
	//计算并调整平均价格
	avgPrice = parseFloat((Total / coinAmount).toFixed(tp.Args.PriceDecimalPlace));
	_G(tp.Name+"_AvgPrice",avgPrice);
	
	//在牛市买入之后重置止损线，方便在策略里面进行设置。
	if(MarketEnvironment) _G(tp.Name+"_StopLinePrice", avgPrice);
	
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
	
	//设置首次买入时间
	var firstbuy = _G(tp.Name+"_FirstBuyTS");
	if(firstbuy == 0){
		_G(tp.Name+"_FirstBuyTS", _G(tp.Name+"_LastBuyTS"));
	}
}

//检测买入订单是否成功
function checkBuyFinish(tp){
	var lastOrderId = _G(tp.Name+"_LastOrderId");
	var order = tp.Exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		//处理买入成功后的数据调整
		changeDataForBuy(tp,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			//处理买入成功后的数据调整
			changeDataForBuy(tp,order);
		}else{
			Log(tp.Title,"交易对买入订单",lastOrderId,"未有成交!订单买入价格：",order.Price,"，当前卖一价：",tp.Ticker.Sell,"，价格差：",_N(order.Price - tp.Ticker.Sell, tp.Args.PriceDecimalPlace));
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

/**
 * 获得上一个金叉/死叉区域的K线数量
 * @param {} ema7
 * @param {} ema21
 * @param {} crossnum
 */
function getLastAreaKnum(ema7, ema21, crossnum){
	var new_ema7 = new Array();
	var new_ema21 = new Array();
	var stopnum = ema7.length - crossnum;
	for(var i = 0;i<ema7.length;i++){
		if(i === stopnum) break;
		new_ema7.push(ema7[i]);
	}
	stopnum = ema21.length - crossnum;
	for(var i = 0;i<ema21.length;i++){
		if(i === stopnum) break;
		new_ema21.push(ema21[i]);
	}
	return getEmaCrossNum(new_ema7, new_ema21);
}


/**
 * 检测是否可以操作定点止盈
 * @param {} tp
 */
function checkCanTargetProfit(tp){
	var ret = false;
	var ctype = _G(tp.Name+"_ConjunctureType");//了解行情
	var profit = 0.01;	//默认盈利点为1%
	switch(ctype){
		case 1:	//恐慌出逃
			profit = 0.08;
			break;
		case 2:	//持续下跌
			if(tp.CrossNum < 0) profit = 0.02; //抄底止盈点为2%
			break;
		case 3:	//底部修正
			profit = 0.02;
			break;
		case 4:	//盘桓储力
			//不建议操作止盈
			break;
		case 5:	//反弹上冲
			profit = 0.1;
			break;
	}
	var lastsell = _G(tp.Name+"_LastSellPrice") ? _G(tp.Name+"_LastSellPrice") : _G(tp.Name+"_AvgPrice");
	lastsell = lastsell * (1 + profit + tp.Args.BuyFee + tp.Args.SellFee);
	if(tp.Ticker.Buy > lastsell){
		ret = true;
	}
	return ret;
}

/**
 * 检测在反弹上攻行情中是否可以平仓
 * 只有在当前价比24小时最低价下跌超过5%的进候才可以平仓
 * 在反弹上攻行情中不要轻易平仓被甩下车可能错过牛市或小牛行情的赚钱机会。
 * @param {} tp
 */
function checkCanSellInGoodMarket(tp){
	var ret = false;
	var lastrecord = tp.LastRecord;
	var records = tp.Records;
	var limitts = new Date().getTime()- 24*60*60*1000;	//24小时之后的时间戳
	var highprice = 0;
	for(var i=1;i<records.length;i++){
		var record = records[records.length - i];
		if(record.Time < limitts) break;
		var maxprice = Math.max(highprice, record.Close);
		if(maxprice > highprice){
			highprice = maxprice;
		}
	}
	//判断是否符合条件
	Log(highprice, lastrecord.Close, (highprice-lastrecord.Close)/highprice);
	if((highprice-lastrecord.Close)/highprice >= 0.05){
		ret = true;
	}
	return ret;
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
			if(cmds[0] == "NewConjunctureType"){
				var ctypes = [0, 1, 2, 3, 4, 5];
				if(values[0].toUpperCase() == "ALL"){
					for(var i=0;i<TradePairs.length;i++){
						_G(tp.Name+"_ConjunctureType",parseInt(values[1]));
					}
					Log("更新所有交易对行情类型为",CONJUNCTURE_TYPE_NAMES[values[1]]," #FF0000");
				}else{
					if(ctypes.indexOf(values[1]) == -1){
						Log(tp.Name,"输入的当前交易对行情类型",values[1],"非有效值，拒绝操作！！！");
					}else{						
						Log(tp.Name,"更新行情类型为",CONJUNCTURE_TYPE_NAMES[values[1]]);
						_G(tp.Name+"_ConjunctureType",parseInt(values[1]));
					}
				}
			}else if(cmds[0] == "NewBalanceLimit"){
				if(values[1] == 0){
					Log(tp.Name,"输入的买入金额数量限制为0，拒绝操作！！！");
				}else{
					Log(tp.Name,"更新买入金额数量限制为",values[1]);
					_G(tp.Name+"_BalanceLimit",parseFloat(values[1]));
				}
			}else if(cmds[0] == "Debug"){
				if(values[0].toUpperCase() == "ALL"){
					for(var i=0;i<TradePairs.length;i++){
						TradePairs[i].Args.Debug = parseInt(values[1]);
					}
					Log("更新所有交易对调试状态为",values[1]," #FF0000");
				}else{
					if(tp){
						tp.Args.Debug = parseInt(values[1]);
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

/************
 * 操作买入交易
 * @param {} tp
 */
function doBuy(tp){
	var ret = false;
	//计算操作粒度（一次的操作数量）1为卖单，2为买单
	var operatefineness = getOperateFineness(tp, 1);
	var balancelimit = _G(tp.Name+"_BalanceLimit");
	//火币现货Buy()参数是买入个数，不是总金额
	var canpay = balancelimit - tp.TPInfo.CostTotal;
	if(tp.Account.Balance < canpay){
		canpay = tp.Account.Balance;
	}
	var canbuy = canpay/tp.Ticker.Sell;
	var opAmount = canbuy > operatefineness? operatefineness : canbuy;
	opAmount = _N(opAmount, tp.Args.StockDecimalPlace);
	if(opAmount > tp.Args.MinStockAmount){
		Log("准备操作买入，限仓金额",balancelimit,"，还可买金额",canpay,"，可买数量",canbuy,"，本次买入数量",opAmount,"，当前卖1价格",tp.Ticker.Sell); 
		var orderid = tp.Exchange.Buy(tp.Ticker.Sell,opAmount);
		if(orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_BUY);	
			_G(tp.Name+"_LastBuyTS", tp.LastRecord.Time);
			_G(tp.Name+"_LastSignalTS", 0);
			ret = true;
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		//买入操作完成。
		Log("当交易对持仓成本",tp.TPInfo.CostTotal,"，限仓金额",balancelimit,"，账户余额",tp.Account.Balance,"，算出的可买数量只有",opAmount,"，已经无法继续买入，买入操作完成。");
	}
	
	//清空上一次卖出价格
	if(_G(tp.Name+"_LastSellPrice")) _G(tp.Name+"_LastSellPrice",0);
	
	return ret;
}

//做止盈卖出交易
function doTargetProfitSell(tp){
	//计算操作粒度（一次的操作数量）1为卖单，2为买单
	var operatefineness = getOperateFineness(tp, 2);
	var canTargetProfitNum = _G(tp.Name+"_CanTargetProfitNum");
	if(canTargetProfitNum === 0){
		var persell = _G(tp.Name+"_EveryTimesTPSN");
		if(persell === 0){
			persell = tp.Account.Stocks*TARGET_PROFIT_PERCENT;	//一次止盈按设定比例（如50%），但按操作粒度来操作
			_G(tp.Name+"_EveryTimesTPSN", persell);
		}else{
			//最后一次会出现单位止盈数大于实际持仓量的情况，进行调整
			if(persell > tp.Account.Stocks) persell = tp.Account.Stocks;
		}
		Log("现在总持仓",parseFloat(tp.Account.Stocks).toFixed(8),"，每次止盈卖出",parseFloat(persell).toFixed(tp.Args.StockDecimalPlace));
		canTargetProfitNum = persell;
		_G(tp.Name+"_CanTargetProfitNum", canTargetProfitNum);
	}
	var opAmount = canTargetProfitNum > operatefineness? operatefineness : _N(canTargetProfitNum,tp.Args.StockDecimalPlace);
	if(opAmount > tp.Account.Stocks) opAmount = 0; //因为存储的可止盈数可能实际发生了变化，所以加上较正数量上可能出现的问题
	if(opAmount > tp.Args.MinStockAmount){
		Log("准备以当前买1价格止盈卖出，可卖数量为",canTargetProfitNum,"，挂单数量为",opAmount,"，当前买1价格为",tp.Ticker.Buy); 
		var orderid = tp.Exchange.Sell(tp.Ticker.Buy,opAmount);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_SELL_TARGETPROFIT);	
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		Log("当前持仓",tp.Account.Stocks,"，本次可止盈数量为",canTargetProfitNum,"，当前可卖出数量小于最小交易量，本次止盈操作完成。");
	}
}

/***********
按市价立即卖出
死叉出现，快现卖出
********************/
function doInstantSell(tp){
	//不按粒度操作，直接快速卖出
	if(tp.Account.Stocks > tp.Args.MinStockAmount){
		Log("准备以当前市价卖出当前所有的币，数量为",tp.Account.Stocks,"，参考价格为",tp.Ticker.Sell); 
		var orderid = tp.Exchange.Sell(-1,tp.Account.Stocks);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_SELL_INSTANT);	
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		Log("当前持仓",tp.Account.Stocks,"，当前可卖出数量小于最小交易量，本次按市价立即卖出操作完成。");
	}
}

/***
 * 牛市策略，主业务流程 
 * 在牛市的环境下，以持币升值为主，只在死叉的时候止盈卖出一定比例（如50%），
 * 仅在掉出防守线（持仓成本价）的时候止损平仓，以过滤掉过多的卖出信号，长时间持币
 * @param {} tp
 */
function BullMarketTactics(tp) {
	//初始化系统对像
	var debug = tp.Args.Debug;
	if(debug) Log("启动牛市短线策略，现在进行行情数据的读取和分析。");
	//判断是否假死叉带来的反正
	var now = new Date().getTime();
	if(now - LastDeathCrossTime < 15*60*1000){
		Log("遇到了假死叉带来的15分钟内死叉又返正现像，排除。")
		return;
	}
	//根据当前的行情来决定操作
	if(tp.CrossNum > 1){
		//当前处理上升行情
		//判断当前是否可以买入，如果可以就买入，不能买就观察
		if(tp.Account.Balance > tp.Args.MinStockAmount*tp.Ticker.Last && tp.TPInfo.StockValue < _G(tp.Name+"_BalanceLimit")){
			//只要当前价在14日均线之上就可以买入
			if(tp.LastRecord.Close > tp.MAArray[tp.MAArray.length-1]){
				if(debug) Log("当前上行行情，交叉数为",tp.CrossNum,"，当前还有仓位并且也满足开仓条件，准备操作买入操作。");
				doBuy(tp);
			}else{
				if(debug) Log("当前上行行情，交叉数为",tp.CrossNum,"，当前还有仓位，但当前没有达到开仓条件，继续观察行情。");
			}
		}else{
			//重置止盈标识
			_G(tp.Name+"_DoedTargetProfit", 0);
		}
	}else{
		//当前处于下降行情
		//死叉出现，判断是否有持仓：
		//1)如果有，操作卖出，如果已经达到止损线，那就全部出货，否则只开仓卖出30%仓位，底部再开仓买入调整持仓量和成本
		//2)没有，输出信息不作处理。
		if(tp.Account.Stocks > tp.Args.MinStockAmount){
			if(_G(tp.Name+"_CanTargetProfitNum") > 0){
				//正在操作的止盈还没有完成
				if(debug) Log("本次止盈操作还没有完成，还有",_G(tp.Name+"_CanTargetProfitNum"),"个币需要卖出，继续操作止盈。");
				doTargetProfitSell(tp);
			}else if(tp.CrossNum == -2 && _G(tp.Name+"_DoedTargetProfit") === 0){
				if(debug) Log("当前出现死叉，交叉数为",tp.CrossNum,"，当前还未止盈过，准备操作止盈。");
				doTargetProfitSell(tp);
			}else{
				if(debug) Log("当前出现死叉，交叉数为",tp.CrossNum,"，已经止盈过，等候适合机会再补入低价的货。");
			}
		}else{
			if(debug) Log("当前下跌行情中，因为没有持仓，所在静观市场变化，有机会再买入。");
		}
	}
}

/*************
 * 熊市策略，主业务流程 
 * 在熊市的环境下，以波段操作为主，谨慎买入积极止盈，只要有见顶信号或是逃顶信号就卖出一定比例（如50%）止盈，
 * 在死叉出现或掉出防守线时平仓退出，找机会再建仓，更多更积极的短信操作。
 * @param {} tp
 */
function BearMarketTactics(tp) {
	//初始化系统对像
	var debug = tp.Args.Debug;
	if(debug) Log("启动熊市短线策略，现在进行行情数据的读取和分析。");
	
	//根据当前的行情来决定操作
	var Records = tp.Records;
	var Ticker = tp.Ticker;
	var SecondRecord = Records[Records.length-2];
	var avgPrice = tp.TPInfo.AvgPrice;
	var CType = _G(tp.Name+"_ConjunctureType");
	if(tp.CrossNum > 0){
		//金叉区域处理程序
		if(debug) Log("当前是",CONJUNCTURE_TYPE_NAMES[CType],"行情，交叉数为",tp.CrossNum,"，当前K线类型为", tp.LastRecord.Type);
		if(tp.Account.Stocks <= tp.Args.MinStockAmount){
			//判断上一次买入的时间，是否在金叉之内，如果是说明已经止盈完了，如果不是说明还没有买过
			var kingxtime = Records[Records.length-tp.CrossNum].Time;
			if(_G(tp.Name+"_FirstBuyTS") < kingxtime){	//金叉之后还没有建仓
				//当前没有建仓，检测是否可以建仓
				//不要在金叉出现的第一时间进入，因为有可能是闪现的，后面又跑回去负值，如果这样的话一旦负值出现就会急售造成巨亏
				if(checkCanBuyKingArea(tp)){
					if(debug) Log("当前没有建仓，满足建仓条件，准备操作买入操作。");
					if(doBuy(tp)){
						_G(tp.Name+"_LastBuyArea",1);	//设置买入位置标识为金叉
						_G(tp.Name+"_DoedTargetProfit",0);	//重置止盈操作标识
					}
				}else{
					if(debug) Log("当前没有建仓，但当前没有达到建仓条件，继续观察行情。");
					if(_G(tp.Name+"_LastBuyArea")) _G(tp.Name+"_LastBuyArea",0);	
				}
			}else{	//金叉之后买了又卖出了
				if(_G(tp.Name+"_LastBuyArea")) _G(tp.Name+"_LastBuyArea",0);	
				if(debug) Log("已经完成全部仓位的平仓，继续观察行情等待回调买入。");
			}
		}else if(_G(tp.Name+"_LastBuyArea") == 1){	//买在金叉
			if(CType == 2){	//持续下跌行情
				if(checkCanTargetProfit(tp)){ 
					//进行定点止盈，保住胜利果实
					if(debug) Log("价格拉涨超过了定点止盈位，进行止盈操作。");
					doTargetProfitSell(tp);
				}else if(_G(tp.Name+"_CanTargetProfitNum") > 0){
					//正在操作的止盈还没有完成
					if(debug) Log("本次止盈操作还没有完成，还有",_G(tp.Name+"_CanTargetProfitNum"),"个币需要卖出，继续操作止盈。");
					doTargetProfitSell(tp);
				}else if(tp.CrossNum<=3 && identifyShadowLine(tp)){
					//前三个K线出现超过2%的顶部长上影线或是抛压深度，立即卖出
					if(debug) Log("前三个K线出现超过2%的顶部长上影线或是抛压深度，立即卖出。");
					doInstantSell(tp);
					_G(tp.Name+"_DoedTargetProfit",1);
				}else if((SecondRecord.Close/avgPrice) <= 1.01 && (checkBreakDefenseLine(tp) || identifyDarkCloudCover(tp) || identifyYinYangYin(tp))){
					//如果在没有达到1%浮盈之前出现止损信号，那尽快进行止损
					if(debug) Log("在没有达到1%浮盈之前出现止损信号，那尽快进行止损。");
					doInstantSell(tp);
				}else if(((SecondRecord.Close/avgPrice) >= 1.01) && (identifyTopSellOffSignal(tp) || identifyDarkCloudCover(tp) || identifyYinYangYin(tp))){
					//写入信号发现的K线，不在同一个信号点多次操作止盈
					var lastsignalts = _G(tp.Name+"_LastSignalTS");
					if(lastsignalts === 0){
						//如果是第一次发现信号，形态形成的时间应该是上一个K线
						_G(tp.Name+"_LastSignalTS", Records[Records.length-2].Time);
					}else{
						_G(tp.Name+"_LastSignalTS", tp.LastRecord.Time);
					}
					//取得金叉以来拉升的点数
					var firstprice =  Records[Records.length-tp.CrossNum].Open;
					if(tp.CrossNum<5 && Ticker.High/firstprice >1.05){
						if(debug) Log("金叉到现在最高价已经超过5个点，拉得太快，跌得也会快，尽快出手。");
						doInstantSell(tp);
					}else{
						if(debug) Log("出现止盈信号，准备操作止盈卖出。");
						doTargetProfitSell(tp);
					}
					_G(tp.Name+"_DoedTargetProfit",1);
				}else if(tp.TPInfo.CostTotal+tp.Args.MinStockAmount*Ticker.Sell <= _G(tp.Name+"_BalanceLimit") && tp.Account.Balance > tp.Args.MinStockAmount*Ticker.Sell){
					//有持仓，但是还有仓位看是否可以买入
					if(_G(tp.Name+"_DoedTargetProfit") == 0 && checkCanBuyKingArea(tp)){
						if(debug) Log("有持仓，当是还可以买入，那就继续买入。");
						if(doBuy(tp)) _G(tp.Name+"_LastBuyArea",1);
					}else{
						if(debug) Log("有持仓，但暂时不满足继续开仓条件，继续观察行情。");
					}
				}else{
					if(debug) Log("当前已经建仓完成，继续观察行情。");
				}
			}else if(CType == 3){	//底部修正行情
				if(checkCanTargetProfit(tp)){ 
					//进行定点止盈，保住胜利果实
					if(debug) Log("价格拉涨超过了定点止盈位，进行止盈操作。");
					doTargetProfitSell(tp);
				}else if(_G(tp.Name+"_CanTargetProfitNum") > 0){
					//正在操作的止盈还没有完成
					if(debug) Log("本次止盈操作还没有完成，还有",_G(tp.Name+"_CanTargetProfitNum"),"个币需要卖出，继续操作止盈。");
					doTargetProfitSell(tp);
				}else if(tp.CrossNum<=3 && identifyShadowLine(tp)){
					//前三个K线出现超过2%的顶部长上影线或是抛压深度，立即卖出
					if(debug) Log("前三个K线出现超过2%的顶部长上影线或是抛压深度，立即卖出。");
					doInstantSell(tp);
					_G(tp.Name+"_DoedTargetProfit",1);
				}else if((SecondRecord.Close/avgPrice) <= 1.02 && (checkBreakDefenseLine(tp) || identifyDarkCloudCover(tp) || identifyYinYangYin(tp))){
					//如果在没有达到2%浮盈之前出现止损信号，那尽快进行止损
					if(debug) Log("在没有达到2%浮盈之前出现止损信号，那尽快进行止损。");
					doInstantSell(tp);
				}else if(((SecondRecord.Close/avgPrice) >= 1.02) && (identifyTopSellOffSignal(tp) || identifyDarkCloudCover(tp) || identifyYinYangYin(tp))){
					//写入信号发现的K线，不在同一个信号点多次操作止盈
					var lastsignalts = _G(tp.Name+"_LastSignalTS");
					if(lastsignalts === 0){
						//如果是第一次发现信号，形态形成的时间应该是上一个K线
						_G(tp.Name+"_LastSignalTS", Records[Records.length-2].Time);
					}else{
						_G(tp.Name+"_LastSignalTS", tp.LastRecord.Time);
					}
					//取得金叉以来拉升的点数
					var firstprice =  Records[Records.length-tp.CrossNum].Open;
					if(tp.CrossNum<5 && Ticker.High/firstprice >1.06){
						if(debug) Log("金叉到现在最高价已经超过6个点，拉得太快，跌得也会快，尽快出手。");
						doInstantSell(tp);
					}else{
						if(debug) Log("出现止盈信号，准备操作止盈卖出。");
						doTargetProfitSell(tp);
					}
					_G(tp.Name+"_DoedTargetProfit",1);
				}else if(tp.TPInfo.CostTotal+tp.Args.MinStockAmount*Ticker.Sell <= _G(tp.Name+"_BalanceLimit") && tp.Account.Balance > tp.Args.MinStockAmount*Ticker.Sell){
					//有持仓，但是还有仓位看是否可以买入
					if(_G(tp.Name+"_DoedTargetProfit") == 0 && checkCanBuyKingArea(tp)){
						if(debug) Log("有持仓，当是还可以买入，那就继续买入。");
						if(doBuy(tp)) _G(tp.Name+"_LastBuyArea",1);
					}else{
						if(debug) Log("有持仓，但暂时不满足继续开仓条件，继续观察行情。");
					}
				}else{
					if(debug) Log("当前已经建仓完成，继续观察行情。");
				}
			}else if(CType == 4){	//盘桓储力行情
				if((SecondRecord.Close/avgPrice) <= 1.02 && checkBreakDefenseLine(tp)){
					//如果在没有达到2%浮盈之前出现止损信号，那尽快进行止损
					if(debug) Log("在没有达到2%浮盈之前出现止损信号，那尽快进行止损。");
					doInstantSell(tp);
				}else if(tp.TPInfo.CostTotal+tp.Args.MinStockAmount*Ticker.Sell <= _G(tp.Name+"_BalanceLimit") && tp.Account.Balance > tp.Args.MinStockAmount*Ticker.Sell){
					//有持仓，但是还有仓位看是否可以买入
					if(_G(tp.Name+"_DoedTargetProfit") == 0 && checkCanBuyKingArea(tp)){
						if(debug) Log("有持仓，当是还可以买入，那就继续买入。");
						if(doBuy(tp)) _G(tp.Name+"_LastBuyArea",1);
					}else{
						if(debug) Log("有持仓，但暂时不满足继续开仓条件，继续观察行情。");
					}
				}else{
					if(debug) Log("当前已经建仓完成，继续观察行情。");
				}
			}else if(CType == 5){	//反弹上攻行情
				/*反弹上攻行情要不要止盈有待继续论证
				if(checkCanTargetProfit(tp)){ 
					//进行定点止盈，保住胜利果实
					if(debug) Log("价格拉涨超过了定点止盈位，进行止盈操作。");
					doTargetProfitSell(tp);
				}else */if(_G(tp.Name+"_CanTargetProfitNum") > 0){
					//正在操作的止盈还没有完成
					if(debug) Log("本次止盈操作还没有完成，还有",_G(tp.Name+"_CanTargetProfitNum"),"个币需要卖出，继续操作止盈。");
					doTargetProfitSell(tp);
				}else if((SecondRecord.Close/avgPrice) <= 1.05 && checkBreakDefenseLine(tp)){
					//如果在没有达到5%浮盈之前出现止损信号，那尽快进行止损
					if(debug) Log("在没有达到5%浮盈之前出现止损信号，那尽快进行止损。");
					doInstantSell(tp);
				}else if(tp.TPInfo.CostTotal+tp.Args.MinStockAmount*Ticker.Sell <= _G(tp.Name+"_BalanceLimit") && tp.Account.Balance > tp.Args.MinStockAmount*Ticker.Sell){
					//有持仓，但是还有仓位看是否可以买入
					if(_G(tp.Name+"_DoedTargetProfit") == 0){
						if(checkCanBuyKingArea(tp)){
							if(debug) Log("有持仓，当是还可以买入，那就继续买入。");
							if(doBuy(tp)) _G(tp.Name+"_LastBuyArea",1);
						}else{
							if(debug) Log("有持仓，但暂时不满足继续开仓条件，继续观察行情。");
						}
/*反弹上攻行情要不要止盈有待继续论证
						}else{
						//已经止盈过，看价格有没有回落到最后一次止盈价，如果有重置止盈标签可以在回升之后买入
						if(tp.Ticker.Last <= _G(tp.Name+"_LastSellPrice")*0.99){
							_G(tp.Name+"_DoedTargetProfit", 0); 
						}
*/					}
				}else{
					if(debug) Log("当前已经建仓完成，继续观察行情。");
				}
			}
		}else if(_G(tp.Name+"_LastBuyArea") == 2){	//买在死叉
			if(CType == 2){	//在持续下跌行情中，交叉数为2时进行止盈平仓
				if(tp.CrossNum >= 2 && tp.Account.Stocks > tp.Args.MinStockAmount){
					if(debug) Log("当前交叉数为",tp.CrossNum,"，在底部买入之后手上还有",tp.Account.Stocks,"个币，准备操作止盈平仓。");
					doTargetProfitSell(tp);
				}
			}else{
				//把原来买在死叉的标识改为金叉，才可以实现在金叉的管理
				_G(tp.Name+"_LastBuyArea", 1);
			}
			
		}
	}else{
		//死叉区域处理程序
		if(tp.Account.Stocks > tp.Args.MinStockAmount){
			//手中有货
			if(_G(tp.Name+"_LastBuyArea") == 1){	//买在金叉
				if(CType == 5){
					//当在反弹上攻行情时，就算是死叉出现，只要没有下跌超过24小时最高价5%时，不卖出手中的币，不被小震荡甩下车
					if(checkCanSellInGoodMarket(tp)){
						if(debug) Log("死叉后比24小时最高价已经下跌超过5%，手上还有",tp.Account.Stocks,"个币，准备操作平仓出货。");
						doInstantSell(tp);
					}else{
						if(debug) Log("虽然已经死叉但比24小时最高价下跌还没超过5%，暂时不下车，继续观察行情。");
					}
				}else{
					//只有在当前价高于成本价或者是下跌没超过10%的情况下才进行止盈，如果超过了10%不再操作，转为买在死叉并转为出逃行情，以解决恐慌出逃或是软件启动币有较大的价差时把币卖掉的情况
					if((avgPrice-Ticker.Buy)/avgPrice <= 0.1){
						if(debug) Log("当前死叉已经出现，交叉数为",tp.CrossNum,"，手上还有",tp.Account.Stocks,"个币，准备操作平仓出货。");
						doInstantSell(tp);
					}else{
						if(debug) Log("当前死叉已经出现，交叉数为",tp.CrossNum,"，币价发生急跌，跌到了成本线的90%，不能再卖转为恐慌出逃行情，继续观察行情。");
						_G(tp.Name+"_LastBuyArea", 2);
						_G(tp.Name+"_ConjunctureType", 1);
					}
				}
			}else{	//买在死叉
				//抄底买入，要做两个判断卖出
				//1.当前价是否突破了防守线
				//2.买入后每涨1%，如果做一次止盈卖出
				if((CType == 1 || CType == 2)  && checkCanTargetProfit(tp)){
					if(debug) Log("抄底后当前价格回升到上一次卖出/买入后价格的8%以上，操作止盈。");
					doTargetProfitSell(tp);
				}else if(CType == 1 && (tp.Ticker.Buy-lastrecord.Low)/(secondrecord.High-lastrecord.Low) >= 0.9 && tp.Ticker.Buy > avgPrice){
					if(debug) Log("当价格恐慌爆跌后回归理性，回升到当前价格的9成左右且超过成本价，操作平仓。");
					doInstantSell(tp);
				}else if(CType > 1 && Ticker.Buy <= _G(tp.Name+"_StopLinePrice")){
					if(debug) Log("抄底后当前价格跌到止损线",_G(tp.Name+"_StopLinePrice"),"以下，操作止损。");
					doInstantSell(tp);
				}else if(tp.Account.Balance > tp.Args.MinStockAmount*Ticker.Sell && tp.TPInfo.CostTotal < _G(tp.Name+"_BalanceLimit")){
					//有持仓，但是还有仓位看是否可以买入
					if(_G(tp.Name+"_DoedTargetProfit") == 0 && checkCanBuyDeathArea(tp)){
						if(debug) Log("有持仓，当是还可以买入，那就继续买入。");
						if(doBuy(tp)) _G(tp.Name+"_LastBuyArea",2);	
					}else{
						if(debug) Log("有持仓，但暂时不满足继续开仓条件，继续观察行情。");
					}
				}else{
					if(debug) Log("当前已经在底部完成建仓，继续观察行情。");
				}
			}
		}else{
			//手中没货
			if(_G(tp.Name+"_LastBuyArea") == 1){	//买在金叉
				if(debug) Log("当前下跌行情，交叉数为",tp.CrossNum,"，当前已经完成平仓，继续观察行情。");
				//重置止盈次数及买完成标识
				_G(tp.Name+"_DoedTargetProfit", 0);
				_G(tp.Name+"_FirstBuyTS", 0);
				_G(tp.Name+"_LastBuyArea",0);
				_G(tp.Name+"_LastBuyPrice",0);
			}else if(_G(tp.Name+"_LastBuyArea") == 2){	//买在死叉
				//重置买入位置标识
				_G(tp.Name+"_LastBuyArea",0);
				if(debug) Log("当前下跌行情，交叉数为",tp.CrossNum,"，已经把抄底拿到的货平出了，继续观察行情。");
			}else{
				//当前没有建仓，检测是否可以在底部建仓
				if(checkCanBuyDeathArea(tp)){
					if(debug) Log("当前没有建仓，交叉数为",tp.CrossNum,"，满足底部建仓条件，准备操作买入操作。");
					if(doBuy(tp)) _G(tp.Name+"_LastBuyArea",2);				
				}else{
					if(debug) Log("当前没有建仓，交叉数为",tp.CrossNum,"，但当前没有达到底部建仓条件，继续观察行情。");
					if(_G(tp.Name+"_LastBuyArea")) _G(tp.Name+"_LastBuyArea",0);	
				}
			}
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
			rows.push(['ConjunctureType','行情类型', CONJUNCTURE_TYPE_NAMES[tp.Args.ConjunctureType]]);		
			rows.push(['BalanceLimit','买入金额数量限制', tp.Args.BalanceLimit]);		
			rows.push(['NowCoinPrice','当前持仓价格', tp.Args.NowCoinPrice]);		
			rows.push(['BuyFee','平台买入手续费', tp.Args.BuyFee]);		
			rows.push(['SellFee','平台卖出手续费', tp.Args.SellFee]);		
			rows.push(['PriceDecimalPlace','交易对价格小数位', tp.Args.PriceDecimalPlace]);		
			rows.push(['StockDecimalPlace','交易对数量小数位', tp.Args.StockDecimalPlace]);		
			rows.push(['MinStockAmount','限价单最小交易数量', tp.Args.MinStockAmount]);		
			rows.push(['Debug','调试状态', tp.Args.Debug]);		
			rows.push(['AddTime','添加时间', _G(tp.Name+"_AddTime")]);		
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
		accounttable1.cols = ['交易对','买入次数','卖出次数','总次数','止盈次数','当前仓位','限仓金额','累计收益','行情类型','交易状态','最后更新'];
		var rows = [];
		for(var r=0;r<TradePairs.length;r++){
			var tp = TradePairs[r];
			var i = tp.TPInfo;
			rows.push([tp.Title, _G(tp.Name+"_BuyTimes"), _G(tp.Name+"_SellTimes"), (_G(tp.Name+"_BuyTimes")+_G(tp.Name+"_SellTimes")), _G(tp.Name+"_TargetProfitTimes"), parseFloat(i.CostTotal*100/_G(tp.Name+"_BalanceLimit")).toFixed(2)+'%', 
				_G(tp.Name+"_BalanceLimit"), parseFloat(_G(tp.Name+"_SubProfit").toFixed(8)), CONJUNCTURE_TYPE_NAMES[_G(tp.Name+"_ConjunctureType")], getOperatingStatus(_G(tp.Name+"_OperatingStatus")), tp.LastUpdate]);
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
				accounttable1.rows[r] =[nowtp.Title, _G(nowtp.Name+"_BuyTimes"), _G(nowtp.Name+"_SellTimes"), (_G(nowtp.Name+"_BuyTimes")+_G(nowtp.Name+"_SellTimes")), _G(nowtp.Name+"_TargetProfitTimes"), parseFloat((nowtp.TPInfo.CostTotal*100/_G(nowtp.Name+"_BalanceLimit")).toFixed(2))+'%', 
					_G(nowtp.Name+"_BalanceLimit"), parseFloat(_G(nowtp.Name+"_SubProfit").toFixed(8)), CONJUNCTURE_TYPE_NAMES[_G(nowtp.Name+"_ConjunctureType")], getOperatingStatus(_G(nowtp.Name+"_OperatingStatus")), nowtp.LastUpdate];
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
			
			//获取交易对相关信息
			tp.Records =  _C(tp.Exchange.GetRecords);
			tp.Ticker =  _C(tp.Exchange.GetTicker);
			tp.LastRecord = tp.Records[tp.Records.length-1];
			tp.Account = _C(tp.Exchange.GetAccount);
			tp.MAArray = TA.MA(tp.Records,14);
			tp.EMAArray1 = TA.EMA(tp.Records,7);
			tp.EMAArray2 = TA.EMA(tp.Records,21);
			tp.CrossNum = getEmaCrossNum(tp.EMAArray1, tp.EMAArray2);   
			//设置上次死叉的时间
			if(LastCrossNum > 0 && tp.CrossNum < 0 && LastDeathCrossTime != tp.LastRecord.Time) LastDeathCrossTime = tp.LastRecord.Time;
			LastCrossNum = tp.CrossNum;
			//识别当前K线类型并添加结果到K线数组当中
			addTickerType(tp.Records);

			//根据市场环境调整行情参数
			if(MarketEnvironment){
				if(_G(tp.Name+"_ConjunctureType") > 0){
					Log("传入市场环境参数为牛市，更改行情类型为牛市行情...");
					_G(tp.Name+"_ConjunctureType", 0);
				}
			}else{
				if(_G(tp.Name+"_ConjunctureType") == 0){
					Log("传入市场环境参数为熊市，更改行情类型为熊市的持续下跌行情...");
					_G(tp.Name+"_ConjunctureType", 2);
				}
			}
			//识别当前行情波段，以对买卖做判断依据
			var Market = identifyTheMarket(tp);
			if(_G(tp.Name+"_ConjunctureType") != Market) _G(tp.Name+"_ConjunctureType", Market);
			
			//检测上一个订单，成功就改状态，不成功就取消重新发
			if(_G(tp.Name+"_LastOrderId") && _G(tp.Name+"_OperatingStatus") != OPERATE_STATUS_NONE){
				if(_G(tp.Name+"_OperatingStatus") > OPERATE_STATUS_BUY){
					checkSellFinish(tp);
				}else{
					checkBuyFinish(tp);
				}
				//刚才上一次订单ID清空，不再重复判断
				_G(tp.Name+"_LastOrderId",0);
				//重置操作状态
				_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_NONE);
			}
			
			//获取成本信息
			var avgPrice = _G(tp.Name+"_AvgPrice");
			var costTotal = parseFloat((avgPrice*(tp.Account.Stocks+tp.Account.FrozenStocks)).toFixed(tp.Args.PriceDecimalPlace));	//从帐户中获取当前持仓信息和平均价格算出来
			var stockValue = parseFloat(((tp.Account.Stocks+tp.Account.FrozenStocks)*tp.Ticker.Last).toFixed(tp.Args.PriceDecimalPlace));
			if(tp.Args.Debug) Log("交易对情况：余额", parseFloat(tp.Account.Balance+tp.Account.FrozenBalance).toFixed(8), "，持币数", parseFloat(tp.Account.Stocks+tp.Account.FrozenStocks).toFixed(8), "，持仓均价", parseFloat(avgPrice).toFixed(tp.Args.PriceDecimalPlace) , "，持仓成本", costTotal, "，当前币价", tp.Ticker.Last , "，持仓价值", stockValue);

			//收集当前交易对信息
			var tpInfo = {
				Balance:tp.Account.Balance,	//余额
				FrozenBalance:tp.Account.FrozenBalance,	//冻结余额
				Stocks:tp.Account.Stocks,	//可用币数
				FrozenStocks:tp.Account.FrozenStocks,	//冻结币数
				AvgPrice:avgPrice,	//持仓均价
				CostTotal:costTotal,	//持仓成本
				TickerLast:tp.Ticker.Last,	//当前币价
				StockValue:stockValue	//持币价值
			};
			tp.TPInfo = tpInfo; 
			
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
			if(operatingstatus != OPERATE_STATUS_BUY){
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
