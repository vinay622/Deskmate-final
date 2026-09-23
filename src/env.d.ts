/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    userRole: "student" | "admin" | null;
    userName: string | null;
    collegeName: string | null;
    approvalStatus: string | null;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly GEMINI_API_KEY: string;
  readonly PINECONE_API_KEY: string;
  readonly PINECONE_INDEX: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
