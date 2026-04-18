// Vercel Serverless Function - 股票API代理
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchGBK(url) {
  const res = await fetchWithTimeout(url, {
    headers: { 'Referer': 'https://finance.sina.com.cn', 'User-Agent': USER_AGENT }
  });
  const buffer = await res.arrayBuffer();
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch (e) {
    return new TextDecoder('gb2312').decode(buffer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.url.replace(/^\/api\/stock/, '').replace(/\?.*$/, '');
  const { codes, code, days } = req.query;

  try {
    // 大盘指数 - 使用东方财富
    if (path === '/api/index') {
      const response = await fetchWithTimeout('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f4,f3&secids=1.000001,0.399001,1.000300,0.399006', {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await response.json();
      const data = (json.data?.diff || []).map(item => ({
        name: item.f14,
        value: item.f2,
        change: item.f4,
        changePercent: item.f3
      }));
      return res.json({ success: true, data });
    }

    // 实时行情 - 使用东方财富
    if (path === '/api/realtime' && codes) {
      const codeList = codes.split(',').map(c => c.trim());
      const secids = codeList.map(c => {
        const market = c.startsWith('6') ? '1' : '0';
        return `${market}.${c}`;
      }).join(',');
      
      const response = await fetchWithTimeout(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f17,f15,f16,f5,f6,f3&secids=${secids}`, {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await response.json();
      const data = (json.data?.diff || []).map(item => ({
        code: item.f12,
        name: item.f14,
        price: item.f2,
        open: item.f17,
        high: item.f15,
        low: item.f16,
        volume: item.f5,
        amount: item.f6,
        changePercent: item.f3
      }));
      return res.json({ success: true, data });
    }

    // 涨停板
    if (path === '/api/eastmoney/ztrank') {
      const response = await fetchWithTimeout('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14,f2,f3,f15', {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await response.json();
      const result = (json.data?.diff || []).map(item => ({
        code: item.f12,
        name: item.f14,
        price: item.f15 / 100,
        changePercent: item.f3 / 100
      })).filter(s => s.changePercent >= 9.5);
      return res.json({ success: true, data: result });
    }

    // K线
    if (path === '/api/eastmoney/kline' && code) {
      const market = code.startsWith('6') ? 1 : 0;
      const response = await fetchWithTimeout(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${days || 60}`, {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await response.json();
      const result = (json.data?.klines || []).map(line => {
        const [d, o, c, h, l, v, a] = line.split(',');
        return { date: d, open: parseFloat(o), close: parseFloat(c), high: parseFloat(h), low: parseFloat(l), volume: parseInt(v), amount: parseFloat(a) };
      });
      return res.json({ success: true, data: result });
    }

    return res.json({ success: false, error: '未知操作', path });
  } catch (e) {
    console.error('API Error:', e.message, path);
    return res.status(500).json({ success: false, error: e.message, path });
  }
}
