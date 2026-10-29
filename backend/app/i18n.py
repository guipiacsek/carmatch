"""The few texts the server writes itself (AI-free fallback reasons, result notices), per UI language.
Everything else the user reads is translated in the frontend, or written by the AI in the requested language."""

from .models import Language

TEXT: dict[Language, dict[str, str]] = {
    "en": {
        "must_haves": "{fuel} {body} matching your must-haves",
        "mpg": "{n} MPG combined (EPA)",
        "mpge": "{n} MPGe combined (EPA)",
        "vclass": "{vclass} per EPA classification",
        "drive": "{drive} with {trans} transmission",
        "or": " or ",
        "relaxed": "Not enough exact matches, so we relaxed: {what}.",
        "only_n": "Only {n} cars match your must-haves (body type, fuel, transmission, seats). Try widening them.",
        "no_ai": "AI ranking is unavailable right now, so these are data-based matches without price estimates.",
    },
    "pt-BR": {
        "must_haves": "{body} {fuel} que atende aos seus requisitos",
        "mpg": "{n} MPG combinado (EPA)",
        "mpge": "{n} MPGe combinado (EPA)",
        "vclass": "{vclass} segundo a classificação da EPA",
        "drive": "{drive} com câmbio {trans}",
        "or": " ou ",
        "relaxed": "Não havia resultados exatos suficientes, então flexibilizamos: {what}.",
        "only_n": "Só {n} carros atendem aos seus requisitos (carroceria, combustível, câmbio, lugares). "
        "Tente ampliá-los.",
        "no_ai": "O ranking por IA está indisponível agora; estes resultados vêm só dos dados, "
        "sem estimativa de preço.",
    },
    "es": {
        "must_haves": "{body} {fuel} que cumple tus requisitos",
        "mpg": "{n} MPG combinado (EPA)",
        "mpge": "{n} MPGe combinado (EPA)",
        "vclass": "{vclass} según la clasificación de la EPA",
        "drive": "{drive} con transmisión {trans}",
        "or": " o ",
        "relaxed": "No había suficientes coincidencias exactas, así que flexibilizamos: {what}.",
        "only_n": "Solo {n} autos cumplen tus requisitos (carrocería, combustible, transmisión, asientos). "
        "Prueba a ampliarlos.",
        "no_ai": "La clasificación por IA no está disponible ahora; estos resultados salen solo de los datos, "
        "sin estimación de precio.",
    },
    "ja": {
        "must_haves": "条件に合う{fuel}の{body}",
        "mpg": "複合燃費 {n} MPG（EPA）",
        "mpge": "複合電費 {n} MPGe（EPA）",
        "vclass": "EPA分類：{vclass}",
        "drive": "{drive}・{trans}",
        "or": "／",
        "relaxed": "完全一致が少なかったため、条件を緩めました：{what}。",
        "only_n": "条件（ボディ、燃料、トランスミッション、座席数）に合う車は{n}台だけです。条件を広げてみてください。",
        "no_ai": "現在AIランキングを利用できないため、価格予想なしのデータに基づく結果を表示しています。",
    },
}

# Catalog values as they appear inside those texts.
WORDS: dict[Language, dict[str, str]] = {
    "en": {},
    "pt-BR": {
        "Gas": "a gasolina", "Hybrid": "híbrido", "Plug-in Hybrid": "híbrido plug-in", "Electric": "elétrico",
        "Diesel": "a diesel", "SUV": "SUV", "Compact": "Compacto", "Sedan": "Sedã", "Hatchback": "Hatch",
        "Truck": "Picape", "Coupe": "Cupê", "Convertible": "Conversível", "Minivan": "Minivan", "Wagon": "Perua",
        "automatic": "automático", "manual": "manual", "brand": "marca", "drivetrain": "tração",
        "year range": "anos",
    },
    "es": {
        "Gas": "a gasolina", "Hybrid": "híbrido", "Plug-in Hybrid": "híbrido enchufable", "Electric": "eléctrico",
        "Diesel": "diésel", "SUV": "SUV", "Compact": "Compacto", "Sedan": "Sedán", "Hatchback": "Hatchback",
        "Truck": "Pickup", "Coupe": "Cupé", "Convertible": "Convertible", "Minivan": "Minivan", "Wagon": "Familiar",
        "automatic": "automática", "manual": "manual", "brand": "marca", "drivetrain": "tracción",
        "year range": "años",
    },
    "ja": {
        "Gas": "ガソリン", "Hybrid": "ハイブリッド", "Plug-in Hybrid": "プラグインハイブリッド", "Electric": "電気",
        "Diesel": "ディーゼル", "SUV": "SUV", "Compact": "コンパクト", "Sedan": "セダン", "Hatchback": "ハッチバック",
        "Truck": "ピックアップ", "Coupe": "クーペ", "Convertible": "コンバーチブル", "Minivan": "ミニバン",
        "Wagon": "ワゴン", "automatic": "AT", "manual": "MT", "brand": "ブランド", "drivetrain": "駆動方式",
        "year range": "年式",
    },
}  # fmt: skip


def tr(lang: Language, key: str, **values: object) -> str:
    return TEXT[lang][key].format(**values)


def word(lang: Language, w: str) -> str:
    return WORDS[lang].get(w, w)
