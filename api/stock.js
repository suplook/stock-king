// Vercel Serverless Function - 股票API代理
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchGBK(url) {
  const res = await fetch(url, {
    headers: { 'Referer': 'https://finance.sina.com.cn', 'User-Agent': USER_AGENT }
  });
  const buffer = await res.arrayBuffer();
  return new TextDecoder('gbk').decode(buffer);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, codes, code, days } = req.query;

  try {
    // 大盘指数
    if (action === 'index') {
      const data = await fetchGBK('https://hq.sinajs.cn/list=sh000001,sz399001,sh000300,sz399006');
      const result = [];
      const lines = data.split('\n').filter(l => l.trim());
      const names = ['上证指数', '深证成指', '沪深300', '创业板指'];
      lines.forEach((line, i) => {
        const match = line.match(/var hq_str_\w+="(.*)"/);
        if (match && match[1]) {
          const parts = match[1].split(',');
          if (parts.length > 30) {
            result.push({
              name: names[i] || parts[0],
              value: parseFloat(parts[3]),
              change: parseFloat(parts[3]) - parseFloat(parts[2]),
              changePercent: ((parseFloat(parts[3]) - parseFloat(parts[2])) / parseFloat(parts[2]) * 100).toFixed(2)
            });
          }
        }
      });
      return res.json({ success: true, data: result });
    }

    // 实时行情
    if (action === 'realtime' && codes) {
      const formatted = codes.split(',').map(c => {
        c = c.trim();
        if (c.startsWith('6')) return 'sh' + c;
        return 'sz' + c;
      }).join(',');
      const data = await fetchGBK(`https://hq.sinajs.cn/list=${formatted}`);
      const result = [];
      const lines = data.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        const match = line.match(/var hq_str_(\w+)="(.*)"/);
        if (match && match[2]) {
          const parts = match[2].split(',');
          if (parts.length > 30) {
            result.push({
              code: match[1].replace(/^(sh|sz)/, ''),
              name: parts[0],
              price: parseFloat(parts[3]),
              open: parseFloat(parts[1]),
              high: parseFloat(parts[4]),
              low: parseFloat(parts[5]),
              volume: parseInt(parts[8]),
              amount: parseFloat(parts[9]),
              changePercent: ((parseFloat(parts[3]) - parseFloat(parts[2])) / parseFloat(parts[2]) * 100).toFixed(2)
            });
          }
        }
      });
      return res.json({ success: true, data: result });
    }

    // 涨停板
    if (action === 'ztrank') {
      const response = await fetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14,f2,f3,f4,f15', {
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
    if (action === 'kline' && code) {
      const market = code.startsWith('6') ? 1 : 0;
      const response = await fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${days || 60}`, {
        headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': USER_AGENT }
      });
      const json = await response.json();
      const result = (json.data?.klines || []).map(line => {
        const [d, o, c, h, l, v, a] = line.split(',');
        return { date: d, open: parseFloat(o), close: parseFloat(c), high: parseFloat(h), low: parseFloat(l), volume: parseInt(v), amount: parseFloat(a) };
      });
      return res.json({ success: true, data: result });
    }

    return res.json({ success: false, error: '未知操作' });
  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
}
