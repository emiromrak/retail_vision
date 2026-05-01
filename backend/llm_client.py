from openai import AsyncOpenAI
import asyncio

client = AsyncOpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

SYSTEM_PROMPT = """Sen bir perakende stok yönetimi uzmanısın.
MUTLAKA ve YALNIZCA Türkçe yaz. İngilizce kesinlikle yasaktır.
Verilen stok verilerini analiz ederek kısa ve profesyonel bir Türkçe rapor hazırla.
Kurallar:
- Tüm yanıt Türkçe olmalı
- Eksik ürünleri açıkça belirt
- Acil temin edilmesi gerekenleri vurgula
- Maksimum 3-4 cümle
- Samimi ve profesyonel bir dil kullan"""


async def generate_report(missing_items: list, detected: dict) -> str:
    """Generate AI stock report from LM Studio (Llama 3.2)."""
    if not missing_items:
        return "✅ Tüm izlenen ürünler kritik seviyenin üzerinde. Stok durumu normal."

    missing_str = ", ".join(missing_items)
    detected_str = ", ".join(f"{k}: {v}" for k, v in detected.items()) or "Hiç ürün tespit edilmedi"

    user_msg = (
        f"TÜRKÇE RAPOR YAZ. İngilizce kullanma.\n"
        f"Tespit edilen ürünler: {detected_str}\n"
        f"Eksik/kritik ürünler: {missing_str}\n"
        f"Bu eksikler için Türkçe acil stok raporu hazırla."
    )

    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="local-model",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.7,
                max_tokens=300,
            ),
            timeout=15.0,
        )
        return response.choices[0].message.content.strip()
    except asyncio.TimeoutError:
        return _fallback_report(missing_items)
    except Exception as e:
        return _fallback_report(missing_items)


def _fallback_report(missing_items: list) -> str:
    """Generate a basic report without LLM when server is unavailable."""
    items = ", ".join(f"**{i}**" for i in missing_items)
    return (
        f"⚠️ Stok Uyarısı: {items} ürünleri kritik seviyenin altında veya tamamen tükendi. "
        f"Acil sipariş verilmesi önerilir. "
        f"(Not: Yerel LLM sunucusuna bağlanılamadı — LM Studio'nun açık olduğundan emin olun.)"
    )
