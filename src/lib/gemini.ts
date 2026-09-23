import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = import.meta.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export const EMBEDDING_MODEL = "embedding-001";
export const GENERATION_MODEL = "gemini-2.5-flash";

export const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "create_ticket",
        description: "Create a support ticket or escalation for the student.",
        parameters: {
          type: "OBJECT",
          properties: {
            subject: {
              type: "STRING",
              description: "The subject or title of the ticket (e.g., 'Fee payment issue')",
            },
            department: {
              type: "STRING",
              description: "The department this belongs to (e.g., 'Finance', 'Academics', 'Hostel')",
            },
            urgency: {
              type: "STRING",
              description: "The urgency level (e.g., 'low', 'medium', 'high')",
            },
          },
          required: ["subject", "department", "urgency"],
        },
      },
    ],
  },
];
