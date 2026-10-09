/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    userRole: "student" | "staff" | "admin" | null;
    userName: string | null;
    collegeName: string | null;
    approvalStatus: string | null;
    isActive?: boolean;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly GEMINI_API_KEY: string;
  readonly PINECONE_API_KEY: string;
  readonly PINECONE_INDEX: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly SMTP_HOST?: string;
  readonly SMTP_PORT?: string;
  readonly SMTP_USER?: string;
  readonly SMTP_PASS?: string;
  readonly GMAIL_USER?: string;
  readonly GMAIL_APP_PASSWORD?: string;
  readonly SMTP_FROM_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
