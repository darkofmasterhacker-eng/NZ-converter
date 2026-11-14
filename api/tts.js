module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const text = (body && body.text ? String(body.text) : '').trim();
    const lang = (body && body.lang ? String(body.lang) : 'en').trim();

    if (!text) {
      return res.status(400).json({ error: 'Text empty hai.' });
    }

    if (text.length > 800) {
      return res.status(400).json({ error: 'Max 800 characters allowed.' });
    }

    const words = text.split(/\s+/);
    const chunks = [];
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).trim().length <= 160) {
        current = (current + ' ' + word).trim();
      } else {
        if (current) chunks.push(current);
        current = word.slice(0, 160);
      }
    }
    if (current) chunks.push(current);

    const buffers = [];
    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
        lang
      )}&q=${encodeURIComponent(chunk)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/'
        }
      });

      if (!response.ok) {
        throw new Error(`TTS upstream error: ${response.status}`);
      }

      const arrBuf = await response.arrayBuffer();
      buffers.push(Buffer.from(arrBuf));
    }

    const finalBuffer = Buffer.concat(buffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(finalBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error.' });
  }
};
