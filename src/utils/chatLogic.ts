export interface StaffContact {
  name: string;
  email: string;
  phone: string;
  room: string;
  hours: string;
}

export interface ChatResponse {
  id: string;
  topic: string;
  answer: string;
  source: string | null;
  page: number | null;
  category: string | null;
  routeTo: StaffContact | null;
  confidence: 'high' | 'low' | 'none';
}

export type Language = 'en' | 'hi' | 'te';

interface ResponseEntry {
  id: string;
  topic: string;
  keywords: string[];
  question: string | null;
  answer: string;
  source: string | null;
  page: number | null;
  category: string | null;
  routeTo: StaffContact | null;
}

export function detectLanguage(text: string): Language {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  return 'en';
}

export function findResponse(
  userMessage: string,
  responses: ResponseEntry[]
): ChatResponse {
  const normalized = userMessage
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F\u0C00-\u0C7F]/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  const fallback = responses.find((r) => r.id === 'fallback')!;
  const candidates = responses.filter((r) => r.id !== 'fallback');

  let bestScore = 0;
  let bestMatch: ResponseEntry = fallback;

  for (const entry of candidates) {
    let score = 0;
    for (const keyword of entry.keywords) {
      for (const token of tokens) {
        if (
          token === keyword ||
          token.includes(keyword) ||
          keyword.includes(token)
        ) {
          score += 1;
        }
      }
    }
    // Topic word bonus
    if (normalized.includes(entry.topic)) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return {
    id: bestMatch.id,
    topic: bestMatch.topic,
    answer: bestMatch.answer,
    source: bestMatch.source,
    page: bestMatch.page,
    category: bestMatch.category,
    routeTo: bestMatch.routeTo,
    confidence: bestScore >= 3 ? 'high' : bestScore >= 1 ? 'low' : 'none',
  };
}

export function formatTimestamp(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
