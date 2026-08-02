/**
 * Bidirectional Jain terminology glossary for query expansion.
 * Each entry maps an English term to its Sanskrit/Hindi equivalents (and vice versa).
 * Expands the query before embedding so multilingual-e5-large finds cross-lingual matches
 * for specialized Jain terms that rarely appear together in training data.
 */

// [english, ...sanskrit/hindi/romanized synonyms]
const GLOSSARY: [string, ...string[]][] = [
  // Core philosophy
  ["non-violence", "ahimsa", "अहिंसा"],
  ["liberation", "moksha", "moksh", "मोक्ष", "mukti", "मुक्ति", "nirvana", "निर्वाण"],
  ["soul", "atma", "jiva", "jiv", "आत्मा", "जीव"],
  ["karma", "karm", "कर्म"],
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
  ["bondage", "bandha", "bandh", "बंध"],
  ["influx", "asrava", "asrav", "ashrav", "आस्रव"],
  ["stoppage", "samvara", "samvar", "संवर"],
  ["shedding", "nirjara", "nirjar", "निर्जरा"],
  ["passions", "kashaya", "kashay", "कषाय"],
  ["anger", "krodha", "krodh", "क्रोध"],
  ["pride", "mana", "maan", "मान"],
  ["deceit", "maya", "माया"],
  ["greed", "lobha", "lobh", "लोभ"],

  // Cosmology
  ["heavenly beings", "deva", "देव"],
  ["hellish beings", "naraki", "नारकी"],
  ["five senses", "panch indriya", "पंच इंद्रिय"],

  // Philosophy
  ["non-absolutism", "anekantavada", "anekant", "अनेकान्तवाद", "अनेकांतवाद"],
  ["conditional predication", "syadvada", "स्याद्वाद", "saptabhangi", "सप्तभंगी"],
  ["substance", "dravya", "dravyas", "द्रव्य"],
  ["quality", "guna", "gun", "गुण"],
  ["mode", "paryaya", "paryay", "पर्याय"],

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

  // Frequently asked Jain philosophical frameworks
  ["seven tattvas", "sapta tattva", "seven principles", "जीव", "अजीव", "आस्रव", "बन्ध", "संवर", "निर्जरा", "मोक्ष"],
  ["nine tattvas", "nava tattva", "nine principles", "पुण्य", "पाप", "जीव", "अजीव", "आस्रव", "बन्ध", "संवर", "निर्जरा", "मोक्ष"],
  ["fourteen marganas", "margana", "मार्गणा", "fourteen investigations"],
  ["leshyas", "leshya", "लेश्या", "six leshyas"],
  ["four destinies", "gati", "गतियाँ", "नरक", "तिर्यंच", "मनुष्य", "देव"],
  ["five supreme beings", "panch parameshthi", "पंच परमेष्ठी", "arihant", "siddha", "acharya", "upadhyaya", "sadhu"],
  ["four passions", "four kashayas", "चार कषाय", "krodha", "mana", "maya", "lobha"],
  ["twelve reflections", "anupreksha", "बारह भावना", "अनुप्रेक्षा"],
  ["twelve vows", "twelve vratas", "बारह व्रत", "महाव्रत", "अणुव्रत", "शिक्षाव्रत"],
];

const MAX_EXPANSION_TERMS = 28;

function matchesTerm(query: string, normalizedQuery: string, term: string): boolean {
  const normalizedTerm = term.toLowerCase().trim();
  if (!normalizedTerm) return false;

  // Word boundaries prevent short Romanized terms such as "gun" from matching
  // unrelated English words. They do not work reliably for Devanagari, where a
  // direct substring match is the appropriate behaviour.
  if (/^[a-z0-9\s-]+$/i.test(normalizedTerm)) {
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(normalizedQuery);
  }
  return query.includes(term);
}

/**
 * Returns a small set of focused alternate queries. A single embedding of a
 * huge synonym list blurs closely related Jain doctrines, so the chat route
 * searches the original question as well as one focused doctrinal formulation.
 */
export function buildJainSearchQueries(query: string): string[] {
  const normalized = query.toLowerCase();
  const matchedConcepts = GLOSSARY.filter((entry) =>
    entry.some((term) => matchesTerm(query, normalized, term))
  );

  const queries = [query.trim()];
  for (const entry of matchedConcepts.slice(0, 3)) {
    const terms = entry.slice(0, 7).join(" ");
    queries.push(`Jain philosophy ${terms}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

/**
 * Expands a query with Jain terminology synonyms across languages.
 * If query contains any term from the glossary (English or Sanskrit/Hindi),
 * appends all synonyms for that concept to improve cross-lingual recall.
 */
export function expandJainQuery(query: string): string {
  const lower = query.toLowerCase();
  const additions = new Set<string>();

  for (const entry of GLOSSARY) {
    const matched = entry.some((term) => matchesTerm(query, lower, term));
    if (matched) {
      for (const term of entry) {
        if (!matchesTerm(query, lower, term)) {
          additions.add(term);
          if (additions.size >= MAX_EXPANSION_TERMS) break;
        }
      }
    }
    if (additions.size >= MAX_EXPANSION_TERMS) break;
  }

  if (additions.size === 0) return query;
  return `${query} ${[...additions].join(" ")}`;
}
