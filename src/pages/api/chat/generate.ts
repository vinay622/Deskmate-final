import type { APIRoute } from 'astro';
import {
  analyzeQueryIntent,
  embedSingleText,
  searchChunks,
  generateResponseStream,
  shouldEscalate,
} from '../../../lib/rag';
import type { SearchResult, StudentProfile } from '../../../lib/rag';
import { createSupabaseServerClient } from '../../../lib/supabase';

const RATE_LIMIT_MAX = 20;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  // 1. Rate Limiting via Supabase
  const { count: queryCount } = await supabase
    .from('query_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', locals.user.id)
    .gte('created_at', new Date(Date.now() - 60000).toISOString());

  if (queryCount !== null && queryCount >= RATE_LIMIT_MAX) {
    return new Response(
      JSON.stringify({ ok: false, error: 'You are sending messages too quickly. Please wait a moment and try again.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = (body.query as string)?.trim();
  const agent = (body.agent as string) || 'general';
  const sessionId = (body.session_id as string) || null;

  if (!query) {
    return new Response(JSON.stringify({ ok: false, error: 'query is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Fetch history securely from DB
  let history: Array<{ role: string; content: string }> = [];
  if (sessionId) {
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(11);
    
    if (messages) {
      history = messages
        .reverse()
        // The last message is likely the current user query (saved just before this call)
        .filter(m => m.content !== query)
        .map(m => ({ role: m.role, content: m.content }));
    }
  }

  // 1. Semantic intent analysis & intelligent query rewriting
  const analysis = await analyzeQueryIntent(query, history);

  // 2. Fetch the student's profile for personalization (only for college queries)
  let profile: StudentProfile | null = null;
  if (locals.userRole !== 'admin' && analysis.intent === 'COLLEGE_QUERY') {
    try {
      const { data: p } = await supabase
        .from('profiles')
        .select('degree_program, department, year, hosteller')
        .eq('id', locals.user.id)
        .single();
      if (p) {
        profile = {
          degreeProgram: p.degree_program ?? null,
          department: p.department ?? null,
          year: p.year ?? null,
          hosteller: p.hosteller ?? null,
        };
      }
    } catch (profErr: any) {
      console.error('Profile fetch failed (non-fatal):', profErr?.message || profErr);
    }
  }

  // 3. Conditional Pinecone vector search (only when needed for college query retrieval)
  let chunks: SearchResult[] = [];
  let queryEmbedding: number[] | undefined;
  if (analysis.requiresVectorSearch) {
    const profileTerms = profile
      ? [
          profile.degreeProgram,
          profile.department,
          profile.year != null ? `year ${profile.year}` : null,
          profile.hosteller ? 'hostel' : null,
        ].filter(Boolean).join(' ')
      : '';

    try {
      queryEmbedding = await embedSingleText(
        profileTerms ? `${analysis.rewritten} ${profileTerms}` : analysis.rewritten
      );
      // Flaw 2: Fetch 30 chunks instead of 5 to allow post-search filtering without truncation
      chunks = await searchChunks(queryEmbedding, 0.45, 30, locals.collegeName ?? undefined);
    } catch (embErr: any) {
      console.error('Embedding/search error (continuing without context):', embErr?.message || embErr);
    }
  }

  // 3b. Post-filter: drop chunks sourced from expired or failed documents
  if (chunks.length > 0) {
    try {
      const docIds = [...new Set(chunks.map((c) => c.document_id))];
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, expiry_date, processing_status')
        .in('id', docIds);
      
      // Flaw 3: Fail-closed on security/authorization logic error
      if (docsError) {
        throw new Error(docsError.message);
      }

      if (docs) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const liveDocIds = new Set(
          docs
            .filter((d) => {
              if (d.processing_status === 'failed') return false;
              if (!d.expiry_date) return true;
              return new Date(`${d.expiry_date}T00:00:00`) >= today;
            })
            .map((d) => d.id)
        );
        // Retain only top 5 active chunks
        chunks = chunks.filter((c) => liveDocIds.has(c.document_id)).slice(0, 5);
      }
    } catch (filterErr: any) {
      console.error('Document expiry filter failed:', filterErr?.message || filterErr);
      return new Response(JSON.stringify({ ok: false, error: 'Internal server error while checking document authorization.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 4. Escalation check
  const escalationCheck = shouldEscalate(analysis.intent, query, chunks.length);

  // 5. Log the query for analytics
  let queryLogId: string | null = null;
  const isConversational =
    analysis.intent === 'GREETING_INTRODUCTION' ||
    analysis.intent === 'CONVERSATIONAL_COURTESY' ||
    analysis.intent === 'OFF_TOPIC';

  try {
    const { data: log, error: logError } = await supabase
      .from('query_logs')
      .insert({
        college_name: locals.collegeName ?? '',
        user_id: locals.user.id,
        session_id: sessionId,
        query,
        rewritten_query: analysis.rewritten !== query ? analysis.rewritten : null,
        agent,
        language: analysis.language,
        had_context: isConversational ? true : chunks.length > 0,
        top_similarity: chunks[0]?.similarity ?? null,
        escalated: escalationCheck.shouldEscalate,
        escalation_reason: escalationCheck.shouldEscalate ? escalationCheck.reason : null,
        category: analysis.category ?? 'general',
      })
      .select('id')
      .single();
    if (logError) {
      console.error('[query-log] insert failed (non-fatal):', logError.message, logError.details ?? '');
    }
    queryLogId = log?.id ?? null;
  } catch (logErr: any) {
    console.error('Query log insert failed (non-fatal):', logErr?.message || logErr);
  }

  const student = {
    id: locals.user.id,
    name: locals.userName ?? locals.user.email ?? 'Student',
  };

  // 6. Stream the Gemini response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generateResponseStream(
          query,
          chunks,
          agent,
          history,
          locals.collegeName ?? undefined,
          request,
          cookies,
          student,
          queryLogId,
          profile,
          analysis,
          queryEmbedding
        )) {
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
        }
      } catch (err: any) {
        console.error('Stream generation error:', err);
        const errChunk = { type: 'error', error: err?.message || 'Unknown error' };
        controller.enqueue(encoder.encode(JSON.stringify(errChunk) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
};
