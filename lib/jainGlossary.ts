/**
 * Bidirectional Jain terminology glossary for query expansion.
 * Each entry maps an English term to its Sanskrit/Hindi equivalents (and vice versa).
 * Expands the query before embedding so multilingual-e5-large finds cross-lingual matches
 * for specialized Jain terms that rarely appear together in training data.
 */

// [english, ...sanskrit/hindi synonyms]
const GLOSSARY: [string, ...string[]][] = [
  // Core philosophy
  ["non-violence", "ahimsa", "अहिंसा"],
  ["liberation", "moksha", "मोक्ष", "mukti", "मुक्ति", "nirvana", "निर्वाण"],
  ["soul", "atma", "jiva", "आत्मा", "जीव"],
  ["karma", "कर्म"],
  ["universe", "loka", "लोक"],
  ["omniscience", "keval gyan", "kevalajnana", "केवलज्ञान"],
  ["rebirth", "samsara", "संसार", "punarjanma", "पुनर्जन्म"],

  // Three jewels (Ratnatraya)
  ["right faith", "samyak darshan", "samyagdarshana", "सम्यग्दर्शन"],
  ["right knowledge", "samyak gyan", "samyagjnana", "सम्यग्ज्ञान"],
  ["right conduct", "samyak charitra", "samyakcharitra", "सम्यक्चारित्र"],

  // Practices
  ["equanimity", "samayika", "sāmāyika", "सामायिक"],
  ["meditation", "dhyan", "ध्यान"],
  ["renunciation", "tyaga", "त्याग", "vairagya", "वैराग्य"],
  ["vow", "vrat", "व्रत", "niyam", "नियम"],
  ["fasting", "upvas", "उपवास", "tapas", "तपस्या"],
  ["repentance", "pratikraman", "प्रतिक्रमण"],
  ["atonement", "prayashchitta", "प्रायश्चित्त"],
  ["forgiveness", "kshama", "क्षमा", "micchami dukkadam", "मिच्छामि दुक्कडं"],

  // Five vows
  ["five vows", "panch mahavrat", "पंच महाव्रत", "anuvratas", "अणुव्रत"],
  ["truthfulness", "satya", "सत्य"],
  ["non-stealing", "asteya", "अस्तेय"],
  ["celibacy", "brahmacharya", "ब्रह्मचर्य"],
  ["non-attachment", "aparigraha", "अपरिग्रह"],

  // Beings
  ["ascetic", "muni", "मुनि", "sadhu", "साधु", "shramana", "श्रमण"],
  ["monk", "muni", "मुनि", "anagara", "अनगार"],
  ["nun", "aryika", "आर्यिका", "sadhvi", "साध्वी"],
  ["layperson", "shravak", "श्रावक", "grihasta", "गृहस्थ"],
  ["tirthankara", "तीर्थंकर", "jina", "जिन", "arihant", "अरिहंत"],

  // Scripture types
  ["scripture", "agam", "आगम", "shastra", "शास्त्र"],
  ["commentary", "tika", "टीका", "vritti", "वृत्ति"],

  // Karma theory
  ["bondage", "bandha", "बंध"],
  ["influx", "asrava", "आस्रव"],
  ["stoppage", "samvara", "संवर"],
  ["shedding", "nirjara", "निर्जरा"],
  ["passions", "kashaya", "कषाय"],
  ["anger", "krodha", "क्रोध"],
  ["pride", "mana", "मान"],
  ["deceit", "maya", "माया"],
  ["greed", "lobha", "लोभ"],

  // Cosmology
  ["heavenly beings", "deva", "देव"],
  ["hellish beings", "naraki", "नारकी"],
  ["five senses", "panch indriya", "पंच इंद्रिय"],

  // Philosophy
  ["non-absolutism", "anekantavada", "अनेकान्तवाद", "syadvada", "स्याद्वाद"],
  ["conditional predication", "syadvada", "स्याद्वाद", "saptabhangi", "सप्तभंगी"],
  ["substance", "dravya", "द्रव्य"],
  ["quality", "guna", "गुण"],
  ["mode", "paryaya", "पर्याय"],

  // Jiva bhavas (spiritual states)
  ["jiva bhavas", "औपशमिक", "क्षायिक", "क्षायोपशमिक", "औदयिक", "पारिणामिक",
   "aupashamik", "kshayik", "kshayopashamik", "audalik", "parinamik", "भाव"],
  ["gunasthanas", "gunsthanas", "गुणस्थान", "fourteen stages", "spiritual stages",
   "mithyadrishti", "मिथ्यादृष्टि"],

  // Karma types
  ["knowledge-obscuring karma", "jnavaraniya", "ज्ञानावरणीय"],
  ["faith-obscuring karma", "darshanavraniya", "दर्शनावरणीय"],
  ["deluding karma", "mohaniya", "मोहनीय"],
  ["obstructing karma", "antaraya", "अन्तराय"],

  // Asrava/Samvar/Nirjara
  ["asrava", "आस्रव", "karma influx", "inflow of karma"],
  ["samvar", "संवर", "stoppage of karma", "आस्रव-निरोध"],
  ["nirjara", "निर्जरा", "karma shedding", "karma exhaustion"],
  ["bandha", "बन्ध", "karma bondage"],

  // Dravyas
  ["six substances", "shadravya", "षद्द्रव्य", "dharma", "adharma", "pudgal", "पुद्गल",
   "akasha", "आकाश", "kala", "काल"],
];

/**
 * Expands a query with Jain terminology synonyms across languages.
 * If query contains any term from the glossary (English or Sanskrit/Hindi),
 * appends all synonyms for that concept to improve cross-lingual recall.
 */
export function expandJainQuery(query: string): string {
  const lower = query.toLowerCase();
  const additions = new Set<string>();

  for (const entry of GLOSSARY) {
    const matched = entry.some((term) => lower.includes(term.toLowerCase()));
    if (matched) {
      for (const term of entry) {
        if (!lower.includes(term.toLowerCase())) {
          additions.add(term);
        }
      }
    }
  }

  if (additions.size === 0) return query;
  return `${query} ${[...additions].join(" ")}`;
}
