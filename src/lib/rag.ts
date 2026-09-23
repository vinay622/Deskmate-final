import { getGeminiClient, GENERATION_MODEL, AGENT_TOOLS } from "./gemini";
import { generateEmbeddings, queryIndex } from "./pinecone";

// ─── Types ───────────────────────────────────────────────────

export interface ChunkResult {
  content: string;
  chunkIndex: number;
}

export interface SearchResult {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
  document_name: string;
  document_category: string;
}

export interface RAGResponse {
  answer: string;
  sources: Array<{ documentName: string; category: string }>;
  hasContext: boolean;
}

export interface StaffMember {
  name: string;
  department: string;
  role: string;
  email: string;
  phone: string;
  whatsapp: string;
  office_location: string;
  office_hours?: string;
  languages?: string[];
  urgency_level?: string;
}

export interface EscalationResult {
  shouldEscalate: boolean;
  category?: string;
  reason?: string;
  isUrgent?: boolean;
  language?: string;
  staff?: StaffMember[];
}

export type QueryIntent =
  | 'GREETING_INTRODUCTION'
  | 'CONVERSATIONAL_COURTESY'
  | 'OFF_TOPIC'
  | 'EXPLICIT_ESCALATION'
  | 'COLLEGE_QUERY';

export interface QueryAnalysis {
  intent: QueryIntent;
  rewritten: string;
  category: string | null;
  language: string;
  isUrgent: boolean;
  requiresVectorSearch: boolean;
}

// ─── Fast Pattern Recognition ─────────────────────────────────────────
const GREETING_REGEX = /^(hi+|hello+|hey+|heyy+|howdy|hola|yo|greetings|namaste|namaskar|pranam|ram\s*ram|vanakkam|salaam|good\s*(morning|afternoon|evening|day|night)|नमस्ते|नमस्कार|प्रणाम|హలో|నమస్కారం|నమస్తే|బాగున్నారా|வணக்கம்|நமஸ்காரம்)[\s!.,?~-]*$/i;

const INTRO_BOT_REGEX = /^(who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|how\s+can\s+you\s+help(\s+me)?|what\s+is\s+deskmate|introduce\s+yourself|tell\s+me\s+about\s+yourself|what\s+do\s+you\s+do|who\s+made\s+you|help\s+me|aap\s+kaun\s+ho|tum\s+kaun\s+ho|meeru\s+evaru|neevu\s+yaaru)[\s!.,?~-]*$/i;

const COURTESY_GRATITUDE_REGEX = /^(thanks|thank\s+you|thank\s+u|thx|tq|dhanyawad|dhanyavadamulu|nandri|shukriya|much\s+appreciated|thanks\s+a\s+lot|thank\s+you\s+so\s+much|dhanyawadalu|ధన్యవాదాలు|धन्यवाद)[\s!.,?~-]*$/i;

const COURTESY_PLEASANTRY_REGEX = /^(how\s+are\s+you|how\s+r\s+u|how\s+do\s+you\s+do|how('s|s|\s+is)\s+it\s+going|what's\s+up|wassup|how\s+have\s+you\s+been|kya\s+hal\s+hai|kaise\s+ho|bagunnara|ela\s+unnaru)[\s!.,?~-]*$/i;

const COURTESY_ACK_REGEX = /^(ok|okay|cool|great|awesome|understood|got\s+it|fine|perfect|nice|sure|alright|kk|k|sounds\s+good|roger\s+that|theek\s+hai|teek\s+hai|sare|சரி|ठीक\s+है)[\s!.,?~-]*$/i;

const COURTESY_FAREWELL_REGEX = /^(bye|goodbye|see\s+you|cya|take\s+care|good\s*night|catch\s+you\s+later|have\s+a\s+good\s+day|alvida|vida|selavu)[\s!.,?~-]*$/i;

const OFF_TOPIC_FAST_REGEX = /^(write|generate|create|debug|fix)\s+(a|me|some)?\s*(python|java|c\+\+|javascript|typescript|code|script|program|function|algorithm|sql\s+query)|^(who\s+is\s+(the\s+)?(president|prime\s+minister|pm|ceo|king|queen|actor|actress)|tell\s+me\s+a\s+joke|tell\s+me\s+a\s+story|what\s+is\s+the\s+capital\s+of|what\s+is\s+the\s+weather|recipe\s+for|sing\s+a\s+song|write\s+a\s+poem|solve\s+(this\s+)?(equation|math|derivative|integral))/i;

export function isFastGreeting(q: string): boolean {
  const clean = q.trim().toLowerCase();
  if (GREETING_REGEX.test(clean) || INTRO_BOT_REGEX.test(clean)) return true;
  if (/^(hi|hello|hey|greetings|namaste)\s+(there|bot|deskmate|assistant|all|everyone|sir|madam|team)[\s!.,?~-]*$/i.test(clean)) return true;
  return false;
}

export function isFastCourtesy(q: string): boolean {
  const clean = q.trim().toLowerCase();
  return COURTESY_GRATITUDE_REGEX.test(clean) ||
         COURTESY_PLEASANTRY_REGEX.test(clean) ||
         COURTESY_ACK_REGEX.test(clean) ||
         COURTESY_FAREWELL_REGEX.test(clean);
}

export function isFastOffTopic(q: string): boolean {
  const clean = q.trim().toLowerCase();
  return OFF_TOPIC_FAST_REGEX.test(clean);
}

// ─── Enhanced Escalation Detection ───────────────────────────────────
const QUERY_CATEGORIES = [
  'admissions', 'enrollment', 'fee', 'accounts', 'payments', 'examinations',
  'results', 'academic', 'placements', 'internships', 'career', 'hostel',
  'student affairs', 'welfare', 'computer science', 'technical',
  'sports', 'library', 'transport', 'scholarship', 'maintenance', 'security',
  'counseling', 'health', 'medical', 'canteen', 'lab', 'workshop'
];

const EXPLICIT_CONTACT_TRIGGERS = [
  'contact', 'talk to', 'speak with', 'reach out', 'get in touch',
  'staff member', 'staff', 'officer', 'administration', 'office', 'call', 'email',
  'who can help', 'who handles', 'department', 'person responsible',
  'faculty', 'professor', 'teacher', 'hod', 'dean', 'coordinator',
  'who is', 'tell me about staff', 'available staff'
];

const SENSITIVE_TRIGGERS = [
  'complaint', 'approval', 'verification', 'personal record', 'payment issue',
  'refund', 'certificate', 'transcript', 'grievance', 'appeal'
];

const URGENCY_TRIGGERS = ['urgent', 'emergency', 'asap', 'immediately', 'crisis', 'critical'];

const LANGUAGE_INDICATORS = {
  hindi: ['hindi', 'हिंदी', 'मुझे', 'क्या', 'कैसे', 'है', 'के', 'में', 'kya', 'kaise', 'mujhe', 'chahiye', 'hai', 'kab', 'kahan'],
  telugu: ['telugu', 'తెలుగు', 'నాకు', 'ఎలా', 'ఎక్కడ', 'ఏమి', 'గురించి', 'naaku', 'ela', 'eppudu', 'ekkada', 'enti', 'kavali'],
};

// Unicode script ranges — a single character match identifies the language.
const SCRIPT_RANGES: Array<[RegExp, string]> = [
  [/[ऀ-ॿ]/, 'hindi'],     // Devanagari
  [/[ఀ-౿]/, 'telugu'],    // Telugu
  [/[஀-௿]/, 'tamil'],     // Tamil
  [/[ಀ-೿]/, 'kannada'],   // Kannada
  [/[ഀ-ൿ]/, 'malayalam'], // Malayalam
  [/[઀-૿]/, 'gujarati'],  // Gujarati
  [/[ঀ-৿]/, 'bengali'],   // Bengali
  [/[਀-੿]/, 'punjabi'],   // Gurmukhi
];

export function detectLanguage(query: string): string {
  // Script detection first — one native-script character is decisive
  for (const [range, language] of SCRIPT_RANGES) {
    if (range.test(query)) {
      return language;
    }
  }

  // Romanized keyword fallback (Latin-script Hindi/Telugu)
  const lowerQuery = query.toLowerCase();
  for (const [language, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
    if (indicators.some(indicator => lowerQuery.includes(indicator))) {
      return language;
    }
  }

  return 'english';
}

export function detectUrgency(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return URGENCY_TRIGGERS.some(trigger => lowerQuery.includes(trigger));
}

function isWithinOfficeHours(currentTime: Date = new Date()): boolean {
  const hour = currentTime.getHours();
  const day = currentTime.getDay(); // 0 = Sunday, 6 = Saturday

  // Mon-Fri 9AM-5PM (adjust as needed)
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

export function detectQueryCategory(query: string): string | null {
  const lowerQuery = query.toLowerCase();

  for (const category of QUERY_CATEGORIES) {
    if (lowerQuery.includes(category)) {
      return category;
    }
  }

  // Additional category mappings
  if (lowerQuery.includes('fees') || lowerQuery.includes('payment')) return 'fee';
  if (lowerQuery.includes('exam') || lowerQuery.includes('test')) return 'examinations';
  if (lowerQuery.includes('admission') || lowerQuery.includes('apply')) return 'admissions';
  if (lowerQuery.includes('placement') || lowerQuery.includes('job')) return 'placements';
  if (lowerQuery.includes('room') || lowerQuery.includes('accommodation')) return 'hostel';

  return null;
}

export function isFastEscalation(q: string): boolean {
  const clean = q.trim().toLowerCase();
  if (isFastGreeting(clean) || isFastCourtesy(clean)) return false;
  const hasContactTrigger = EXPLICIT_CONTACT_TRIGGERS.some(t => clean.includes(t));
  const hasSensitiveTrigger = SENSITIVE_TRIGGERS.some(t => clean.includes(t));
  const hasUrgencyTrigger = URGENCY_TRIGGERS.some(t => clean.includes(t));
  return hasContactTrigger || hasSensitiveTrigger || (hasUrgencyTrigger && clean.length > 6);
}

export function shouldEscalate(
  queryOrIntent: string | QueryIntent,
  queryOrContextLength?: string | number,
  contextLengthOrConfidence?: number,
  confidenceScore?: number
): { shouldEscalate: boolean; reason: string; isUrgent: boolean; language: string } {
  let intent: QueryIntent;
  let query: string;
  let contextLength: number;
  let confidence: number | undefined;

  const validIntents: QueryIntent[] = [
    'GREETING_INTRODUCTION',
    'CONVERSATIONAL_COURTESY',
    'OFF_TOPIC',
    'EXPLICIT_ESCALATION',
    'COLLEGE_QUERY',
  ];

  if (validIntents.includes(queryOrIntent as QueryIntent) && typeof queryOrContextLength === 'string') {
    intent = queryOrIntent as QueryIntent;
    query = queryOrContextLength;
    contextLength = typeof contextLengthOrConfidence === 'number' ? contextLengthOrConfidence : 0;
    confidence = confidenceScore;
  } else {
    query = String(queryOrIntent);
    contextLength = typeof queryOrContextLength === 'number' ? queryOrContextLength : 0;
    confidence = typeof contextLengthOrConfidence === 'number' ? contextLengthOrConfidence : undefined;
    intent = isFastGreeting(query)
      ? 'GREETING_INTRODUCTION'
      : isFastCourtesy(query)
      ? 'CONVERSATIONAL_COURTESY'
      : isFastOffTopic(query)
      ? 'OFF_TOPIC'
      : isFastEscalation(query)
      ? 'EXPLICIT_ESCALATION'
      : 'COLLEGE_QUERY';
  }

  const lowerQuery = query.toLowerCase();
  const language = detectLanguage(query);
  const isUrgent = detectUrgency(query);

  // Greetings, small talk, pleasantries, and off-topic queries should NEVER escalate to staff
  if (intent === 'GREETING_INTRODUCTION' || intent === 'CONVERSATIONAL_COURTESY' || intent === 'OFF_TOPIC') {
    return { shouldEscalate: false, reason: 'conversational', isUrgent: false, language };
  }

  // Explicit contact requests & sensitive grievance topics
  if (intent === 'EXPLICIT_ESCALATION') {
    for (const trigger of SENSITIVE_TRIGGERS) {
      if (lowerQuery.includes(trigger)) {
        return { shouldEscalate: true, reason: 'sensitive_topic', isUrgent, language };
      }
    }
    if (isUrgent && !isWithinOfficeHours()) {
      return { shouldEscalate: true, reason: 'urgent_after_hours', isUrgent, language };
    }
    return { shouldEscalate: true, reason: 'explicit_request', isUrgent, language };
  }

  // Check explicit triggers even if intent was classified as college query
  for (const trigger of EXPLICIT_CONTACT_TRIGGERS) {
    if (lowerQuery.includes(trigger)) {
      return { shouldEscalate: true, reason: 'explicit_request', isUrgent, language };
    }
  }

  for (const trigger of SENSITIVE_TRIGGERS) {
    if (lowerQuery.includes(trigger)) {
      return { shouldEscalate: true, reason: 'sensitive_topic', isUrgent, language };
    }
  }

  if (isUrgent && !isWithinOfficeHours()) {
    return { shouldEscalate: true, reason: 'urgent_after_hours', isUrgent, language };
  }

  // Knowledge gap (no context found for a genuine college query)
  if (contextLength === 0) {
    return { shouldEscalate: true, reason: 'knowledge_gap', isUrgent, language };
  }

  if (confidence !== undefined && confidence < 0.3) {
    return { shouldEscalate: true, reason: 'low_confidence', isUrgent, language };
  }

  return { shouldEscalate: false, reason: 'sufficient_context', isUrgent, language };
}

// ─── 1. Text Extraction ─────────────────────────────────────

export async function extractText(
  file: File,
  fileType: string
): Promise<string> {
  switch (fileType) {
    case "application/pdf":
      return extractPdfText(file);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocxText(file);
    case "text/plain":
      return file.text();
    default:
      if (fileType.startsWith("image/")) {
        return extractImageText(file);
      }
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

// Cached module references to avoid re-importing heavy libs on every request
let _mammoth: typeof import("mammoth") | null = null;

// Retry helper for Gemini API rate limits
async function retryGeminiCall<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('503') ||
                         error?.message?.includes('429') ||
                         error?.message?.includes('high demand') ||
                         error?.message?.includes('UNAVAILABLE');

      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[rag] Rate limited (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

async function extractPdfText(file: File): Promise<string> {
  // Hard limit: 5MB to prevent OOM during base64 conversion
  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`PDF too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`);
  }
  console.log(`[rag] Processing PDF: ${file.name}, ${(file.size / 1024 / 1024).toFixed(1)}MB`);
  const ai = getGeminiClient();
  console.log(`[rag] Converting to base64...`);
  let base64: string | null = Buffer.from(await file.arrayBuffer()).toString("base64");
  console.log(`[rag] Base64 size: ${(base64.length / 1024 / 1024).toFixed(1)}MB`);
  console.log(`[rag] Sending to Gemini...`);

  const response = await retryGeminiCall(async () => {
    return await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Extract all text from this PDF clearly." },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64!,
              },
            },
          ],
        },
      ],
    });
  });

  base64 = null; // free memory before returning

  console.log(`[rag] Received response: ${response.text?.length || 0} chars`);
  return response.text ?? "";
}

async function extractDocxText(file: File): Promise<string> {
  if (!_mammoth) {
    _mammoth = await import("mammoth");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await _mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractImageText(file: File): Promise<string> {
  const ai = getGeminiClient();
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const response = await retryGeminiCall(async () => {
    return await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: file.type,
                data: base64,
              },
            },
            {
              text: "Extract ALL text from this image. Return only the extracted text, no commentary.",
            },
          ],
        },
      ],
    });
  });
  return response.text ?? "";
}

// ─── 2. Text Chunking ───────────────────────────────────────

// Citation relevance filter — only documents that genuinely drove the answer
// should be cited. Two gates:
//   1. Absolute floor: below MIN_CITE_SIMILARITY a chunk is noise regardless
//      of how it compares to other results (multilingual-e5-large scores of
//      ~0.5 are common for topically-adjacent but wrong documents).
//   2. Relative band: even above the floor, a chunk must score close to the
//      best match, otherwise loosely-related docs ride along with strong ones.
export const MIN_CITE_SIMILARITY = 0.62;
const CLOSE_SOURCE_DELTA = 0.05;

export function filterCitableChunks<T extends { similarity: number }>(context: T[]): T[] {
  if (context.length === 0) return [];
  const bestSimilarity = Math.max(...context.map((c) => c.similarity));
  return context.filter(
    (c) => c.similarity >= MIN_CITE_SIMILARITY && c.similarity >= bestSimilarity - CLOSE_SOURCE_DELTA
  );
}

export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): ChunkResult[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return [];

  const step = chunkSize - overlap; // advance by 800 each iteration
  const chunks: ChunkResult[] = [];

  for (let i = 0; i < cleaned.length; i += step) {
    chunks.push({
      content: cleaned.slice(i, i + chunkSize).trim(),
      chunkIndex: chunks.length,
    });
  }

  return chunks;
}

// ─── 3. Generate Embeddings ─────────────────────────────────

const EMBED_BATCH_SIZE = 10; // Reduced from 20 to minimize memory pressure

export async function embedText(texts: string[]): Promise<number[][]> {
  // Batch to avoid sending too many texts at once (memory + API limits)
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    console.log(`[rag] Embedding batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1}/${Math.ceil(texts.length / EMBED_BATCH_SIZE)}`);
    const batchEmbeddings = await generateEmbeddings(batch, "passage");
    allEmbeddings.push(...batchEmbeddings);
  }
  return allEmbeddings;
}

export async function embedSingleText(text: string): Promise<number[]> {
  const results = await generateEmbeddings([text], "query");
  return results[0];
}

// ─── 3b. Semantic Intent Analysis & Query Rewriting ─────────
// Analyzes student intent (greeting, small talk courtesy, off-topic, college query, or escalation)
// and rewrites college queries into clean standalone search terms.
export async function analyzeQueryIntent(
  query: string,
  history?: Array<{ role: string; content: string }>
): Promise<QueryAnalysis> {
  const clean = query.trim();
  const language = detectLanguage(query);
  const isUrgent = detectUrgency(query);

  // 1. Zero-Latency Fast Path Patterns
  if (isFastGreeting(clean)) {
    return {
      intent: 'GREETING_INTRODUCTION',
      rewritten: query,
      category: 'greeting',
      language,
      isUrgent: false,
      requiresVectorSearch: false,
    };
  }

  if (isFastCourtesy(clean)) {
    return {
      intent: 'CONVERSATIONAL_COURTESY',
      rewritten: query,
      category: 'courtesy',
      language,
      isUrgent: false,
      requiresVectorSearch: false,
    };
  }

  if (isFastOffTopic(clean)) {
    return {
      intent: 'OFF_TOPIC',
      rewritten: query,
      category: 'off_topic',
      language,
      isUrgent: false,
      requiresVectorSearch: false,
    };
  }

  if (isFastEscalation(clean)) {
    return {
      intent: 'EXPLICIT_ESCALATION',
      rewritten: query,
      category: detectQueryCategory(query) || 'administration',
      language,
      isUrgent,
      requiresVectorSearch: false,
    };
  }

  // 2. Semantic Analysis & Intelligent Query Rewriting via Gemini
  try {
    const ai = getGeminiClient();
    const historyBlock =
      history && history.length > 0
        ? `Recent conversation context:\n${history
            .slice(-4)
            .map((m) => `${m.role}: ${m.content.slice(0, 150)}`)
            .join('\n')}\n\n`
        : '';

    const prompt = `${historyBlock}Analyze this query for a college helpdesk AI named DeskMate.
User Query: "${query}"

Classify into exactly ONE intent and return ONLY a valid JSON object matching this schema:
{
  "intent": "GREETING_INTRODUCTION" | "CONVERSATIONAL_COURTESY" | "OFF_TOPIC" | "EXPLICIT_ESCALATION" | "COLLEGE_QUERY",
  "category": "admissions" | "fee" | "examinations" | "academic" | "placements" | "hostel" | "facilities" | "scholarship" | "transport" | "library" | "general" | null,
  "rewritten": "<standalone English search query for vector retrieval. If off-topic or greeting, leave as original>",
  "isUrgent": true | false
}

Classification Criteria:
- GREETING_INTRODUCTION: Saying hi, hello, asking who the bot is, what DeskMate does, or general self-intro.
- CONVERSATIONAL_COURTESY: Saying thanks, okay, good morning/night, how are you, bye, or short pleasantries.
- OFF_TOPIC: General coding/programming requests, world politics, celebrities/movies, cooking recipes, homework not related to college procedures.
- EXPLICIT_ESCALATION: Requests for staff phone/email/contacts, official complaints/disputes, emergency/crisis.
- COLLEGE_QUERY: Inquiries about courses, syllabus, fee structures, exam dates, hostel rules, library timings, admissions, placements, scholarships, campus services.`;

    const response = await retryGeminiCall(async () => {
      return await ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0,
          maxOutputTokens: 250,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
    });

    const parsed = JSON.parse(response.text || '{}');
    const validIntents: QueryIntent[] = [
      'GREETING_INTRODUCTION',
      'CONVERSATIONAL_COURTESY',
      'OFF_TOPIC',
      'EXPLICIT_ESCALATION',
      'COLLEGE_QUERY',
    ];

    const intent: QueryIntent = validIntents.includes(parsed.intent)
      ? parsed.intent
      : 'COLLEGE_QUERY';

    const rewritten =
      parsed.rewritten &&
      typeof parsed.rewritten === 'string' &&
      parsed.rewritten.trim().length > 0
        ? parsed.rewritten.trim()
        : query;

    const category = parsed.category || detectQueryCategory(query);

    return {
      intent,
      rewritten,
      category,
      language,
      isUrgent: Boolean(parsed.isUrgent) || isUrgent,
      requiresVectorSearch: intent === 'COLLEGE_QUERY',
    };
  } catch (error: any) {
    console.error('[rag] Semantic intent analysis failed (fallback to heuristic):', error?.message || error);
    const category = detectQueryCategory(query);
    return {
      intent: 'COLLEGE_QUERY',
      rewritten: query,
      category,
      language,
      isUrgent,
      requiresVectorSearch: true,
    };
  }
}

// Backwards-compatible query rewrite helper
export async function rewriteQuery(
  query: string,
  history?: Array<{ role: string; content: string }>
): Promise<string> {
  const analysis = await analyzeQueryIntent(query, history);
  return analysis.rewritten;
}

// ─── 4. Search Chunks (Vector Similarity via Pinecone) ──────

export async function searchChunks(
  queryEmbedding: number[],
  matchThreshold: number = 0.5,
  matchCount: number = 5,
  collegeName?: string
): Promise<SearchResult[]> {
  return queryIndex(queryEmbedding, matchCount, matchThreshold, collegeName);
}

// ─── 5. Generate Response with RAG ──────────────────────────

const SYSTEM_PROMPT = `You are DeskMate, an AI-powered College Query Assistant designed to help students, parents, and visitors get accurate information about their college.

Your purpose is to answer questions related to:
* Admissions and enrollment procedures
* Courses, departments, and academic programs
* Fee structures and payment details
* Faculty and administrative staff
* Events and announcements
* Campus facilities (library, hostels, labs, cafeteria)
* Placements and internships
* Academic policies and examination procedures
* Contact information and office hours
* Student services and support systems

## BEHAVIOR RULES

1. **Accuracy First**
   Only provide information that exists in the knowledge base or provided documents.
   Do not guess or invent information.
   If information is unavailable, politely say that the information is not currently available and suggest contacting the college administration.

2. **Context Awareness**
   If the user asks about an event or announcement, check whether it is still valid.
   If the event has already passed, respond that the event has already concluded.

3. **Clear and Helpful Responses**
   Explain information in a simple and student-friendly way.
   Avoid complex technical language.
   Use short paragraphs for readability.
   Never copy-paste raw document text — always paraphrase and synthesize information.

4. **Structured Formatting**
   When appropriate, format responses using:
   * Bullet points for lists
   * Numbered steps for procedures
   * Bold formatting for important figures, dates, and amounts (e.g. **₹45,000**, **15th October**)
   * Short sections to help users quickly understand information

5. **Streaming Response Style**
   Your responses will be streamed word-by-word to the interface.
   Therefore:
   * Start answering immediately
   * Avoid long internal reasoning before responding
   * Write naturally so the response appears smoothly as it streams

6. **Professional Tone**
   Maintain a friendly, professional, and helpful tone suitable for students and parents.

7. **Query Clarification**
   If a question is unclear, politely ask the user to clarify what they mean.
   Example: "Could you please specify which course or department you are referring to?"

8. **Scope Limitation**
   If a user asks something unrelated to the college (general knowledge, entertainment, politics, etc.), politely explain that the assistant only answers college-related questions.
   Example: "I'm designed to assist with college-related information. Please ask about admissions, courses, campus facilities, or other college services."

9. **Source Attribution**
   When using information from college documents, mention the source naturally in your response.
   At the end of responses using document context, include: *Source: Document Name*

10. **Language Matching**
    Always respond in the same language the student uses (English, Hindi, Telugu, etc.).

## ESCALATION HANDLING

When you encounter queries that require human assistance, respond professionally:
- Acknowledge the request warmly
- Explain that you'll connect them with the appropriate staff member
- Present staff contact information clearly
- Remain available for other questions

## GOAL
Provide accurate, fast, and helpful college-related information to students while maintaining a smooth conversational experience similar to modern AI assistants.`;


// ─── 5a. Streaming Response ──────────────────────────────────

export interface StudentProfile {
  degreeProgram: string | null;
  department: string | null;
  year: number | null;
  hosteller: boolean | null;
}

// Builds the prompt-context block describing who the student is.
// Returns '' when there is no profile row at all.
function buildProfileBlock(name: string | undefined, profile: StudentProfile | null | undefined): string {
  if (!profile) return '';
  const parts: string[] = [];
  const missing: string[] = [];

  if (name) parts.push(`Name: ${name}`);
  if (profile.degreeProgram) parts.push(`Program: ${profile.degreeProgram}`); else missing.push('degree program');
  if (profile.department) parts.push(`Department: ${profile.department}`); else missing.push('department');
  if (profile.year != null) parts.push(`Year: ${profile.year}`); else missing.push('year');
  if (profile.hosteller != null) parts.push(`Hostel resident: ${profile.hosteller ? 'yes' : 'no'}`); else missing.push('hostel status');

  // Emit the block whenever a profile row exists — even fully empty — so the
  // missing-fields nudge instruction below still reaches the model.
  let block = '\n--- STUDENT PROFILE ---\n';
  block += parts.length > 0 ? parts.join(' | ') + '\n' : 'No profile details provided.\n';
  block += 'Use this profile to tailor answers: when documents or announcements contain year-, department-, program-, or hostel-specific information, answer with the part that applies to this student and say so.\n';
  if (missing.length > 0) {
    block += `Missing profile fields: ${missing.join(', ')}. If the answer would differ based on a missing field, add one short line suggesting the student complete their profile via "My Profile" in the sidebar.\n`;
  }
  block += '--- END PROFILE ---\n';
  return block;
}

export type StreamChunk =
  | { type: 'chunk'; text: string }
  | { type: 'offer_ticket'; category: string | null; staffName: string | null }
  | {
      type: 'done';
      sources: Array<{ documentName: string; category: string; documentId?: string; fileUrl?: string | null }>;
      hasContext: boolean;
      queryLogId?: string | null;
      chunks?: Array<{ documentName: string; snippet: string; similarity: number }>;
    }
  | { type: 'error'; error: string };

async function* generateEscalationResponse(
  query: string,
  reason: string,
  collegeName?: string,
  isUrgent: boolean = false,
  language: string = 'english',
  request?: Request,
  cookies?: import('astro').AstroCookies,
  student?: { id: string; name: string },
  queryLogId?: string | null
): AsyncGenerator<StreamChunk> {
  try {
    const category = detectQueryCategory(query);
    const currentTime = new Date();
    let staffMembers: StaffMember[] = [];

    let escalationText = '';

    // Context-aware messaging
    if (reason === 'urgent_after_hours') {
      escalationText = "I understand this is urgent. While our regular staff may not be available right now, let me provide you with the appropriate contact information. ";
    } else if (isUrgent) {
      escalationText = "I understand this is urgent. Let me connect you with priority staff members who can help immediately. ";
    } else if (reason === 'explicit_request') {
      escalationText = "I'll connect you with the right staff member for your request. ";
    } else if (reason === 'sensitive_topic') {
      escalationText = "This matter requires official assistance. Let me provide you with the appropriate staff contact. ";
    } else {
      escalationText = "I don't have specific information about this. Let me connect you with staff who can help. ";
    }

    // Yield introduction with typing simulation
    for (const word of escalationText.split(' ')) {
      yield { type: 'chunk', text: word + ' ' };
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    if (collegeName) {
      staffMembers = await getStaffFromCategory(category, collegeName, language, isUrgent, currentTime, request, cookies, query);

      if (staffMembers.length > 0) {
        let staffText = `\n\n**Available Staff:**\n\n`;

        for (const staff of staffMembers) {
          staffText += `**${staff.name}**\n`;
          staffText += `${staff.role}, ${staff.department}\n`;

          if (isUrgent && staff.urgency_level === 'emergency') {
            staffText += `🚨 **Emergency Contact** 🚨\n`;
          } else if (isUrgent && staff.urgency_level === 'urgent') {
            staffText += `⚡ **Priority Contact** ⚡\n`;
          }

          staffText += `\n**Contact Information:**\n`;
          if (staff.email) staffText += `📧 Email: ${staff.email}\n`;
          if (staff.phone) staffText += `📞 Phone: ${staff.phone}\n`;
          if (staff.whatsapp) staffText += `💬 WhatsApp: ${staff.whatsapp}\n`;
          if (staff.office_location) staffText += `📍 Office: ${staff.office_location}\n`;
          if (staff.office_hours) staffText += `🕒 Hours: ${staff.office_hours}\n`;

          // Show languages if multiple are supported
          if (staff.languages && staff.languages.length > 1) {
            const languages = staff.languages.map(lang =>
              lang.charAt(0).toUpperCase() + lang.slice(1)
            ).join(', ');
            staffText += `🗣️  Languages: ${languages}\n`;
          }

          staffText += '\n---\n\n';
        }

        // Stream staff information
        for (const char of staffText) {
          yield { type: 'chunk', text: char };
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } else {
        // Enhanced fallback for no staff found
        let fallbackText = "\n\nI couldn't find specific staff for this category. ";

        if (!isWithinOfficeHours()) {
          fallbackText += "Since it's outside regular office hours, you may want to try again during business hours (9 AM - 5 PM, Monday-Friday). ";
        }

        if (isUrgent) {
          fallbackText += "For urgent matters, please contact the main college office or emergency helpline. ";
        } else {
          fallbackText += "Please contact the main college administration for assistance. ";
        }

        for (const char of fallbackText) {
          yield { type: 'chunk', text: char };
          await new Promise(resolve => setTimeout(resolve, 15));
        }
      }
    } else {
      const fallbackText = "\n\nPlease contact the main college office for assistance with your query.";
      for (const char of fallbackText) {
        yield { type: 'chunk', text: char };
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    // Offer to raise a ticket — the student confirms via UI before anything is created
    if (student && collegeName) {
      const offerText = `\n\n🎫 Would you like me to raise a support ticket so the admin team follows up on this?`;
      for (const char of offerText) {
        yield { type: 'chunk', text: char };
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      yield { type: 'offer_ticket', category, staffName: staffMembers[0]?.name ?? null };
    }

    const continuityText = "\n\nI'm still here to help with any other questions about your college!";
    for (const char of continuityText) {
      yield { type: 'chunk', text: char };
      await new Promise(resolve => setTimeout(resolve, 15));
    }

    yield { type: 'done', sources: [], hasContext: false, queryLogId: queryLogId ?? null, chunks: [] };

  } catch (error) {
    console.error('Escalation response error:', error);
    yield { type: 'error', error: 'Failed to connect you with staff. Please try again or contact the main office.' };
  }
}

// Enhanced staff fetching with real database integration
async function getStaffFromCategory(
  category: string | null,
  collegeName: string,
  userLanguage?: string,
  isUrgent?: boolean,
  currentTime?: Date,
  request?: Request,
  cookies?: import('astro').AstroCookies,
  searchQuery?: string
): Promise<StaffMember[]> {
  try {
    let supabase;
    if (request && cookies) {
      // Use authenticated server client (respects RLS with user session)
      const { createSupabaseServerClient } = await import('./supabase');
      supabase = createSupabaseServerClient(request, cookies);
    } else {
      // Fallback: direct anon-key client (no request context available)
      const { createSupabaseFallbackClient } = await import('./supabase');
      supabase = createSupabaseFallbackClient();
    }

    // First, try name-based search if the query mentions a specific person
    if (searchQuery) {
      const words = searchQuery.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      // Filter out common words that aren't names
      const stopWords = ['who', 'what', 'where', 'how', 'the', 'about', 'tell', 'can', 'contact', 'staff', 'member', 'talk', 'speak', 'with', 'get', 'touch', 'reach', 'help', 'need', 'want', 'know', 'find', 'details', 'info', 'information', 'available', 'faculty', 'professor', 'teacher', 'charge', 'head', 'manage', 'manager', 'responsible', 'handles', 'person', 'department', 'office', 'officer', 'coordinator', 'dean', 'hod', ...QUERY_CATEGORIES];
      const nameWords = words.filter(w => !stopWords.includes(w));

      if (nameWords.length > 0) {
        // Search for staff matching any of the name words
        const { data: nameMatches } = await supabase
          .from('staff_members')
          .select('name, department, role, email, phone, whatsapp, office_location, office_hours, languages, urgency_level')
          .eq('college_name', collegeName)
          .eq('status', 'active')
          .or(nameWords.map(w => `name.ilike.%${w}%`).join(','));

        if (nameMatches && nameMatches.length > 0) {
          return nameMatches;
        }
      }
    }

    let query = supabase
      .from('staff_members')
      .select('name, department, role, email, phone, whatsapp, office_location, office_hours, languages, urgency_level')
      .eq('college_name', collegeName)
      .eq('status', 'active');

    // Only filter by category if one was detected
    if (category) {
      query = query.contains('query_categories', [category.toLowerCase()]);
    }

    // Language-based filtering
    if (userLanguage && userLanguage !== 'english') {
      query = query.contains('languages', [userLanguage.toLowerCase()]);
    }

    // Urgency-based filtering
    if (isUrgent) {
      query = query.in('urgency_level', ['urgent', 'emergency']);
    }

    const { data: staff, error } = await query
      .order('urgency_level', { ascending: false })
      .order('name')
      .limit(3);

    if (error) {
      console.error('Error fetching staff:', error);
      return [];
    }

    return staff || [];
  } catch (error) {
    console.error('Error in getStaffFromCategory:', error);
    return [];
  }
}

export async function* generateResponseStream(
  query: string,
  context: SearchResult[],
  agentHint?: string,
  history?: Array<{ role: string; content: string }>,
  collegeName?: string,
  request?: Request,
  cookies?: import('astro').AstroCookies,
  student?: { id: string; name: string },
  queryLogId?: string | null,
  profile?: StudentProfile | null,
  analysisParam?: QueryAnalysis,
  queryEmbedding?: number[]
): AsyncGenerator<StreamChunk> {
  const ai = getGeminiClient();
  const analysis = analysisParam || await analyzeQueryIntent(query, history);
  const { intent, language } = analysis;

  // 1. Handling GREETING_INTRODUCTION (Warm greeting + DeskMate introduction + feature overview)
  if (intent === 'GREETING_INTRODUCTION') {
    const studentName = student?.name || 'Student';
    const institution = collegeName || 'your college';
    const greetingPrompt = `You are DeskMate, the official AI-powered student helpdesk assistant for ${institution}.
Student Name: ${studentName}
Language: ${language}

The student has greeted you or asked who you are ("${query}").
Respond warmly and enthusiastically in ${language}:
1. Greet the student by name (${studentName}) with a friendly emoji (e.g. 👋 or 🙏).
2. Introduce yourself clearly: "I am **DeskMate**, your AI college assistant for **${institution}**."
3. Present a neat bulleted overview of how you can help:
   • 📚 **Academics & Exams** — syllabus, exam schedules, hall tickets, revaluation
   • 💳 **Fees & Finance** — tuition fees, deadlines, payment procedures, concessions
   • 🏢 **Hostels & Campus** — room allotment, mess details, library hours & facilities
   • 📢 **Announcements** — latest college circulars, notices & events
   • 👥 **Faculty & Staff** — department contacts, faculty info & office hours
4. Conclude with a friendly invitation asking what they'd like help with today.

Keep the formatting clean with markdown and emojis. Keep it engaging, clear, and student-friendly.`;

    try {
      const stream = await ai.models.generateContentStream({
        model: GENERATION_MODEL,
        contents: [{ role: 'user', parts: [{ text: greetingPrompt }] }],
        config: {
          temperature: 0.7,
          maxOutputTokens: 600,
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) yield { type: 'chunk', text: chunk.text };
      }
    } catch (err: any) {
      console.error('[rag] Greeting generation error, using fallback:', err?.message || err);
      const fallback = `Hello ${studentName}! 👋\n\nI am **DeskMate**, your AI college assistant for **${institution}**.\n\nHere is how I can assist you:\n• 📚 **Academics & Exams** — Syllabus, examination dates, and hall tickets\n• 💳 **Fees & Finance** — Tuition fee structures, deadlines, and receipts\n• 🏢 **Hostels & Campus** — Room allotment, mess menus, and library timings\n• 📢 **Announcements** — Latest circulars, holidays, and campus events\n• 👥 **Faculty & Staff** — Department contacts and administrative office hours\n\nHow can I help you today?`;
      for (const word of fallback.split(' ')) {
        yield { type: 'chunk', text: word + ' ' };
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    yield { type: 'done', sources: [], hasContext: true, queryLogId: queryLogId ?? null, chunks: [] };
    return;
  }

  // 2. Handling CONVERSATIONAL_COURTESY (Thanks, goodbyes, pleasantries)
  if (intent === 'CONVERSATIONAL_COURTESY') {
    const institution = collegeName || 'your college';
    const courtesyPrompt = `You are DeskMate, the official AI assistant for ${institution}.
The student said: "${query}".
Language: ${language}

Respond with brief, polite conversational courtesy in ${language} (e.g. acknowledging thanks, pleasantries like "how are you", or saying goodbye).
Keep it friendly and warm (1-3 sentences max).
Remind them gently that you are always here whenever they have any questions about ${institution}.`;

    try {
      const stream = await ai.models.generateContentStream({
        model: GENERATION_MODEL,
        contents: [{ role: 'user', parts: [{ text: courtesyPrompt }] }],
        config: {
          temperature: 0.6,
          maxOutputTokens: 250,
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) yield { type: 'chunk', text: chunk.text };
      }
    } catch (err: any) {
      console.error('[rag] Courtesy generation error, using fallback:', err?.message || err);
      const fallback = `You're always welcome! Feel free to ask whenever you have questions about your college. 😊`;
      for (const word of fallback.split(' ')) {
        yield { type: 'chunk', text: word + ' ' };
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    yield { type: 'done', sources: [], hasContext: true, queryLogId: queryLogId ?? null, chunks: [] };
    return;
  }

  // 3. Handling OFF_TOPIC (Polite boundary setting)
  if (intent === 'OFF_TOPIC') {
    const institution = collegeName || 'your college';
    const boundaryPrompt = `You are DeskMate, the official AI assistant for ${institution}.
The student asked an off-topic question: "${query}".
Language: ${language}

Respond politely with conversational courtesy in ${language}:
1. Politely explain that as DeskMate, your specialty is dedicated to assisting students with **${institution}** academics, admissions, fees, hostel, campus services, and official policies.
2. Politely decline to answer unrelated general topics (like general coding, trivia, entertainment, etc.).
3. Suggest 2-3 examples of college-related queries they can ask instead (e.g. fee deadlines, exam timetables, hostel rules, staff contacts).
Keep the tone welcoming, polite, and helpful.`;

    try {
      const stream = await ai.models.generateContentStream({
        model: GENERATION_MODEL,
        contents: [{ role: 'user', parts: [{ text: boundaryPrompt }] }],
        config: {
          temperature: 0.4,
          maxOutputTokens: 350,
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) yield { type: 'chunk', text: chunk.text };
      }
    } catch (err: any) {
      console.error('[rag] Off-topic boundary error, using fallback:', err?.message || err);
      const fallback = `I'm designed specifically to assist you with information about **${institution}** (such as courses, fee payments, exam schedules, hostel facilities, and staff contacts). Please feel free to ask any college-related questions!`;
      for (const word of fallback.split(' ')) {
        yield { type: 'chunk', text: word + ' ' };
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    yield { type: 'done', sources: [], hasContext: true, queryLogId: queryLogId ?? null, chunks: [] };
    return;
  }

  // 4. Fetch active announcements (for COLLEGE_QUERY and EXPLICIT_ESCALATION)
  let announcementsBlock = "";
  let announcementCount = 0;
  if (collegeName && request && cookies) {
    try {
      const { createSupabaseServerClient } = await import('./supabase');
      const supabase = createSupabaseServerClient(request, cookies);
      const nowIso = new Date().toISOString();
      const { data: announcements } = await supabase
        .from('announcements')
        .select('title, body, category, expires_at, created_at')
        .eq('college_name', collegeName)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (announcements && announcements.length > 0) {
        announcementCount = announcements.length;
        announcementsBlock = "\n--- ACTIVE COLLEGE ANNOUNCEMENTS ---\n";
        for (const a of announcements) {
          const posted = new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          announcementsBlock += `\n[Announcement | ${a.category} | Posted ${posted}]\n${a.title}\n${a.body}\n`;
        }
        announcementsBlock += "\n--- END OF ANNOUNCEMENTS ---\n";
      }
    } catch (annErr) {
      console.error('Announcements fetch failed (non-fatal):', annErr);
    }
  }

  // 5. Escalation Check
  const escalationCheck = shouldEscalate(intent, query, context.length);
  const answerFromAnnouncements = escalationCheck.reason === 'knowledge_gap' && announcementCount > 0;

  // The query log was inserted before announcements were fetched, so a
  // knowledge-gap query answered from announcements is logged as escalated.
  // Correct the row so analytics escalation % stays accurate (non-fatal).
  if (answerFromAnnouncements && queryLogId && request && cookies) {
    try {
      const { createSupabaseServerClient } = await import('./supabase');
      const supabase = createSupabaseServerClient(request, cookies);
      await supabase
        .from('query_logs')
        .update({ escalated: false, escalation_reason: null })
        .eq('id', queryLogId);
    } catch (logErr) {
      console.error('Query log escalation correction failed (non-fatal):', logErr);
    }
  }

  if (escalationCheck.shouldEscalate && !answerFromAnnouncements) {
    // Generate enhanced escalation response
    yield* generateEscalationResponse(
      query,
      escalationCheck.reason,
      collegeName,
      escalationCheck.isUrgent,
      escalationCheck.language,
      request,
      cookies,
      student,
      queryLogId
    );
    return;
  }

  // 6. Normal College Query RAG Generation
  const hasContext = context.length > 0;
  let contextBlock = "";
  if (hasContext) {
    contextBlock = "\n\n--- RETRIEVED COLLEGE DOCUMENTS ---\n";
    context.forEach((chunk) => {
      contextBlock += `\n[Source: ${chunk.document_name} | Category: ${chunk.document_category}]\n${chunk.content}\n`;
    });
    contextBlock += "\n--- END OF DOCUMENTS ---\n";
  } else {
    contextBlock = "\n\n[No relevant documents found in the knowledge base for this query.]\n";
  }

  contextBlock += buildProfileBlock(student?.name, profile);
  contextBlock += announcementsBlock;

  let userPrompt = query;
  if (agentHint && agentHint !== "general") {
    userPrompt = `[Student is asking in the context of: ${agentHint}]\n\n${query}`;
  }

  // Build multi-turn contents from conversation history
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (history && history.length > 0) {
    for (const msg of history) {
      const geminiRole = msg.role === "assistant" ? "model" : "user";
      contents.push({
        role: geminiRole as "user" | "model",
        parts: [{ text: msg.content }],
      });
    }
  }

  // 6. Check Semantic Cache
  if (queryEmbedding && collegeName && !escalationCheck.shouldEscalate) {
    const { querySemanticCache } = await import('./pinecone');
    const cachedAnswer = await querySemanticCache(queryEmbedding, collegeName, 0.98);
    if (cachedAnswer) {
      yield { type: 'chunk', text: cachedAnswer };
      yield { type: 'done', sources: [], hasContext: true, queryLogId: queryLogId ?? null, chunks: [] };
      return;
    }
  }

  // Current user message with RAG context
  contents.push({
    role: "user",
    parts: [{ text: contextBlock + "\n\nStudent question: " + userPrompt }],
  });

  const responseStream = await ai.models.generateContentStream({
    model: GENERATION_MODEL,
    contents,
    config: {
      tools: AGENT_TOOLS as any,
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.5,
      maxOutputTokens: 1024,
    },
  });

  let fullAnswer = "";

  for await (const chunk of responseStream) {
    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
      for (const call of chunk.functionCalls) {
        if (call.name === "create_ticket") {
          const args = call.args as any;
          if (request && cookies && student) {
            try {
              const { createSupabaseServerClient } = await import('./supabase');
              const supabase = createSupabaseServerClient(request, cookies);
              await supabase.from('escalation_tickets').insert({
                college_name: collegeName || 'Unknown',
                student_id: student.id,
                student_name: student.name,
                query: args.subject,
                category: args.department
              });
            } catch (e) {
              console.error("Failed to create ticket via tool:", e);
            }
          }
          yield { type: 'chunk', text: `\n\n✅ Created a ${args.urgency} priority support ticket for the **${args.department}** department regarding "${args.subject}". Our staff will look into it shortly.` };
        }
      }
      break; // End the stream once tool is handled
    }
    
    if (chunk.text) {
      fullAnswer += chunk.text;
      yield { type: 'chunk', text: chunk.text };
    }
  }

  // Only cite documents that were genuinely relevant to this answer.
  // Vector search can return up to 5 loosely-related chunks; citing every
  // one of them makes it look like the whole library was consulted.
  const relevantContext = filterCitableChunks(context);

  const sourceNames = [...new Set(relevantContext.map((c) => c.document_name))].slice(0, 3);

  // Resolve document ids + file links so the client can deep-link citation badges.
  // The storage bucket is private, so we hand out our authenticated proxy route
  // rather than the stored (unusable) public URL. Non-fatal on lookup failure.
  let hasFileById = new Set<string>();
  const docIds = [...new Set(relevantContext.map((c) => c.document_id))];
  if (docIds.length > 0 && request && cookies) {
    try {
      const { createSupabaseServerClient } = await import('./supabase');
      const supabase = createSupabaseServerClient(request, cookies);
      const { data: docs } = await supabase
        .from('documents')
        .select('id, file_url')
        .in('id', docIds);
      if (docs) {
        hasFileById = new Set(docs.filter((d) => d.file_url).map((d) => d.id));
      }
    } catch (srcErr) {
      console.error('Source file link fetch failed (non-fatal):', srcErr);
    }
  }

  const sources = sourceNames.map((name) => {
    const match = relevantContext.find((c) => c.document_name === name);
    return {
      documentName: name,
      category: match?.document_category ?? "General",
      documentId: match?.document_id,
      fileUrl:
        match && hasFileById.has(match.document_id)
          ? `/api/documents/${match.document_id}/file`
          : null,
    };
  });

  // Retrieval transparency: expose the actual chunks used (trimmed) for the sources panel
  const usedChunks = relevantContext.map((c) => ({
    documentName: c.document_name,
    snippet: c.content.length > 220 ? c.content.slice(0, 220).trim() + "…" : c.content,
    similarity: Math.round(c.similarity * 100) / 100,
  }));

  yield { type: 'done', sources, hasContext, queryLogId: queryLogId ?? null, chunks: usedChunks };
  
  if (queryEmbedding && fullAnswer && collegeName && !escalationCheck.shouldEscalate) {
    const { upsertSemanticCache } = await import('./pinecone');
    upsertSemanticCache(query, queryEmbedding, fullAnswer, collegeName).catch(console.error);
  }
}

// ─── 5b. Non-streaming Response (kept for reference) ────────

export async function generateResponse(
  query: string,
  context: SearchResult[],
  agentHint?: string
): Promise<RAGResponse> {
  const ai = getGeminiClient();
  const hasContext = context.length > 0;

  let contextBlock = "";
  if (hasContext) {
    contextBlock = "\n\n--- RETRIEVED COLLEGE DOCUMENTS ---\n";
    context.forEach((chunk) => {
      contextBlock += `\n[Source: ${chunk.document_name} | Category: ${chunk.document_category}]\n${chunk.content}\n`;
    });
    contextBlock += "\n--- END OF DOCUMENTS ---\n";
  } else {
    contextBlock =
      "\n\n[No relevant documents found in the knowledge base for this query.]\n";
  }

  let userPrompt = query;
  if (agentHint && agentHint !== "general") {
    userPrompt = `[Student is asking in the context of: ${agentHint}]\n\n${query}`;
  }

  const response = await retryGeminiCall(async () => {
    return await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: contextBlock + "\n\nStudent question: " + userPrompt },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 1024,
      },
    });
  });

  const answer =
    response.text ??
    "I'm sorry, I couldn't generate a response. Please try again.";

  // Same relevance filter as the streaming path — only cite documents
  // above the absolute floor and close to the best match, capped at 3.
  const relevantContext = filterCitableChunks(context);

  const sourceNames = [...new Set(relevantContext.map((c) => c.document_name))].slice(0, 3);
  const sources = sourceNames.map((name) => {
    const match = relevantContext.find((c) => c.document_name === name);
    return {
      documentName: name,
      category: match?.document_category ?? "General",
    };
  });

  return { answer, sources, hasContext };
}
