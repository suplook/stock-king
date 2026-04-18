'use strict';

exports.handler = async (req, res, runtime) => {
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return r;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  // 阿里云函数计算格式
  const method = req.method || 'GET';
  const path = req.path || req.url;
  const params = { ...req.queryStringParameters, ...req.params };

  // CORS
  const callbackName = params.callback;
  const isJSONP = !!callbackName;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (method === 'OPTIONS') {
    return res.status(200).send('');
  }

  try {
    // 大盘指数
    if (path === '/api/index' || path === '/index') {
      const r = await fetchWithTimeout('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f4,f3&secids=1.000001,0.399001,1.000300,0.399006', {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await r.json();
      const data = (json.data?.diff || []).map(i => ({ name: i.f14, value: i.f2, change: i.f4, changePercent: i.f3 }));
      const body = JSON.stringify({ success: true, data });
      if (isJSONP) return res.send(`${callbackName}(${body})`);
      return res.status(200).json({ success: true, data });
    }

    // 实时行情
    if ((path === '/api/realtime' || path === '/realtime') && params.codes) {
      const secids = params.codes.split(',').map(c => {
        c = c.trim();
        return `${c.startsWith('6') ? '1' : '0'}.${c}`;
      }).join(',');
      const r = await fetchWithTimeout(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f17,f15,f16,f5,f6,f3&secids=${secids}`, {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await r.json();
      const data = (json.data?.diff || []).map(i => ({
        code: i.f12, name: i.f14, price: i.f2, open: i.f17, high: i.f15, low: i.f16,
        volume: i.f5, amount: i.f6, changePercent: i.f3
      }));
      const body = JSON.stringify({ success: true, data });
      if (isJSONP) return res.send(`${callbackName}(${body})`);
      return res.status(200).json({ success: true, data });
    }

    // 涨停板
    if (path === '/api/eastmoney/ztrank' || path === '/eastmoney/ztrank') {
      const r = await fetchWithTimeout('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14,f2,f3,f15', {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await r.json();
      const data = (json.data?.diff || []).map(i => ({
        code: i.f12, name: i.f14, price: i.f15 / 100, changePercent: i.f3 / 100
      })).filter(s => s.changePercent >= 9.5);
      const body = JSON.stringify({ success: true, data });
      if (isJSONP) return res.send(`${callbackName}(${body})`);
      return res.status(200).json({ success: true, data });
    }

    // K线
    if ((path === '/api/eastmoney/kline' || path === '/eastmoney/kline') && params.code) {
      const market = params.code.startsWith('6') ? 1 : 0;
      const r = await fetchWithTimeout(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${params.code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${params.days || 60}`, {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await r.json();
      const data = (json.data?.klines || []).map(l => {
        const [d, o, c, h, l2, v, a] = l.split(',');
        return { date: d, open: parseFloat(o), close: parseFloat(c), high: parseFloat(h), low: parseFloat(l2), volume: parseInt(v), amount: parseFloat(a) };
      });
      const body = JSON.stringify({ success: true, data });
      if (isJSONP) return res.send(`${callbackName}(${body})`);
      return res.status(200).json({ success: true, data });
    }

    // 健康检查 / 默认
    return res.status(200).json({ success: true, msg: 'StocKing API OK', path });
  } catch (e) {
    console.error('Error:', e.message);
    const body = JSON.stringify({ success: false, error: e.message });
    if (isJSONP) return res.status(500).send(`${callbackName}(${body})`);
    return res.status(500).json({ success: false, error: e.message });
  }
};
