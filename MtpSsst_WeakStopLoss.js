/**************************************
多交易对现货短线程序化操作策略V3.0
短线交易的原则:
短线交易的核心思想是要通过复利使得资本金不断增加，那必须要能过一定的投资回报率的基本上加大资本周转次数来实现更多的收益。
复利的计算公式是这样的：F=P*(1+i)^n，终值=现值（1+回报率）^周转次数
所以在做策略的过程当中，胜率和周转次数非常重要，而每次获胜之后的回报率就没有胜率那么重要了，但如果要提高胜率，往往周转次数和回报率都会下降。
说明：
1.因为多个交易对收益合并到一个曲线，所以同一个机器人使用的基础货币要是一样的。
2.循环扫描指定交易对，做如下判断(使用5分钟K线)
2.1交易对已经持仓，判断出货时机：
->判断当前价格，是否达到止盈点或止损点，如果达到其中一个就把上一次买入的量卖出。(建议止盈点为1.6%，止损点为0.4%)
-->是否在金叉买入的货，如果是且当前已经死叉，也卖出上一次买入的量，但要排除当前死叉数小于-2，而买入点就在10分钟内的假金叉的情况
2.2没有持仓，判断买入时机：
->当前是否交叉数是为1，如果是操作买入指定金额数量的币


支持多个交易对，参数通过JSON传递过来
ArgsJson	策略参数JSON内容	JSON内容为以下多个交易对的数组JSON	字符串型(string)

单个交易对的策略参数如下
参数	描述	类型	默认值
ExchangeName	交易所名称	字符串型(string)
TradePairName	交易对名称	字符串型(string)	
BalanceLimit	买入金额数量限制	数字型(number)	300
TargetProfit	止盈点	数字型(number)	0.016
BuyFee	平台买入手续费		数字型(number)	0.002
SellFee	平台卖出手续费		数字型(number)	0.002
PriceDecimalPlace	交易对价格小数位		数字型(number)	2 
StockDecimalPlace	交易对数量小数位		数字型(number)	4 
MinStockAmount	最小交易数量		数字型(number)	1
MinBalanceAmount	最小交易金额		数字型(number)	1
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
var OPERATE_STATUS_SELL_INSTANT = 2;

//定义K线数据结构
function KLineData(){	//K线数据结构对像
	this.LastRecord = {};	//最后一条K线情况
	this.MAArray = [];	//14均线
	this.EMAArray1 = [];	//7均线
	this.EMAArray2 = [];	//21均线
	this.CrossNum = 0; 	//当前k线7与21均线交叉数
}
//定义大K线数据组构
function BigLineData(){
    this.CrossNum = 0; 	//当前k线7与21均线交叉数
    this.LineUnit = 86400000;    //24*60*60*1000
    this.LastUpdate = 0;    //最后更新时间戳
    this.LineType = PERIOD_D1;    //K线类型
}
//全局变量定义
function TradePair(){
	this.Name = "";	//交易对名称,用于定量加前缀，格式如Huobi_LTC_BTC
	this.Title = "";	//交易对标题，用于表格显示，格式如Huobi/LTC_BTC
	this.Exchange = {};	//交易所对像exchange
	this.Args = {};	//本交易对参数
	this.LastBuyPrice = 0;	//上一次买入价格
	this.LastBuyTS = 0;		//上一次买入的时间
	this.BuyInNum = 0;		//当前持仓
	this.LastUpdate = {};	//最后更新时间
	this.BigLine = {};    //大线数据
}
var TradePairs = [];	//所有交易对数组
var NowTradePairIndex = 0;		//当前的交易所对索引
var TotalProfit = 0;	//策略累计收益
var StartTime = _D();	//策略启动时间
var TickTimes = 0;		//刷新次数
var ArgTables;		//已经处理好的用于显示的参数表，当参数更新时置空重新生成，以加快刷新速度
var AccountTables;	//当前的账户信息表，如果当前已经有表，只要更新当前交易对，这样可以加快刷新速度，减少内存使用
var Ticker =  {};	//当前实时行情
var Account = {};	//当前账户情况
var KLine_M5 = {};	//5分钟K线数据

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

//获取当前时间戳
function getTimestamp(){
	return new Date().getTime();
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
	if(a.BuyFee === 0 || a.SellFee === 0){
		Log(tp.Name,"交易对参数：平台买卖手续费为0，必须填写此字段。 #FF0000");
		ret = false;
	}
	if(a.BuyFee > 1 || a.SellFee > 1){
		Log(tp.Name,"交易对参数：平台买卖手续费格式错误，填写小数格式如千二填0.002。 #FF0000");
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
	if(a.MinBalanceAmount === 0){
		Log(tp.Name,"交易对参数：限价单最小交易金额为0，必须填写此字段。 #FF0000");
		ret = false;
	}
	Log(tp.Title,"交易对接收参数如下：买入金额数量限制", a.BalanceLimit, "，平台买卖手续费（", a.BuyFee,",", a.SellFee,"），交易对价格/数量小数位（", a.PriceDecimalPlace,",", a.StockDecimalPlace,"），最小交易单位(数量/金额):", a.MinStockAmount,",", a.MinBalanceAmount,"，调试开关", a.Debug);
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
					TargetProfit:args[i].TargetProfit,
					BuyFee:args[i].BuyFee,
					SellFee:args[i].SellFee,
					PriceDecimalPlace:args[i].PriceDecimalPlace,
					StockDecimalPlace:args[i].StockDecimalPlace,
					MinStockAmount:args[i].MinStockAmount,
					MinBalanceAmount:args[i].MinBalanceAmount,
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
					//初始大线数据
					tp.BigLine = new BigLineData();
					TradePairs.push(tp);
					//初始化其他参数
					_G(tp.Name+"_BalanceLimit",Args.BalanceLimit);	//本交易对限仓金额
					if(!_G(tp.Name+"_BuyTimes")) _G(tp.Name+"_BuyTimes",0);		//买入次数
					if(!_G(tp.Name+"_SellTimes")) _G(tp.Name+"_SellTimes",0);	//卖出次数
					if(!_G(tp.Name+"_SubProfit")) _G(tp.Name+"_SubProfit",0);	//累计盈利
					if(!_G(tp.Name+"_TargetProfitTimes")) _G(tp.Name+"_TargetProfitTimes",0);	//止盈次数
					if(!_G(tp.Name+"_ProfitTimes")) _G(tp.Name+"_ProfitTimes",0);	//盈利次数
					if(!_G(tp.Name+"_LastBuyTS")) _G(tp.Name+"_LastBuyTS",0);	//上一次买入时间戳
					if(!_G(tp.Name+"_LastBuyPrice")) _G(tp.Name+"_LastBuyPrice",0);		//上一次买入价
					if(!_G(tp.Name+"_BuyInNum")) _G(tp.Name+"_BuyInNum",0);		//上一次买入数量
					if(!_G(tp.Name+"_LastSellTS")) _G(tp.Name+"_LastSellTS",0);	//上一次卖出时间戳
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
	SetErrorFilter("500:|429:|403:|502:|503:|Forbidden|tcp|character|unexpected|network|timeout|WSARecv|Connect|GetAddr|no such|reset|http|received|EOF|reused");

	Log("启动多交易对现货短线程序化操作策略程序...");  

	//初始化存储变量
	if(!_G("TotalProfit")) _G("TotalProfit",0);

	//解析JSON参数
	parseArgsJson(ArgsJson);
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

//处理卖出成功之后数据的调整
function changeDataForSell(tp,order){
	//算出扣除平台手续费后实际的数量
	var buyPrice = _G(tp.Name+"_LastBuyPrice");
	var TotalProfit = _G("TotalProfit");
	var SubProfit = _G(tp.Name+"_SubProfit");
	var profit = parseFloat((order.AvgPrice*order.DealAmount*(1-tp.Args.SellFee) - buyPrice*order.DealAmount*(1+tp.Args.BuyFee)).toFixed(tp.Args.PriceDecimalPlace));
	SubProfit += profit;
	TotalProfit += profit;
	tp.Profit = SubProfit;
	_G(tp.Name+"_SubProfit", SubProfit);
	_G("TotalProfit", TotalProfit);
	LogProfit(TotalProfit);
	
	if(order.DealAmount === order.Amount ){
		Log(tp.Title,"交易对订单",_G(tp.Name+"_LastOrderId"),"交易成功!卖出均价：",order.AvgPrice,"，买入价格：",buyPrice,"，卖出数量：",order.DealAmount,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}else{
		Log(tp.Title,"交易对订单",_G(tp.Name+"_LastOrderId"),"部分成交!卖出数量：",order.DealAmount,"，剩余数量：",order.Amount - order.DealAmount,"，卖出均价：",order.AvgPrice,"，买入价格：",buyPrice,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}
	
	//更新交易次数
	var tradeTimes = _G(tp.Name+"_SellTimes");
	tradeTimes++;
	_G(tp.Name+"_SellTimes",tradeTimes);
	
	//如果是止盈卖出的话,还要更新止盈次数和数量,如果只是部分成交不算
	if(_G(tp.Name+"_OperatingStatus") == OPERATE_STATUS_SELL_TARGETPROFIT){
			var times = _G(tp.Name+"_TargetProfitTimes")+1;
			_G(tp.Name+"_TargetProfitTimes", times);
			Log(tp.Title,"交易对完成一次止盈操作。");
	}
	
	//盈利次数更新
	if(order.AvgPrice >= buyPrice){
		var times = _G(tp.Name+"_ProfitTimes")+1;
		_G(tp.Name+"_ProfitTimes", times);
		Log(tp.Title,"交易对实现一次盈利的交易。");
	}
	
	//减去持仓量
	var newnum = tp.BuyInNum-order.DealAmount;
	if(newnum<0) newnum=0;
	_G(tp.Name+"_BuyInNum",newnum);
	tp.BuyInNum = newnum;
	
}

//检测卖出订单是否成功
function checkSellFinish(tp){
    var ret = false;
	var lastOrderId = _G(tp.Name+"_LastOrderId");
	var order = tp.Exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED || order.Status === ORDER_STATE_CANCELED ){
		//处理买入成功/取消后的数据调整
		changeDataForSell(tp,order);
		ret = true;
	}else if(order.Status === ORDER_STATE_PENDING){
		if((getTimestamp() - _G(tp.Name+"_LastSellTS")) > 5*60*1000){
			//撤消超时没有完成的订单
			Log(tp.Title,"交易对取消卖出订单：",lastOrderId);
			tp.Exchange.CancelOrder(lastOrderId);
			Sleep(1300);
			ret = true;
		}
	}else{
		//交易所可能了现问题，出现其他错误状态如（ORDER_STATE_CANCELED : 已取消 、 ORDER_STATE_UNKNOWN : 未知状态），取消之前的订单
		Log(tp.Title,"交易对取消未完成的买入订单：",lastOrderId);
		tp.Exchange.CancelOrder(lastOrderId);
		Sleep(1300);
		ret = true;
	}
    return ret;
}

//处理买入成功之后数据的调整
function changeDataForBuy(tp,order){
	if(order.Status === ORDER_STATE_CLOSED ){
		Log(tp.Title,"交易对买入订单",_G(tp.Name+"_LastOrderId"),"交易成功!成交均价：",order.AvgPrice,"，数量：",order.DealAmount);			
	}else{
		Log(tp.Title,"交易对买入订单",_G(tp.Name+"_LastOrderId"),"部分成交!成交均价：",order.AvgPrice,"，数量：",order.DealAmount);
	}
	
	//设置最后买入价
	_G(tp.Name+"_LastBuyPrice",order.AvgPrice);
	tp.LastBuyPrice = order.AvgPrice;
	
	//设置最后一次买到的数量
	_G(tp.Name+"_BuyInNum",order.DealAmount);
	tp.BuyInNum = order.DealAmount;
	
	//更新交易次数
	var tradeTimes = _G(tp.Name+"_BuyTimes");
	tradeTimes++;
	_G(tp.Name+"_BuyTimes",tradeTimes);
}

//检测买入订单是否成功
function checkBuyFinish(tp){
	var ret = false;
	var lastOrderId = _G(tp.Name+"_LastOrderId");
	var order = tp.Exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED || order.Status === ORDER_STATE_CANCELED ){
		//处理买入成功/取消后的数据调整
		changeDataForBuy(tp,order);
		ret = true;
	}else if(order.Status === ORDER_STATE_PENDING ){
		if((getTimestamp() - tp.LastBuyTS) > 5*60*1000){
			//撤消超时没有完成的订单
			Log(tp.Title,"交易对买入市价订单：",lastOrderId,"超时五分钟还未完成，可能平台有问题取消未完成的订单。");
			tp.Exchange.CancelOrder(lastOrderId);
			Sleep(1300);
			ret = true;
		}
	}else{
		//交易所可能了现问题，出现其他错误状态如（ORDER_STATE_CANCELED : 已取消 、 ORDER_STATE_UNKNOWN : 未知状态），取消之前的订单
		Log(tp.Title,"交易对取消未完成的买入订单：",lastOrderId);
		tp.Exchange.CancelOrder(lastOrderId);
		Sleep(1300);
		ret = true;
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


/**
 * 操作买入交易
 * @param {} tp
 * @return {}
 */
function doBuy(tp){
	var ret = false;
	var canpay = tp.Args.BalanceLimit;
	if(Account.Balance < canpay){
		canpay = Account.Balance;
	}
	var orderid = 0;
	Log("准备操作市价买入，限仓金额",tp.Args.BalanceLimit,"，本次下单金额",canpay,"，预期成交价格",Ticker.Sell); 
	//设置小数位，第一个为价格小数位，第二个为数量小数位，但市价买入数量为金额
	tp.Exchange.SetPrecision(tp.Args.PriceDecimalPlace, tp.Args.PriceDecimalPlace);
	orderid = tp.Exchange.Buy(-1,canpay);
	if(orderid) {
		//提交成功，保存当前的必要状态
		_G(tp.Name+"_LastOrderId",orderid);
		_G(tp.Name+"_OperatingStatus", OPERATE_STATUS_BUY);	
		_G(tp.Name+"_LastBuyTS", getTimestamp());
		ret = true;
		Log("订单发送成功，订单编号：",orderid);
	}else{
		Log("订单发送失败，稍后再度尝试。");
	}
	return ret;
}



/***********
按市价立即卖出
********************/
function doInstantSell(tp, selltype){
	if(Account.Stocks >= tp.Args.MinStockAmount){
		var sellnum = tp.BuyInNum<Account.Stocks?tp.BuyInNum:Account.Stocks;
		Log("准备以当前市价卖出币，数量为",sellnum,"，参考价格为",Ticker.Sell); 
		//设置小数位，第一个为价格小数位，第二个为数量小数位
		tp.Exchange.SetPrecision(tp.Args.PriceDecimalPlace, tp.Args.StockDecimalPlace);
		var orderid = tp.Exchange.Sell(-1,sellnum);
		if (orderid) {
			_G(tp.Name+"_LastOrderId",orderid);
			_G(tp.Name+"_OperatingStatus", selltype);	
			_G(tp.Name+"_LastSellTS", getTimestamp());
			Log("订单发送成功，订单编号：",orderid);
		}else{
			Log("订单发送失败，稍后再度尝试。");
		}
	}else{
		//当前交易对持仓已经被清仓，取消操作，重置参数
		Log("当前交易对持仓已经被清仓，不再需要操作卖出。");
		_G(tp.Name+"_BuyInNum", Account.Stocks);
		tp.BuyInNum = Account.Stocks;
	}
}

/*************
 * 主业务流程 
 * 在熊市的环境下，以波段操作为主，谨慎买入积极止盈，只要有见顶信号或是逃顶信号就卖出一定比例（如50%）止盈，
 * 在死叉出现或掉出防守线时平仓退出，找机会再建仓，更多更积极的短信操作。
 * @param {} tp
 */
function onTick(tp) {
	//初始化系统对像
	var debug = tp.Args.Debug;
	if(debug) Log("进入业务主处理流程。");
	
	//根据当前的行情来决定操作
	var CrossNum = KLine_M5.CrossNum;
	var LastRecord = KLine_M5.LastRecord;
	if(tp.BuyInNum > tp.Args.MinStockAmount){
		if(debug) Log("当前有持仓，判断是否符合出货条件。");
		if((Ticker.Last/tp.LastBuyPrice) >= (1+tp.Args.TargetProfit)){
			Log("当前币价达到止盈点，操作止盈出货。");
			doInstantSell(tp, OPERATE_STATUS_SELL_TARGETPROFIT);
		}else if(tp.BigLine.CrossNum < -1 && Ticker.Last/tp.LastBuyPrice < 0.90){
			//大线进入死叉要操作止损
			Log("当前交易对大线出现死叉且损失超过10%，操作出货止损。",CrossNum);
			doInstantSell(tp, OPERATE_STATUS_SELL_INSTANT);
		}
	}else{
		if(debug) Log("当前没有持仓，判断是否符合买入条件。");
		if(tp.BigLine.CrossNum >= 0 && CrossNum > 0 && CrossNum <= 2 && Account.Balance >= tp.Args.MinBalanceAmount){
			Log("符合买入条件，操作买入。");
			doBuy(tp);
		}
	}
    //更新大线数据
    if(getTimestamp() > tp.BigLine.LastUpdate+tp.BigLine.LineUnit){
        //到了更新大线数据的时间
        var kline_big = getKLineData(tp, tp.BigLine.LineType);
        tp.BigLine.LastUpdate = getTimestamp();
        tp.BigLine.CrossNum = kline_big.CrossNum;
    }
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
			rows.push(['BalanceLimit','买入金额数量限制', tp.Args.BalanceLimit]);		
			rows.push(['TargetProfit','止盈点', tp.Args.TargetProfit]);		
			rows.push(['BuyFee','平台买入手续费', tp.Args.BuyFee]);		
			rows.push(['SellFee','平台卖出手续费', tp.Args.SellFee]);		
			rows.push(['PriceDecimalPlace','交易对价格小数位', tp.Args.PriceDecimalPlace]);		
			rows.push(['StockDecimalPlace','交易对数量小数位', tp.Args.StockDecimalPlace]);		
			rows.push(['MinStockAmount','最小交易数量', tp.Args.MinStockAmount]);		
			rows.push(['MinBalanceAmount','最小交易金额', tp.Args.MinBalanceAmount]);		
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
		accounttable1.cols = ['交易对','买入次数','卖出次数','止盈次数','盈利次数','胜率','累计收益',
								'持仓','买入价','当前价','浮盈','最后更新'];
		var rows = [];
		for(var r=0;r<TradePairs.length;r++){
			var tp = TradePairs[r];
			var i = {
				BuyTimes:_G(tp.Name+"_BuyTimes"),	
				SellTimes:_G(tp.Name+"_SellTimes"),	
				TargetProfitTimes:_G(tp.Name+"_TargetProfitTimes"),	
				ProfitTimes:_G(tp.Name+"_ProfitTimes"),	
				SubProfit:_G(tp.Name+"_SubProfit")
			};
			rows.push([tp.Title, i.BuyTimes, i.SellTimes, i.TargetProfitTimes, i.ProfitTimes, parseFloat((i.ProfitTimes*100/i.SellTimes).toFixed(2))+'%', parseFloat(i.SubProfit).toFixed(8),
				tp.BuyInNum, tp.LastBuyPrice, Ticker.Last, parseFloat(((Ticker.Last-tp.LastBuyPrice)*100/tp.LastBuyPrice).toFixed(2))+'%', tp.LastUpdate]);
		}
		accounttable1.rows = rows;
		accounttables.push(accounttable1);
		AccountTables = accounttables;
	}else{
		var accounttable1 = AccountTables[0];
		for(var r=0;r<accounttable1.rows.length;r++){
			if(nowtp.Title == accounttable1.rows[r][0]){
				var i = {
					BuyTimes:_G(nowtp.Name+"_BuyTimes"),	
					SellTimes:_G(nowtp.Name+"_SellTimes"),	
					TargetProfitTimes:_G(nowtp.Name+"_TargetProfitTimes"),	
					ProfitTimes:_G(nowtp.Name+"_ProfitTimes"),	
					SubProfit:_G(nowtp.Name+"_SubProfit")
				};
				accounttable1.rows[r] =[nowtp.Title, i.BuyTimes, i.SellTimes, i.TargetProfitTimes, i.ProfitTimes, parseFloat((i.ProfitTimes*100/i.SellTimes).toFixed(2))+'%', parseFloat(i.SubProfit).toFixed(8),
					nowtp.BuyInNum, nowtp.LastBuyPrice, Ticker.Last, nowtp.BuyInNum===0?'0%':parseFloat(((Ticker.Last-nowtp.LastBuyPrice)*100/nowtp.LastBuyPrice).toFixed(2))+'%', nowtp.LastUpdate];
				break;
			}	
		}
	}
	LogStatus("`" + JSON.stringify(ArgTables)+"`\n`" + JSON.stringify(AccountTables)+"`\n当前账户余额："+Account.Balance+" \n 策略累计收益："+ _G("TotalProfit")+ "\n 策略启动时间："+ StartTime + " 累计刷新次数："+ TickTimes + " 最后刷新时间："+ _D());	
}

/**
 * 获取市行情
 * @param {} tp
 * @param {} type	PERIOD_M15 15分钟K线，PERIOD_H1 1小时K线
 */
function getKLineData(tp, type){
	var kline = new KLineData();
	var records =  _C(tp.Exchange.GetRecords, type);
	kline.LastRecord = records[records.length-1];
	kline.EMAArray1 = TA.EMA(records,7);
	kline.EMAArray2 = TA.EMA(records,30);
	kline.CrossNum = getEmaCrossNum(kline.EMAArray1, kline.EMAArray2);   
	return kline;
}


function main() {
	Log("开始执行主事务程序...");  
	while (true) {
		if(TradePairs.length){
			//策略交互处理函数
			commandProc();
			//获取当前交易对
			var tp = TradePairs[NowTradePairIndex];
			if(tp.Args.Debug) Log("开始操作",tp.Title,"交易对，现在进行行情数据的读取和分析...");
			
			//获取交易对相关信息
			Account = _C(tp.Exchange.GetAccount);
			Ticker =  _C(tp.Exchange.GetTicker);
			KLine_M5 = getKLineData(tp, PERIOD_M5);			    

			//置入一些常用的数据，以提高读取效率
			tp.LastBuyPrice = _G(tp.Name+"_LastBuyPrice");
			tp.LastBuyTS = _G(tp.Name+"_LastBuyTS");
			tp.BuyInNum = _G(tp.Name+"_BuyInNum");			
			if(tp.Args.Debug) Log("当前持仓",tp.BuyInNum,"，交易对总持仓",Account.Stocks,"，交叉数为",KLine_M5.CrossNum);
	
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

			//操作交易策略
			onTick(tp);
			
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
			//强制回收内存，加快运转速度
			Account = null;
			Ticker = null;
			KLine_M5 = null;
			//休息
            Sleep(interval * 1000);
		}else{
			Log("匹配的交易对为空，请提供正常的交易对参数JSON内容。");
			break;
		}
	}
}
