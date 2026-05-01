const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
});

const SYSTEM_PROMPT = `Sen bir perakende stok yönetimi uzmanısın.
MUTLAKA ve YALNIZCA Türkçe yaz. İngilizce kesinlikle yasaktır.
Verilen stok verilerini analiz ederek kısa ve profesyonel bir Türkçe rapor hazırla.
Kurallar:
- Tüm yanıt Türkçe olmalı
- Eksik ürünleri açıkça belirt
- Acil temin edilmesi gerekenleri vurgula
- Maksimum 3-4 cümle
- Samimi ve profesyonel bir dil kullan`;

function fallbackReport(missingItems) {
  const items = missingItems.map((i) => `**${i}**`).join(', ');
  return (
    `⚠️ Stok Uyarısı: ${items} ürünleri kritik seviyenin altında veya tamamen tükendi. ` +
    `Acil sipariş verilmesi önerilir. ` +
    `(Not: Yerel LLM sunucusuna bağlanılamadı — LM Studio'nun açık olduğundan emin olun.)`
  );
}

async function generateReport(missingItems, detected) {
  if (!missingItems || missingItems.length === 0) {
    return '✅ Tüm izlenen ürünler kritik seviyenin üzerinde. Stok durumu normal.';
  }

  const missingStr = missingItems.join(', ');
  const detectedStr =
    Object.entries(detected)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || 'Hiç ürün tespit edilmedi';

  const userMsg =
    `TÜRKÇE RAPOR YAZ. İngilizce kullanma.\n` +
    `Tespit edilen ürünler: ${detectedStr}\n` +
    `Eksik/kritik ürünler: ${missingStr}\n` +
    `Bu eksikler için Türkçe acil stok raporu hazırla.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await client.chat.completions.create(
      {
        model: 'local-model',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.7,
        max_tokens: 300,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);
    return response.choices[0].message.content.trim();
  } catch (_err) {
    return fallbackReport(missingItems);
  }
}

module.exports = { generateReport };
