# DeskMate — Complete Technical Q&A Documentation

> This document explains **every technical detail** of the DeskMate codebase — how the frontend and backend connect, where routing logic lives, how authentication works, how the AI chat pipeline operates, and where to find every piece of code. Written in a Question & Answer format so you can explain any part of the system to others.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Configuration](#2-tech-stack--configuration)
3. [Project Structure](#3-project-structure)
4. [Routing & Navigation](#4-routing--navigation)
5. [Layouts & Page Rendering](#5-layouts--page-rendering)
6. [Authentication System](#6-authentication-system)
7. [Middleware & Route Protection](#7-middleware--route-protection)
8. [Supabase Integration](#8-supabase-integration)
9. [Database Schema](#9-database-schema)
10. [Chat System & UI](#10-chat-system--ui)
11. [RAG Pipeline (AI Core)](#11-rag-pipeline-ai-core)
12. [Pinecone Vector Search](#12-pinecone-vector-search)
13. [Google Gemini Integration](#13-google-gemini-integration)
14. [Document Upload & Processing](#14-document-upload--processing)
15. [Staff Escalation System](#15-staff-escalation-system)
16. [Admin Dashboard](#16-admin-dashboard)
17. [Multi-Tenancy (College Scoping)](#17-multi-tenancy-college-scoping)
18. [Frontend Components](#18-frontend-components)
19. [Streaming Responses](#19-streaming-responses)
20. [Blog / Articles System](#20-blog--articles-system)
21. [Styling & Design System](#21-styling--design-system)
22. [Deployment](#22-deployment)
23. [Verified Signup & Approval Flow](#23-verified-signup--approval-flow)
24. [Announcements System](#24-announcements-system)
25. [Escalation Tickets & Analytics](#25-escalation-tickets--analytics)
26. [Student Profiles & Personalization](#26-student-profiles--personalization)
27. [Hardening: Expiry Filter & Rate Limiting](#27-hardening-expiry-filter--rate-limiting)

---

## 1. Project Overview

### Q: What is DeskMate?
**A:** DeskMate is an **AI-powered College Query Assistant**. Colleges upload official documents (PDFs, DOCX, TXT, images), and students can ask questions in English, Hindi, or Telugu. The system uses **RAG (Retrieval-Augmented Generation)** with Pinecone vector search and Google Gemini to answer from those documents with exact source citations. When the AI cannot answer, it routes students to the appropriate staff member.

### Q: What was the original codebase?
**A:** The project was built on top of a "Positivus" Astro marketing theme (originally for a digital marketing agency). The template's pages like `/pricing` and `/services` still exist but are redirected to `/`. Blog content and some marketing sections remain as artifacts.

---

## 2. Tech Stack & Configuration

### Q: What framework does this project use?
**A:** **Astro 5.x** in **SSR (Server-Side Rendering) mode** (`output: 'server'` in `astro.config.mjs:12`). This means every page is rendered on the server per-request, which is critical for auth checks and dynamic data fetching.

**File:** `astro.config.mjs`
```js
export default defineConfig({
  output: 'server',       // Line 12 — full SSR
  adapter: vercel(),      // Line 13 — deployed to Vercel
  integrations: [tailwind()],
  redirects: {
    '/chat': '/app/chat', // Line 15
    '/pricing': '/',      // Line 16
    '/services': '/',     // Line 17
  },
});
```

### Q: What are the key dependencies?
**A:** Listed in `package.json`:

| Dependency | Purpose |
|---|---|
| `astro@^5.0.9` | Web framework (SSR) |
| `@astrojs/vercel` | Vercel deployment adapter |
| `@astrojs/tailwind` | Tailwind CSS integration |
| `@supabase/supabase-js` + `@supabase/ssr` | Auth, database, storage |
| `@google/genai` | Google Gemini AI (generation + image OCR) |
| `@pinecone-database/pinecone` | Vector database for embeddings |
| `pdf-parse` | PDF text extraction |
| `mammoth` | DOCX text extraction |
| `swiper` | Testimonial carousel |
| `lenis` | Smooth scrolling |
| `astro-navbar` | Responsive navbar component |

### Q: Where are environment variables configured?
**A:** In the `.env` file at the project root. Five variables are required:

| Variable | Purpose |
|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `PINECONE_API_KEY` | Pinecone vector DB key |
| `PINECONE_INDEX` | Pinecone index name (`deskmate`) |

Variables prefixed with `PUBLIC_` are accessible on both client and server in Astro. Non-prefixed ones are server-only.

### Q: What does the TypeScript configuration look like?
**A:** `tsconfig.json` extends Astro's strict config. It sets a path alias `@/*` → `src/*` for cleaner imports, and uses `react-jsx` for JSX handling.

### Q: Why are some libraries listed in `vite.ssr.external`?
**A:** In `astro.config.mjs:19-23`, heavy server-only packages (`pdf-parse`, `mammoth`, `@pinecone-database/pinecone`, `@google/genai`) are marked as external. This tells Vite **not** to bundle them — they get loaded via Node.js `require()` at runtime. This prevents build errors, reduces bundle size, and avoids conflicts with Node-specific APIs.

---

## 3. Project Structure

### Q: What is the overall file organization?
**A:**
```
Positivus/
├── .env                          # Environment variables
├── astro.config.mjs              # Astro configuration
├── tailwind.config.mjs           # Tailwind CSS config
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies
│
├── public/                       # Static assets (served as-is)
│   ├── Logo.svg, favicon.svg
│   └── fonts/grotesk/            # SpaceGrotesk font files
│
├── supabase/migrations/          # 6 SQL migration files (database schema)
│
├── src/
│   ├── middleware.ts              # Auth middleware (runs on every request)
│   ├── env.d.ts                  # TypeScript type declarations
│   │
│   ├── lib/                      # Core backend logic
│   │   ├── supabase.ts           # Supabase client factory (3 client types)
│   │   ├── gemini.ts             # Google Gemini client singleton
│   │   ├── pinecone.ts           # Pinecone client, embeddings, upsert, query
│   │   └── rag.ts                # Full RAG pipeline (extract, chunk, embed, search, generate, escalate)
│   │
│   ├── layouts/                  # Page layout wrappers
│   │   ├── MainLayout.astro      # Full layout (Navbar + Footer + smooth scroll)
│   │   ├── AuthLayout.astro      # Minimal layout (no Navbar/Footer, dark bg)
│   │   └── MainHead.astro        # Shared <head> element
│   │
│   ├── pages/                    # File-based routing
│   │   ├── index.astro           # Landing page (/)
│   │   ├── about.astro           # About page (/about)
│   │   ├── login.astro           # Login page (/login)
│   │   ├── signup.astro          # Signup page (/signup)
│   │   ├── 404.astro             # 404 error page
│   │   ├── app/
│   │   │   ├── index.astro       # Redirects to /app/chat
│   │   │   ├── chat.astro        # Chat interface (/app/chat)
│   │   │   └── admin/
│   │   │       ├── index.astro   # Admin dashboard (/app/admin)
│   │   │       ├── documents.astro  # Document management
│   │   │       └── staff.astro   # Staff management
│   │   ├── api/                  # API endpoints
│   │   │   ├── auth/             # login.ts, signup.ts, logout.ts
│   │   │   ├── chat/             # generate.ts, sessions.ts, messages/[sessionId].ts
│   │   │   ├── admin/            # documents.ts, documents/[id].ts, staff.ts, staff/[id].ts
│   │   │   └── staff/route.ts    # Staff routing for escalation
│   │   └── articles/             # Blog pages
│   │
│   ├── components/               # Reusable UI components
│   │   ├── admin/                # DocumentCard, StaffCard
│   │   ├── chat/                 # ChatInterface, MessageBubble
│   │   ├── sections/             # Hero, Services, Testimonials, etc.
│   │   ├── seo/                  # SEO meta tags
│   │   └── ui/                   # Navbar, Footer, Accordion, Cards, etc.
│   │
│   ├── content/                  # Astro Content Collections (blog posts)
│   ├── data/                     # JSON data files (testimonials, demo data)
│   ├── styles/global.css         # Global CSS + Tailwind base
│   ├── assets/                   # SVG icons, PNG images
│   └── utils/                    # Helpers (chatLogic, jsonLD, lenis, slugify)
```

---

## 4. Routing & Navigation

### Q: How does routing work in Astro?
**A:** Astro uses **file-based routing**. Every `.astro` or `.ts` file in `src/pages/` automatically becomes a route:
- `src/pages/index.astro` → `/`
- `src/pages/about.astro` → `/about`
- `src/pages/app/chat.astro` → `/app/chat`
- `src/pages/api/auth/login.ts` → `POST /api/auth/login`
- `src/pages/articles/[...slug].astro` → `/articles/any-slug-here` (dynamic catch-all route)

### Q: When I click "Home" in the navbar, how does the page open?
**A:** The Navbar component is in `src/components/ui/Navbar.astro`. It renders standard `<a>` anchor tags with `href` attributes. When you click "Home" (`href="/"`), the browser sends a GET request to `/`, and Astro's server renders `src/pages/index.astro` and returns the HTML.

**Navbar links (from `src/components/ui/Navbar.astro`):**
```html
<a href="/">Home</a>
<a href="/#features">Features</a>
<a href="/#how-it-works">How It Works</a>
<a href="/about">About</a>
```

The `/#features` and `/#how-it-works` links are **anchor links** — they navigate to the homepage and scroll to the element with `id="features"` or `id="how-it-works"`. These sections exist in `src/pages/index.astro`.

### Q: How does the navbar know if the user is logged in? How does it show different buttons?
**A:** The Navbar is **server-rendered**. It reads authentication state from `Astro.locals`, which is populated by the middleware on every request.

**File:** `src/components/ui/Navbar.astro`
```astro
---
const user = Astro.locals.user;
const userRole = Astro.locals.userRole;
const userName = Astro.locals.userName;
const isAdmin = userRole === 'admin';
---
```

Based on these values, it conditionally renders:
- **Not logged in**: "Sign In" + "Sign Up Free" buttons
- **Logged in (student)**: "Hi, {firstName}" greeting + "Open App" button
- **Logged in (admin)**: "Hi, {firstName}" greeting + "Admin Dashboard" + "Open Chat" buttons
- **On `/app/*` pages**: Simplified UI with just "Admin Dashboard" (if admin) + "Open Chat"

### Q: How does the mobile hamburger menu work?
**A:** The Navbar uses the `astro-navbar` package which provides `<Astronav>`, `<MenuItems>`, and `<MenuIcon>` components. The hamburger toggle is handled by inline JavaScript:

**File:** `src/components/ui/Navbar.astro` (inline `<script is:inline>`)
- Clicking the hamburger button (`#astronav-menu`) toggles the `hidden` class on the menu container
- Each link with `data-close-menu="true"` closes the menu on click
- On mobile, the menu slides down as a full-width dropdown

### Q: What are the URL redirects configured in the project?
**A:** Defined in `astro.config.mjs:14-18`:

| From | To | Reason |
|---|---|---|
| `/chat` | `/app/chat` | Convenience shortcut |
| `/pricing` | `/` | Original theme route, no longer used |
| `/services` | `/` | Original theme route, no longer used |

Additionally, `src/pages/app/index.astro` uses `Astro.redirect('/app/chat')` to redirect `/app` → `/app/chat`.

### Q: What is the complete route map?
**A:**

| Route | File | Purpose | Auth Required |
|---|---|---|---|
| `/` | `src/pages/index.astro` | Landing page | No |
| `/about` | `src/pages/about.astro` | About page | No |
| `/login` | `src/pages/login.astro` | Login form | No |
| `/signup` | `src/pages/signup.astro` | Registration form | No |
| `/404` | `src/pages/404.astro` | Error page | No |
| `/articles` | `src/pages/articles/index.astro` | Blog listing | No |
| `/articles/{slug}` | `src/pages/articles/[...slug].astro` | Blog post | No |
| `/articles/search` | `src/pages/articles/search.astro` | Blog search | No |
| `/articles/tag/{tag}` | `src/pages/articles/tag/[...tag].astro` | Blog filter | No |
| `/app/chat` | `src/pages/app/chat.astro` | Chat interface | Yes (any) |
| `/app/admin` | `src/pages/app/admin/index.astro` | Admin dashboard | Yes (admin) |
| `/app/admin/documents` | `src/pages/app/admin/documents.astro` | Document management | Yes (admin) |
| `/app/admin/staff` | `src/pages/app/admin/staff.astro` | Staff management | Yes (admin) |
| `POST /api/auth/login` | `src/pages/api/auth/login.ts` | Login API | No |
| `POST /api/auth/signup` | `src/pages/api/auth/signup.ts` | Signup API | No |
| `POST /api/auth/logout` | `src/pages/api/auth/logout.ts` | Logout API | No |
| `POST /api/chat/generate` | `src/pages/api/chat/generate.ts` | RAG chat query | Yes |
| `GET/POST /api/chat/sessions` | `src/pages/api/chat/sessions.ts` | Session CRUD | Yes |
| `GET/POST /api/chat/messages/{id}` | `src/pages/api/chat/messages/[sessionId].ts` | Message CRUD | Yes |
| `POST /api/admin/documents` | `src/pages/api/admin/documents.ts` | Upload document | Yes (admin) |
| `DELETE /api/admin/documents/{id}` | `src/pages/api/admin/documents/[id].ts` | Delete document | Yes (admin) |
| `GET/POST /api/admin/staff` | `src/pages/api/admin/staff.ts` | Staff CRUD | Yes (admin) |
| `DELETE /api/admin/staff/{id}` | `src/pages/api/admin/staff/[id].ts` | Delete staff | Yes (admin) |
| `GET /api/staff/route` | `src/pages/api/staff/route.ts` | Staff lookup for escalation | Yes |
| `/pending` | `src/pages/pending.astro` | Awaiting-approval page for students | Yes (unapproved student) |
| `/app/admin/analytics` | `src/pages/app/admin/analytics.astro` | Query analytics dashboard | Yes (admin) |
| `/app/admin/announcements` | `src/pages/app/admin/announcements.astro` | Announcement management | Yes (admin) |
| `/app/admin/students` | `src/pages/app/admin/students.astro` | Student approval management | Yes (admin) |
| `/app/admin/tickets` | `src/pages/app/admin/tickets.astro` | Escalation ticket queue | Yes (admin) |
| `GET/POST /api/announcements` | `src/pages/api/announcements.ts` | List/create announcements (college-scoped) | Yes |
| `GET/POST /api/tickets` | `src/pages/api/tickets.ts` | Student escalation tickets | Yes |
| `GET/POST /api/profile` | `src/pages/api/profile.ts` | Student profile fields read/update | Yes |
| `POST /api/chat/feedback` | `src/pages/api/chat/feedback.ts` | 👍/👎 feedback on answers | Yes |
| `PATCH /api/admin/analytics/{id}` | `src/pages/api/admin/analytics/[id].ts` | Mark knowledge gaps reviewed | Yes (admin) |
| `GET/POST /api/admin/announcements`, `DELETE/PATCH .../[id]` | `src/pages/api/admin/announcements*` | Announcement CRUD | Yes (admin) |
| `POST /api/admin/students/{id}` | `src/pages/api/admin/students/[id].ts` | Approve/reject student | Yes (admin) |
| `PATCH /api/admin/tickets/{id}` | `src/pages/api/admin/tickets/[id].ts` | Update ticket status/note | Yes (admin) |
| `GET/DELETE /api/chat/sessions/{id}` | `src/pages/api/chat/sessions/[id].ts` | Rename/delete chat session | Yes |

---

## 5. Layouts & Page Rendering

### Q: What are the different layouts and when is each used?
**A:** There are three layouts:

**1. `MainLayout.astro` (`src/layouts/MainLayout.astro`)**
- Used by: Landing page, About, Admin dashboard, Admin pages, Blog pages, 404
- Includes: Navbar (top) + `<slot />` (page content) + Footer (bottom) + Lenis smooth scrolling
- Wraps content in the full site chrome

**2. `AuthLayout.astro` (`src/layouts/AuthLayout.astro`)**
- Used by: Login, Signup, Chat
- Includes: Only `<MainHead>` (SEO/meta) + `<slot />`
- No Navbar or Footer — provides a clean, distraction-free UI with `bg-dark` background

**3. `MainHead.astro` (`src/layouts/MainHead.astro`)**
- Not used directly as a layout — it's the shared `<head>` element
- Both `MainLayout` and `AuthLayout` import it
- Handles: charset, viewport, favicon, title, description, SEO component

### Q: How does `<slot />` work?
**A:** In Astro, `<slot />` is a placeholder inside a layout or component where child content is inserted. When a page says `<MainLayout>...content...</MainLayout>`, the `...content...` replaces the `<slot />` inside `MainLayout.astro`.

### Q: How does smooth scrolling work?
**A:** The `MainLayout` imports `src/utils/lenis.js`, which initializes the **Lenis** smooth scrolling library. Lenis intercepts native scroll events and animates them for a smoother feel. It runs via `requestAnimationFrame` loop. This only applies to pages using `MainLayout` (not the chat or auth pages).

---

## 6. Authentication System

### Q: How does user signup work, step by step?
**A:** The signup flow spans three files:

**Step 1: User fills the form**
**File:** `src/pages/signup.astro` (inline `<script>`)
- User enters: first name, last name, email, college (dropdown with 40+ colleges), password, confirm password
- If role is "Admin", an "Admin Access Code" field appears
- Client-side JS validates: password strength (8+ chars, has number, has uppercase, has special char), password match, terms acceptance

**Step 2: Form submits to API**
The client-side JS sends a `fetch` POST to `/api/auth/signup` with all form fields as `FormData`.

**Step 3: API processes the signup**
**File:** `src/pages/api/auth/signup.ts`

```
Line 14: Validate all required fields (firstName, lastName, email, password, college)
Line 21: Check password >= 8 chars
Line 31-65: If role is admin:
  - Line 39-43: Query `admin_access_codes` table for the code
  - Line 45-50: Fail if code doesn't exist
  - Line 52-57: Fail if code already used
  - Line 59-64: Fail if code's college doesn't match selected college
Line 70-80: Create auth user via `supabase.auth.signUp()` with metadata
Line 92-101: If admin, mark the access code as used in the database
Line 103: Return redirect URL (/app/admin for admins, /app/chat for students)
```

**Step 4: Database trigger creates profile**
When Supabase creates a new auth user, a PostgreSQL trigger (`handle_new_user`) defined in `supabase/migrations/20260305000000_auth_setup.sql` automatically creates a row in the `profiles` table with the user's `role`, `full_name`, and `college_name` from the auth metadata.

**Step 5: Client redirects**
The client-side JS receives the success response and redirects to the URL returned by the API.

### Q: How does login work?
**A:**

**File:** `src/pages/login.astro` (inline `<script>`)
1. User enters email and password
2. JS sends `fetch` POST to `/api/auth/login` with FormData

**File:** `src/pages/api/auth/login.ts`
1. Line 5-6: Extract email, password, and optional `next` redirect URL
2. Line 8-17: Call `supabase.auth.signInWithPassword({ email, password })`
3. Line 19-23: Supabase sets session cookies automatically (via the server client)
4. Line 25-30: Fetch user's role from `profiles` table
5. Line 32-39: Determine redirect: admin → `/app/admin`, student → `/app/chat` (or the `next` URL if provided)

### Q: How does logout work?
**A:**
**File:** `src/pages/api/auth/logout.ts`
1. Creates a Supabase server client
2. Calls `supabase.auth.signOut()` — this clears the session cookies
3. Redirects to `/login`

The logout is triggered from the chat sidebar UI, which has a `<form method="POST" action="/api/auth/logout">` submit button.

### Q: What is the admin access code system?
**A:** Admin access codes are **pre-seeded** in the database (see `supabase/migrations/20260305040000_college_scoping.sql`). There are 41 codes, one per college. Each code:
- Is an 8-character alphanumeric string (e.g., `A9K3T7Q2`)
- Is tied to a specific `college_name`
- Can only be used **once** (`is_used` boolean)
- Gets marked as used after successful admin signup

This prevents unauthorized people from creating admin accounts. Only someone with a valid, unused code for a specific college can become an admin.

### Q: How does verified student signup work?
**A:** Students must (a) sign up with their college's official email domain and (b) be approved by a college admin before accessing anything. Defined in `supabase/migrations/20260722000000_verified_signup.sql` and enforced across `signup.ts`, `middleware.ts`, and the Students admin page.

1. **Domain check** — for `role === 'student'`, `src/pages/api/auth/signup.ts` fetches allowed domains from the `college_domains` table for the chosen college:
   - College has **no** domains configured → signup fails with a config message (**fail closed**)
   - Email domain (substring after `@`, lowercased) doesn't match any allowed domain → 400 "use your official {college} email"
2. **Pending state** — on success students get `{ ok: true, pending: true }`; the signup page shows a success panel instead of redirecting into the app.
3. **Profile trigger** — `handle_new_user()` sets `approval_status = 'pending'` for students, `'approved'` for admins; existing rows were grandfathered to `'approved'`.
4. **Gate enforcement** — middleware redirects unapproved students from `/app/*` to `/pending`, and returns 401 JSON for `/api/*` calls (except `/api/auth/*`). Approved users hitting `/pending` are bounced to `/app/chat`.
5. **Approval** — college admins approve/reject on `/app/admin/students`, which POSTs to `/api/admin/students/{id}` with `{ status }` validated against `{ approved, rejected }` and scoped by `.eq(college_name).eq(role,'student')`.

The `college_domains` table is dashboard-managed (no admin UI yet) with SELECT open to anon/authenticated so pre-signup validation works.

---

## 7. Middleware & Route Protection

### Q: How does the middleware work?
**A:** The middleware runs on **every single request** to the server.

**File:** `src/middleware.ts`

```
Line 4-8:   Create a Supabase server client from the request cookies
Line 11-13: Get the authenticated user from the JWT cookie
Line 15-18: Initialize locals (user, userRole, userName, collegeName, approvalStatus) to null
Line 20-33: If user exists, query the `profiles` table for role, name, college, and approval_status
Line 35:    Get the current URL pathname
Line 37-53: If user is an unapproved student:
              - /app/* requests → redirect to /pending
              - /api/* requests (except /api/auth/*) → 401 JSON "Account pending approval"
Line 56-58: Approved users/admins on /pending → redirect to /app/chat
Line 61-65: If path starts with /app/ and no user → redirect to /login?next={path}
Line 68-70: If path starts with /app/admin and user is not admin → redirect to /app/chat?error=unauthorized
Line 73:    Allow the request to proceed
```

### Q: What is `Astro.locals` and how does it carry auth data?
**A:** `Astro.locals` is Astro's mechanism for passing data from middleware to pages and API endpoints within a single request. The middleware populates:
- `locals.user` — the Supabase user object (or null)
- `locals.userRole` — `'student'` | `'admin'` | null
- `locals.userName` — full name string
- `locals.collegeName` — the user's college

Every page and API route can read `Astro.locals` to make auth-aware decisions. The type declarations for these are in `src/env.d.ts`.

### Q: What happens when a non-logged-in user tries to access /app/chat?
**A:** The middleware at `src/middleware.ts:36-40` catches this:
1. The URL starts with `/app/`
2. `user` is null (not authenticated)
3. Middleware redirects to `/login?next=%2Fapp%2Fchat`
4. After successful login, the login API reads the `next` parameter and redirects the user back to `/app/chat`

### Q: What happens when a student tries to access /app/admin?
**A:** The middleware at `src/middleware.ts:43-45` catches this. The user is authenticated but `userRole` is `'student'`, not `'admin'`. They get redirected to `/app/chat?error=unauthorized`.

---

## 8. Supabase Integration

### Q: How are Supabase clients created? Why are there three types?
**A:**
**File:** `src/lib/supabase.ts`

**1. Browser Client** (`createSupabaseBrowserClient`, line 5-9)
- Used on the **client-side** (browser JavaScript)
- Uses `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
- Manages its own session via localStorage

**2. Server Client** (`createSupabaseServerClient`, line 12-35)
- Used in **SSR pages, middleware, and API routes**
- Reads/writes session cookies from the HTTP request/response
- Respects RLS (Row Level Security) — queries run as the authenticated user
- This is the primary client used throughout the app

**3. Service Client** (`createSupabaseServiceClient`, line 38-43)
- Used for server-side operations that need direct database access
- Used as a fallback in the RAG escalation flow when request/cookies aren't available
- Also uses the anon key (not a service role key)

### Q: How does cookie-based auth work with Supabase SSR?
**A:** The `@supabase/ssr` package provides `createServerClient` which handles JWT session tokens via HTTP cookies:

**File:** `src/lib/supabase.ts:16-34`
```js
createServerClient(url, key, {
  cookies: {
    getAll() {
      // Parse all cookies from the incoming request's Cookie header
      return parseCookieHeader(request.headers.get("Cookie") ?? "");
    },
    setAll(cookiesToSet) {
      // Write updated session cookies to the response
      cookiesToSet.forEach(({ name, value, options }) =>
        cookies.set(name, value, options)
      );
    },
  },
});
```

When a user logs in, Supabase stores the JWT in cookies. On subsequent requests, the middleware reads these cookies, verifies the JWT server-side via `supabase.auth.getUser()`, and populates `Astro.locals`.

---

## 9. Database Schema

### Q: What tables exist in the database and what do they store?
**A:** Six migration files define the schema (in `supabase/migrations/`):

**`profiles`** (Migration 1: `20260305000000_auth_setup.sql`)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Foreign key to `auth.users(id)` |
| `role` | TEXT | `'student'` or `'admin'` |
| `full_name` | TEXT | User's full name |
| `college_name` | TEXT | College the user belongs to |
| `approval_status` | TEXT | `'pending'`, `'approved'`, or `'rejected'` (verified signup gate) |
| `degree_program` | TEXT | Optional — e.g., B.Tech, MBA |
| `department` | TEXT | Optional — e.g., CSE |
| `year` | SMALLINT | Optional — 1–5 |
| `hosteller` | BOOLEAN | Optional — hostel resident flag |
| `created_at` | TIMESTAMPTZ | Auto-set |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

**`admin_access_codes`** (Migration 1)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `code` | TEXT (UNIQUE) | 8-char code like `A9K3T7Q2` |
| `college_name` | TEXT | Which college this code is for |
| `is_used` | BOOLEAN | Tracks usage |
| `used_by` | UUID | FK to `auth.users` |

**`chat_sessions`** (Migration 2: `20260305010000_chat_tables.sql`)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Session identifier |
| `user_id` | UUID (FK) | Owner of the session |
| `title` | TEXT | Session title (first message) |
| `created_at` | TIMESTAMPTZ | |

**`chat_messages`** (Migration 2)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `session_id` | UUID (FK) | Which chat session |
| `role` | TEXT | `'user'` or `'assistant'` |
| `content` | TEXT | Message text |
| `meta` | JSONB | Source citations, staff routing info |
| `created_at` | TIMESTAMPTZ | |

**`documents`** (Migration 3 + 4 + 5)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `name` | TEXT | Document display name |
| `category` | TEXT | `Finance`, `Academics`, etc. |
| `description` | TEXT | Admin-provided description |
| `uploaded_by_name` | TEXT | Name of uploading admin |
| `expiry_date` | DATE | When the document expires |
| `status` | TEXT | `'active'`, `'expiring'`, `'expired'` |
| `file_url` | TEXT | Supabase Storage public URL |
| `file_type` | TEXT | MIME type |
| `processing_status` | TEXT | `'processing'`, `'ready'`, `'failed'` |
| `college_name` | TEXT | For multi-tenancy scoping |
| `created_at` | TIMESTAMPTZ | |

**`staff_members`** (Migration 6: `20260311070000_staff_members.sql`)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `name` | VARCHAR(255) | Staff member name |
| `department` | VARCHAR(255) | Department |
| `role` | VARCHAR(255) | Role/title |
| `query_categories` | TEXT[] | Array of handled categories (e.g., `['fee', 'admissions']`) |
| `email` | VARCHAR(255) | |
| `phone` | VARCHAR(20) | |
| `whatsapp` | VARCHAR(20) | |
| `office_location` | VARCHAR(255) | |
| `office_hours` | VARCHAR(255) | |
| `languages` | TEXT[] | Languages spoken (e.g., `['english', 'hindi']`) |
| `urgency_level` | VARCHAR(20) | `'normal'`, `'urgent'`, `'emergency'` |
| `status` | VARCHAR(20) | `'active'` or `'inactive'` |
| `college_name` | VARCHAR(255) | For multi-tenancy scoping |

**`college_domains`** (Migration 7: `20260722000000_verified_signup.sql`)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `college_name` | TEXT | Which college |
| `domain` | TEXT | Allowed signup email domain (e.g., `cbit.ac.in`) |
| `created_at` | TIMESTAMPTZ | |
Unique on `(college_name, domain)`; SELECT open to anon/authenticated; managed via Supabase dashboard.

**`query_logs`** (Migration 6: `20260717000000_scale_features.sql`) — analytics backbone; one row per chat query
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Referenced by feedback thumbs and gap review |
| `college_name` / `user_id` / `session_id` | | Tenancy + ownership + optional session link |
| `query` / `rewritten_query` | TEXT | Original and intent-rewritten query |
| `agent` / `language` / `category` | | Agent used, detected language, detected category |
| `had_context` | BOOLEAN | Whether relevant chunks were found |
| `top_similarity` | NUMERIC | Best vector match score |
| `escalated` / `escalation_reason` | | Escalation outcome |
| `feedback` | TEXT | `'up'`, `'down'`, or null (thumbs) |
| `feedback_reason` | TEXT | Optional reason when 👎 |
| `reviewed` | BOOLEAN | Admin triaged this knowledge gap |
RLS: users insert/read/update own rows; college admins read/update all rows for their college. Partial index supports the knowledge-gaps query (`had_context = false OR feedback = 'down'`).

**`escalation_tickets`** (Migration 6)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `college_name` / `student_id` / `student_name` | | Who raised it, scoped where |
| `query` | TEXT | What they needed help with |
| `category` / `staff_name` | VARCHAR | Suggested category and staff from escalation |
| `status` | VARCHAR(20) | `'open'`, `'in_progress'`, or `'resolved'` |
| `resolution_note` | TEXT | Admin note on resolution |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auto-managed (trigger updates `updated_at`) |
RLS: students insert/read own tickets; college admins manage all tickets for their college.

**`announcements`** (Migration 6)
| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | |
| `college_name` | VARCHAR(255) | Tenancy scope |
| `title` / `body` | TEXT | Notice content |
| `category` | VARCHAR(50) | Default `'General'` |
| `pinned` | BOOLEAN | Pinned notices sort first |
| `expires_at` | TIMESTAMPTZ | When set, notice stops being served after this |
| `created_by_name` / `created_at` | | Audit fields |
RLS: all authenticated users read their college's announcements; college admins manage them.

> **Note:** The legacy pgvector objects (`document_chunks` table, `match_chunks` RPC) created by Migration 4 are dropped by `20260823000000_drop_pgvector_legacy.sql` — production retrieval is Pinecone-only.

### Q: What is the `handle_new_user` trigger?
**A:** Defined in `supabase/migrations/20260305000000_auth_setup.sql`. It's a PostgreSQL function with `SECURITY DEFINER` privilege (bypasses RLS) that automatically runs when a new user is inserted into `auth.users`. It creates a corresponding row in the `profiles` table using metadata from the signup request (full_name, role, college_name). This ensures every auth user has a profile without the client needing to manually create one.

---

## 10. Chat System & UI

### Q: How does the chat page load?
**A:**
1. User navigates to `/app/chat`
2. Middleware (`src/middleware.ts`) checks auth → allows if authenticated
3. `src/pages/app/chat.astro` runs server-side:
   - Reads `Astro.locals.user`
   - Queries `profiles` table for `full_name` and `role`
   - Passes `userName`, `userEmail`, `userRole` as props to `<ChatInterface />`
4. `src/components/chat/ChatInterface.astro` renders the full chat UI

### Q: What is the ChatInterface component structure?
**A:**
**File:** `src/components/chat/ChatInterface.astro` (~934 lines, the largest component)

**Server-side block (frontmatter):**
- Accepts props: `userName`, `userEmail`, `userRole`
- Queries Supabase for count of ready documents (for the "X docs indexed" badge)

**HTML structure:**
- **Sidebar** (left panel, toggleable on mobile):
  - Logo
  - "New Chat" button
  - Recent conversations list (populated via API)
  - User avatar + logout form
- **Main area** (right panel):
  - Header: sidebar toggle (mobile), "DeskMate AI" title, language selector, doc count badge
  - Message list: welcome screen with 4 starter cards (Fees, Hostel, Exams, Scholarships)
  - Input area: agent selector dropdown, auto-resizing textarea, send button, stop-generating button

**Client-side JavaScript (~650 lines inline `<script>`):**
- Session management (create, list, load sessions via API)
- Message sending and streaming response handling
- Custom Markdown renderer
- Agent selection dropdown
- Language detection
- Typing indicator animation
- Mobile sidebar toggle

### Q: What are the 8 "agents" in the chat?
**A:** The agents are topic hints sent to the RAG pipeline. They're defined in `ChatInterface.astro`'s inline script:

| Agent ID | Label | Purpose |
|---|---|---|
| `general` | General | Default — no topic filter |
| `academics` | Academics | Academic programs, courses, curriculum |
| `fees` | Fees & Finance | Tuition, payments, scholarships |
| `admissions` | Admissions | Application, enrollment |
| `hostel` | Hostel & Housing | Accommodation, room allocation |
| `placements` | Placements | Campus recruitment, internships |
| `library` | Library | Library resources, timings |
| `scholarships` | Scholarships | Financial aid, merit awards |

When a user selects an agent, the agent ID is sent to `/api/chat/generate` as the `agent` parameter. In the RAG pipeline (`src/lib/rag.ts:599-601`), if the agent isn't "general", the query is prefixed with `[Student is asking in the context of: {agent}]` to guide Gemini's response.

### Q: How does the welcome screen work? What happens when a starter card is clicked?
**A:** The welcome screen has 4 starter cards with preset questions (e.g., "What are the current fee structures?"). Clicking a card triggers an event listener (using event delegation on `#message-list`) that:
1. Reads the `data-query` attribute from the card
2. Sets the textarea value to that query
3. Calls the same `handleSend()` function as pressing Enter

### Q: How does the "New Chat" button work?
**A:** In `ChatInterface.astro`'s inline script:
1. Resets `currentSessionId` to `null`
2. Clears `messageBuffer` (message history array)
3. Clears the message list DOM
4. Rebuilds the welcome screen HTML with starter cards

A new session is only created in the database when the user sends their **first message** — not when they click "New Chat".

### Q: How do recent conversations appear in the sidebar?
**A:** On page load, `renderRecentChats()` is called:
1. Sends `GET /api/chat/sessions` → returns up to 20 sessions ordered by date
2. Renders up to 8 most recent items with relative timestamps ("2h ago", "Yesterday")
3. Each item is clickable → calls `loadSession(sessionId)`

`loadSession(id)` fetches all messages via `GET /api/chat/messages/{id}` and rebuilds the conversation UI.

---

## 11. RAG Pipeline (AI Core)

### Q: What is RAG and how is it implemented?
**A:** RAG stands for **Retrieval-Augmented Generation**. Instead of relying on the AI's training data, we:
1. **Retrieve** relevant document chunks via vector similarity search
2. **Augment** the user's query with those chunks as context
3. **Generate** an answer using Gemini, constrained to only use the provided context

The full pipeline is in `src/lib/rag.ts`.

### Q: What happens when a user sends a chat message, end to end?
**A:** Here's the complete flow:

**Step 1: Client sends request**
`ChatInterface.astro` (inline script) → `handleSend()` function:
- Collects: query text, selected agent, last 10 messages as history
- Sends `POST /api/chat/generate` with JSON body: `{ query, agent, history }`

**Step 2: API endpoint receives request**
**File:** `src/pages/api/chat/generate.ts`
- Line 6: Auth check (must be logged in)
- Line 14: Parse JSON body
- Line 21-23: Extract query, agent, history

**Step 3: Embed the query**
**File:** `src/pages/api/chat/generate.ts:34`
- Calls `embedSingleText(query)` → `src/lib/rag.ts:289-292`
- Which calls `generateEmbeddings([text], "query")` → `src/lib/pinecone.ts:24-55`
- Pinecone Inference API converts the query text into a 1024-dimensional vector using the `multilingual-e5-large` model
- The `"query"` input type optimizes the embedding for search queries (vs `"passage"` for documents)

**Step 4: Vector similarity search**
**File:** `src/pages/api/chat/generate.ts:35`
- Calls `searchChunks(queryEmbedding, 0.45, 5, collegeName)` → `src/lib/rag.ts:296-303`
- Which calls `queryIndex()` → `src/lib/pinecone.ts:93-130`
- Pinecone finds the 5 most similar document chunks (minimum similarity: 0.45)
- Results are filtered by `collegeName` metadata so students only get answers from their college's documents

**Step 5: Escalation check**
**File:** `src/lib/rag.ts:572-585` (inside `generateResponseStream`)
- `shouldEscalate(query, context.length)` checks:
  - Explicit contact triggers ("talk to", "speak with", etc.) → lines 128-132
  - Sensitive topics ("complaint", "refund", etc.) → lines 135-139
  - Urgent after-hours requests → lines 142-144
  - No relevant documents found (knowledge gap) → lines 147-149
  - Low confidence score → lines 152-154
- If escalation is triggered, `generateEscalationResponse()` streams staff contact info instead

**Step 6: Build Gemini prompt**
**File:** `src/lib/rag.ts:587-619`
- Constructs a context block from retrieved chunks:
  ```
  --- RETRIEVED COLLEGE DOCUMENTS ---
  [Source: Fee Structure 2025-26 | Category: Finance]
  {chunk text here}
  --- END OF DOCUMENTS ---
  ```
- Builds multi-turn conversation from history (previous messages)
- Appends the current query with context

**Step 7: Stream Gemini response**
**File:** `src/lib/rag.ts:622-644`
- Calls `ai.models.generateContentStream()` with the system prompt, context, and history
- Temperature: 0.5, max tokens: 1024
- Yields each text chunk as `{ type: 'chunk', text }` via AsyncGenerator
- After streaming completes, yields `{ type: 'done', sources, hasContext }`

**Step 8: API wraps the stream**
**File:** `src/pages/api/chat/generate.ts:42-56`
- Creates a `ReadableStream` that iterates over the AsyncGenerator
- Encodes each chunk as NDJSON (newline-delimited JSON)
- Returns the stream with `Content-Type: text/plain; charset=utf-8`

**Step 9: Client reads the stream**
`ChatInterface.astro` (inline script) → `handleSend()`:
- Uses `response.body.getReader()` to get a `ReadableStream` reader
- Reads chunks, decodes UTF-8, splits by newlines
- Parses each JSON line:
  - `type: 'chunk'` → appends text to the message bubble, re-renders Markdown
  - `type: 'done'` → extracts sources, adds citation badges
  - `type: 'error'` → shows error message
- Shows a blinking cursor animation during streaming
- After streaming, persists the assistant message to Supabase via `POST /api/chat/messages/{sessionId}`

### Q: What is the system prompt given to Gemini?
**A:** Defined at `src/lib/rag.ts:307-379`. Key rules:
- Only answer from provided college documents
- Don't guess or invent information
- Format responses with bullet points, numbered steps, bold for important data
- Respond in the same language the student uses (English, Hindi, Telugu)
- Cite sources naturally
- Route to staff when unable to answer
- Stay scoped to college-related topics only

---

## 12. Pinecone Vector Search

### Q: How does Pinecone work in this project?
**A:**
**File:** `src/lib/pinecone.ts`

Pinecone is used as a **vector database** to store and search document embeddings.

**Client initialization (lines 3-19):**
- Singleton pattern: `_pinecone` is created once and reused
- Uses `PINECONE_API_KEY` and `PINECONE_INDEX` from environment variables

**Embedding generation (lines 24-55):**
- Uses Pinecone's **built-in Inference API** (not a separate embedding service)
- Model: `multilingual-e5-large` (line 22) — supports English, Hindi, Telugu, and 100+ languages
- Two input types: `"passage"` (for documents being stored) and `"query"` (for search queries)
- Handles batch embedding results with error checking

**Upserting document chunks (lines 57-82):**
- Called when a document is uploaded
- Creates vectors with IDs like `{docId}_{chunkIndex}`
- Each vector has metadata: `documentId`, `documentName`, `documentCategory`, `collegeName`, `content`, `chunkIndex`
- Upserts in batches of 100 (Pinecone's limit)

**Querying (lines 93-130):**
- Takes a query embedding vector and returns the `topK` most similar chunks
- Filters by `collegeName` metadata for multi-tenancy
- Applies a score threshold (default 0.5, overridden to 0.45 in `generate.ts:35`)
- Returns parsed results with content, similarity score, document name, and category

**Deleting (lines 84-91):**
- When a document is deleted, all its vectors are removed from Pinecone
- Uses metadata filter: `{ documentId: { $eq: docId } }`

### Q: Why is Pinecone used instead of Supabase pgvector?
**A:** The database has pgvector set up (migration `20260305030000_rag_setup.sql` creates a `document_chunks` table and `match_chunks` RPC), but the actual production code uses Pinecone exclusively. Reasons likely include: better performance for similarity search, Pinecone's built-in Inference API for embeddings (no separate API key needed), and better scalability. The pgvector setup appears to be leftover from an earlier approach.

---

## 13. Google Gemini Integration

### Q: How is Gemini used?
**A:**
**File:** `src/lib/gemini.ts`

Two uses:
1. **Text Generation** (model: `gemini-2.5-flash`, line 17) — the main chat AI that generates answers from RAG context
2. **Image OCR** (`src/lib/rag.ts:203-226`) — when an image file is uploaded, Gemini extracts text from it using vision capabilities

The client is a singleton (created once, reused), using `@google/genai` SDK with the `GEMINI_API_KEY` environment variable.

### Q: What generation parameters are used?
**A:** In `src/lib/rag.ts:622-630`:
- `model`: `gemini-2.5-flash`
- `temperature`: 0.5 (moderate creativity — low enough for factual answers, high enough for natural language)
- `maxOutputTokens`: 1024
- `systemInstruction`: The 70+ line system prompt defined at lines 307-379

---

## 14. Document Upload & Processing

### Q: What happens when an admin uploads a document?
**A:**
**File:** `src/pages/api/admin/documents.ts`

The upload goes through a **7-step pipeline** (lines 51-152):

**Step 1: Insert document record (line 52-66)**
- Creates a row in the `documents` table with `processing_status: 'processing'`
- Stores: name, category, description, uploader name, expiry date, file type, college name
- Computes status from expiry date: `active` | `expiring` (within 7 days) | `expired`

**Step 2: Upload file to Supabase Storage (lines 74-90)**
- Stores the file in the `documents` bucket
- Path: `{documentId}.{extension}`
- If upload fails, deletes the database record (cleanup)

**Step 3: Extract text (lines 97-115)**
**File:** `src/lib/rag.ts:161-226`
- **PDF** (line 167): Uses `pdf-parse` library → reads buffer → extracts text
- **DOCX** (line 169): Uses `mammoth` library → extracts raw text from Word format
- **TXT** (line 171): Just reads the file as text
- **Images** (line 173): Sends to Gemini with the prompt "Extract ALL text from this image" — Gemini's vision model does OCR
- Libraries are lazy-loaded and cached (lines 181-182) to avoid re-importing on every request

**Step 4: Chunk the text (line 118)**
**File:** `src/lib/rag.ts:230-272`
- Splits text into chunks of 1000 characters with 200-character overlap
- Tries to break at sentence boundaries (`. ` or `\n`) to avoid cutting mid-sentence
- Returns array of `{ content, chunkIndex }`
- The overlap ensures that information near chunk boundaries isn't lost

**Step 5: Generate embeddings (lines 121-132)**
**File:** `src/lib/rag.ts:278-287`
- Converts chunk texts to vectors using Pinecone Inference
- Batches of 20 at a time (constant `EMBED_BATCH_SIZE` at line 276)
- Uses `"passage"` input type (optimized for stored documents)

**Step 6: Upsert to Pinecone (lines 134-143)**
**File:** `src/lib/pinecone.ts:57-82`
- Creates vector records with IDs, embeddings, and metadata
- Upserts in batches of 100

**Step 7: Mark as ready (line 146)**
- Updates the document's `processing_status` to `'ready'`

Each step from 3-6 can fail independently. If any step fails, the document is marked as `'failed'` but the file itself is still stored. This allows re-processing.

### Q: How is a document deleted?
**A:**
**File:** `src/pages/api/admin/documents/[id].ts`
1. Delete file from Supabase Storage
2. Delete all vectors from Pinecone via `deleteDocumentVectors(id)` (`src/lib/pinecone.ts:84-91`)
3. Delete the document row from the database

### Q: What file types are supported and what are the limits?
**A:**
- **Max size**: 10MB (checked at `src/pages/api/admin/documents.ts:45`)
- **Supported types**: PDF, DOCX, TXT, and images (PNG, JPG, etc.)
- The Supabase Storage bucket is configured to accept: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, and `image/*` (see migration `20260305030000_rag_setup.sql`)

---

## 15. Staff Escalation System

### Q: When does the AI route a student to a staff member instead of answering?
**A:**
**File:** `src/lib/rag.ts:118-157` (`shouldEscalate` function)

The system checks 5 conditions:

| Trigger | Examples | Line |
|---|---|---|
| **Explicit contact request** | "talk to", "contact", "who handles", "office" | 128-132 |
| **Sensitive topic** | "complaint", "refund", "transcript", "grievance" | 135-139 |
| **Urgent + after hours** | "urgent" or "emergency" outside Mon-Fri 9AM-5PM | 142-144 |
| **Knowledge gap** | No relevant document chunks found | 147-149 |
| **Low confidence** | Similarity score below 0.3 | 152-154 |

### Q: How does the staff lookup work?
**A:**
**File:** `src/lib/rag.ts:504-557` (`getStaffFromCategory` function)

1. Detects the **query category** (admissions, fee, exams, etc.) from the user's message → `src/lib/rag.ts:99-116`
2. Detects the **language** (Hindi via Devanagari script, Telugu via Telugu script) → lines 74-84
3. Detects **urgency** ("urgent", "emergency", "asap") → lines 86-89
4. Queries `staff_members` table with filters:
   - `college_name` matches the user's college
   - `status` is `'active'`
   - `query_categories` array contains the detected category
   - Optionally filtered by language (if non-English)
   - Optionally filtered by urgency level (if urgent → only `'urgent'` or `'emergency'` staff)
5. Returns up to 3 matching staff, ordered by urgency level (highest first) then name

### Q: How is the escalation response streamed?
**A:**
**File:** `src/lib/rag.ts:389-501` (`generateEscalationResponse` function)

Instead of sending the query to Gemini, this function:
1. Generates a context-aware introduction (e.g., "I understand this is urgent..." or "This matter requires official assistance...")
2. Streams the intro word-by-word with 30ms delays between words
3. Fetches matching staff from the database
4. Streams staff contact information character-by-character with 10ms delays
5. Each staff card includes: name, role, department, email, phone, WhatsApp, office location, hours, languages
6. Urgent contacts get special markers: `🚨 Emergency Contact` or `⚡ Priority Contact`
7. Ends with "I'm still here to help with any other questions about your college!"

---

## 16. Admin Dashboard

### Q: How does the admin dashboard page work?
**A:**
**File:** `src/pages/app/admin/index.astro`

1. Server-side: checks auth (redirects non-admins)
2. Queries Supabase for:
   - Total document count (filtered by college)
   - Total staff member count (filtered by college)
   - 5 most recent documents
3. Renders: stat cards, quick action buttons ("Manage Documents" / "Manage Staff"), and a recent documents table

### Q: How does the document management page work?
**A:**
**File:** `src/pages/app/admin/documents.astro`

**Server-side:**
- Fetches all documents for the admin's college from Supabase

**Client-side (inline `<script>`):**
- **Category filter bar**: All / Finance / Academics / Accommodation / Resources / General
  - Clicking a filter shows/hides DocumentCards by checking `data-category` attribute
- **Upload modal**: drag-and-drop file zone + form fields (name, category, expiry date, description)
  - Drag-and-drop uses `dragover`, `dragleave`, `drop` events on the drop zone
  - File type and size validation before upload
  - Submits as `FormData` to `POST /api/admin/documents`
  - Shows processing status ("Processing document...")
- **Delete**: each DocumentCard has a delete button that calls `DELETE /api/admin/documents/{id}`

### Q: How does the staff management page work?
**A:**
**File:** `src/pages/app/admin/staff.astro`

**Server-side:**
- Fetches all staff members for the admin's college from Supabase

**Client-side (inline `<script>`):**
- **Add Staff modal** with fields:
  - Name, Role, Department, Email, Phone, WhatsApp
  - Office Location, Office Hours
  - Languages (checkboxes: English, Hindi, Telugu)
  - Urgency Level (Normal / Urgent / Emergency)
  - Query Categories (16 checkboxes: Admissions, Fee, Exams, Placements, Hostel, etc.)
- Submits as JSON to `POST /api/admin/staff`
- **Delete**: each StaffCard has a remove button that calls `DELETE /api/admin/staff/{id}`

---

## 17. Multi-Tenancy (College Scoping)

### Q: How does multi-tenancy work? How are colleges isolated?
**A:** Every piece of data is scoped by `college_name`:

1. **User profiles**: Each user has a `college_name` stored in the `profiles` table (set during signup)
2. **Documents**: Each document has a `college_name` column. Admins can only manage documents for their college.
3. **Staff members**: Each staff member has a `college_name` column. Only visible within that college.
4. **Vector search**: Pinecone queries include a metadata filter: `{ collegeName: { $eq: collegeName } }` (`src/lib/pinecone.ts:109-111`). Students only get search results from their college's documents.
5. **Admin access codes**: Each code is tied to a specific college. An admin can only sign up for the college matching their access code.
6. **Middleware propagation**: The user's `college_name` flows through the entire request via `Astro.locals.collegeName` (set in `src/middleware.ts:30`)

### Q: Which colleges are supported?
**A:** 41 Hyderabad/Telangana-area colleges are pre-seeded with access codes in `supabase/migrations/20260305040000_college_scoping.sql`. Examples include IIT Hyderabad, IIIT Hyderabad, JNTU, Osmania University, BITS Pilani Hyderabad, and many more.

---

## 18. Frontend Components

### Q: How does the Accordion (FAQ section) work?
**A:**
**Files:** `src/components/ui/Accordion.astro` + `src/components/ui/AccordionItem.astro`

- `Accordion.astro` defines the 6 process steps data and maps them to `AccordionItem` components
- Each `AccordionItem` has a toggle button that:
  - Closes other open items (only one can be open)
  - Toggles the item's height between 160px (closed) and `scrollHeight` (open)
  - Toggles `active` and `bg-green` CSS classes
  - Rotates the +/- icon via CSS transforms
- Click-outside detection closes all items
- Re-initializes on Astro view transitions via `astro:after-swap` event

### Q: How does the testimonial slider work?
**A:**
**File:** `src/components/ui/SwiperSlider.astro`

- Uses the **Swiper.js** library (imported as ES module)
- Reads testimonial data from `src/data/clientData.json`
- Configuration: loop mode, 2 slides per view on desktop / 1 on mobile, 50px gap
- Has prev/next navigation arrows and pagination bullets
- Speech bubble design uses CSS `:after`/`:before` pseudo-elements for the triangle pointer

### Q: How does the contact form work?
**A:**
**File:** `src/components/ui/Form.astro`

- Has two radio-style checkboxes: "General Inquiry" and "College Partnership"
- Checking "College Partnership" auto-fills the message textarea with a template
- Form submission: prevents default, shows spinner, simulates 900ms delay, then shows success state
- **Note**: The form is currently a **demo** — it doesn't actually send data to a backend

### Q: How do the DocumentCard and StaffCard components work?
**A:**

**DocumentCard** (`src/components/admin/DocumentCard.astro`):
- Server-rendered card showing: name, category badge, status (active/expiring/expired with color coding), file type label, uploader name, created date, expiry date, description, processing status
- Has a delete button with `data-action="delete-doc"` and `data-id` attributes
- Event handling is delegated to the parent page's script

**StaffCard** (`src/components/admin/StaffCard.astro`):
- Shows: name, role, department badge, email, phone, office location, query-handle tags
- Has a remove button with `data-action="delete-staff"` and `data-id` attributes
- Event handling is delegated to the parent page's script

---

## 19. Streaming Responses

### Q: How does response streaming work technically?
**A:** Streaming uses **NDJSON (Newline-Delimited JSON)** over a standard HTTP response body (not WebSockets or SSE).

**Server side** (`src/pages/api/chat/generate.ts:42-65`):
```
1. Create a ReadableStream
2. In the stream's start() callback:
   - Iterate over the AsyncGenerator from generateResponseStream()
   - Encode each yielded object as JSON + newline
   - Enqueue the encoded bytes to the stream controller
3. Return the stream as a Response with Content-Type: text/plain
```

Three chunk types are yielded:
- `{ type: 'chunk', text: '...' }` — a piece of the answer (generated by Gemini or the escalation system)
- `{ type: 'done', sources: [...], hasContext: true }` — signals completion with sources
- `{ type: 'error', error: '...' }` — signals an error

**Client side** (`ChatInterface.astro` inline script):
```
1. response.body.getReader() → get a ReadableStream reader
2. Read chunks in a loop
3. Decode UTF-8 bytes to text
4. Split text by newlines
5. Parse each line as JSON
6. For 'chunk' type: append to message bubble, re-render Markdown
7. For 'done' type: add citation badges, persist message to DB
8. For 'error' type: show error in the bubble
```

The UI re-renders Markdown for the accumulated text on every chunk, and scrolls to the bottom every 5 chunks. A blinking cursor animation is shown at the end of the text during streaming.

### Q: How does the "Stop generating" button work?
**A:** In the ChatInterface's script:
1. A reference to the `ReadableStream` reader is stored in a variable
2. When "Stop generating" is clicked, `reader.cancel()` is called
3. This aborts the stream — the server's generator is also terminated
4. The partial response is kept in the UI as-is

---

## 20. Blog / Articles System

### Q: How does the blog system work?
**A:** The blog uses **Astro Content Collections**.

**Content definition** (`src/content/config.ts`):
- Defines a `blog` collection with schema: title, pubDate, author, image, tags, type

**Blog posts** (`src/content/blog/`):
- 5 Markdown files (from the original theme, about SEO and marketing topics)
- Frontmatter defines metadata; body is rendered as HTML

**Routes:**
- `/articles` (`src/pages/articles/index.astro`) — Lists all posts sorted by date
- `/articles/{slug}` (`src/pages/articles/[...slug].astro`) — Individual post page
- `/articles/search` (`src/pages/articles/search.astro`) — Searches by title/body/slug
- `/articles/tag/{tag}` (`src/pages/articles/tag/[...tag].astro`) — Filter by tag
- `/articles/api/search.json` (`src/pages/articles/api/search.json.ts`) — JSON search API

---

## 21. Styling & Design System

### Q: What design system is used?
**A:**
**File:** `tailwind.config.mjs` + `src/styles/global.css`

- **Font**: Space Grotesk (Regular 400, Medium 500) — loaded as local WOFF files from `public/fonts/grotesk/`
- **Color palette (CSS variables):**
  - `--green: #b9ff66` — primary accent (lime green)
  - `--dark: #191a23` — dark backgrounds, buttons
  - `--gray: #f3f3f3` — light backgrounds
  - `--white: #ffffff`
- **Button classes:**
  - `.btn-primary` — green bg, dark text
  - `.btn-secondary` — dark bg, white text with green border
  - `.btn-tertiary` — dark bg, white text, no border
- **Heading classes:**
  - `.greenhead` — green background, dark text, inline-block with border-radius
  - `.whitehead` — white background
  - `.blackhead` — dark background, white text
- **Card style:** `rounded-[45px]` corners, `shadow-[0px_5px_0px_#191a23]` for 3D depth effect

---

## 22. Deployment

### Q: How is the project deployed?
**A:**
- **Platform**: Vercel (via `@astrojs/vercel` adapter)
- **Build command**: `cross-env NODE_OPTIONS=--max-old-space-size=4096 astro build`
  - The `NODE_OPTIONS=--max-old-space-size=4096` increases Node.js memory to 4GB during build (needed for the heavy dependencies)
- **SSR mode**: Every page is server-rendered on Vercel's serverless functions
- **Environment variables**: Must be configured in Vercel's dashboard (the same 5 from `.env`)

### Q: What is the `cross-env` package for?
**A:** `cross-env` sets environment variables in a cross-platform way. The `NODE_OPTIONS=--max-old-space-size=4096` flag won't work with standard Windows CMD syntax, so `cross-env` ensures it works on both Windows and Unix.

---

## 23. Verified Signup & Approval Flow

Covered in detail in [Section 6](#6-authentication-system) — see "How does verified student signup work?". In short: `college_domains` gates signup server-side (fail closed), `profiles.approval_status` gates access via middleware (`/pending` for pages, 401 for APIs), and admins approve/reject on `/app/admin/students`.

---

## 24. Announcements System

### Q: How do announcements reach students?
**A:** Two ways:

1. **Admin CRUD** — `/app/admin/announcements` posts to `/api/admin/announcements` (create/list) and `/api/admin/announcements/[id]` (delete/edit). All college-scoped.
2. **RAG context injection** — during every college-query generation, `generateResponseStream` fetches the college's active (non-expired) announcements and injects an `--- ACTIVE COLLEGE ANNOUNCEMENTS ---` block into the prompt context (same pattern as documents). If a query has a knowledge gap but active announcements exist, the assistant answers from those instead of escalating.

The system prompt also instructs the model to check announcement validity dates before answering event/timeline questions.

---

## 25. Escalation Tickets & Analytics

### Q: What happens after an escalation?
**A:** Besides streaming staff contacts, the chat can offer to raise a **ticket**: when an escalation occurs, the client shows a confirmation affordance; confirming POSTs `{ query, category, staff_name }` to `/api/tickets`, which inserts into `escalation_tickets` scoped to the student's college. Admins triage on `/app/admin/tickets`, moving tickets through `open → in_progress → resolved` (with optional `resolution_note`) via `PATCH /api/admin/tickets/{id}`.

### Q: What does the analytics dashboard show?
**A:** `/app/admin/analytics` reads the college's `query_logs` and renders: total queries, escalation rate, context-hit rate, top categories, language breakdown, and a **knowledge-gaps list** (queries with `had_context = false` or `feedback = 'down'`). Admins mark gaps as reviewed via `PATCH /api/admin/analytics/{id}`, closing the feedback loop between student thumbs-downs and document uploads.

### Q: How do feedback thumbs work?
**A:** After a bot answer streams, 👍/👎 buttons render under the bubble (when a `queryLogId` was emitted in the `done` event). Clicking POSTs `{ queryLogId, feedback, reason? }` to `/api/chat/feedback`, which updates only the caller's own row (`.eq('id', queryLogId).eq('user_id', user.id)` + RLS).

---

## 26. Student Profiles & Personalization

### Q: How is chat personalized per student?
**A:**
1. **Collection** — optional fields at signup (degree, department, year, hosteller) plus a "My Profile" modal in the chat sidebar backed by `GET/POST /api/profile`.
2. **Retrieval boost** — `generate.ts` appends profile terms (e.g., `B.Tech CSE year 4 hostel`) to the embedded query so department/year-specific chunks rank higher.
3. **Prompt injection** — `buildProfileBlock()` adds a `--- STUDENT PROFILE ---` block telling Gemini to answer with the part that applies to this student; missing fields trigger a one-line nudge to complete the profile when the answer would differ.

Null profile field means "not provided" — nothing is coerced to defaults, and profile fetches are non-fatal (chat works even if the lookup fails).

---

## 27. Hardening: Expiry Filter & Rate Limiting

### Q: Can students get answers from expired documents?
**A:** Not anymore. `src/pages/api/chat/generate.ts` step **3b** post-filters vector-search results: it batch-fetches `expiry_date` and `processing_status` for all retrieved `document_id`s from the `documents` table and drops chunks whose source document is expired (or failed processing). The comparison uses local midnight against today's date; documents with no expiry date never expire. The filter **fails open** — if the lookup errors, chunks are kept rather than breaking chat. Because filtering happens *before* the escalation check and query logging, an all-expired result correctly logs as a knowledge gap.

### Q: How is the chat endpoint protected from abuse?
**A:** A per-user sliding-window rate limit lives at module scope in `src/pages/api/chat/generate.ts`: max **20 messages per rolling 60 seconds** per user id, tracked in an in-memory `Map`. Over-limit requests get `429 { ok: false, error: 'You are sending messages too quickly…' }`; the chat client already renders non-OK `error` payloads as an assistant message, so users see the message inline. The map sweeps stale entries past 1000 users to bound memory.

> **Serverless caveat:** on Vercel, memory is per-instance, so the effective global limit is approximate (each warm instance enforces its own window). It's cost protection, not a hard quota — move to Upstash Redis or DB-backed counters if strict enforcement matters.

---

## Quick Reference: Where Is Each Piece of Logic?

| Logic | File | Key Lines |
|---|---|---|
| Auth middleware | `src/middleware.ts` | 4-49 |
| Supabase client factory | `src/lib/supabase.ts` | 5-43 |
| Gemini client | `src/lib/gemini.ts` | 5-17 |
| Pinecone client + embeddings | `src/lib/pinecone.ts` | 5-130 |
| Text extraction (PDF/DOCX/Image) | `src/lib/rag.ts` | 161-226 |
| Text chunking | `src/lib/rag.ts` | 230-272 |
| Embedding generation | `src/lib/rag.ts` | 278-292 |
| Vector similarity search | `src/lib/rag.ts` | 296-303 |
| RAG system prompt | `src/lib/rag.ts` | 307-379 |
| Streaming response generation | `src/lib/rag.ts` | 559-645 |
| Escalation detection | `src/lib/rag.ts` | 118-157 |
| Escalation response | `src/lib/rag.ts` | 389-501 |
| Staff DB lookup | `src/lib/rag.ts` | 504-557 |
| Chat generate API | `src/pages/api/chat/generate.ts` | 5-66 |
| Document upload API | `src/pages/api/admin/documents.ts` | 16-159 |
| Signup API | `src/pages/api/auth/signup.ts` | 4-108 |
| Login API | `src/pages/api/auth/login.ts` | Full file |
| Chat UI (full client logic) | `src/components/chat/ChatInterface.astro` | Inline script (~650 lines) |
| Navbar (auth-aware) | `src/components/ui/Navbar.astro` | Frontmatter + HTML |
| Landing page | `src/pages/index.astro` | Full file |
| Admin dashboard | `src/pages/app/admin/index.astro` | Full file |
| Document management | `src/pages/app/admin/documents.astro` | Full file |
| Staff management | `src/pages/app/admin/staff.astro` | Full file |
| DB schema — profiles | `supabase/migrations/20260305000000_auth_setup.sql` | Full file |
| DB schema — chat | `supabase/migrations/20260305010000_chat_tables.sql` | Full file |
| DB schema — documents | `supabase/migrations/20260305020000_admin_tables.sql` | Full file |
| DB schema — RAG/vectors | `supabase/migrations/20260305030000_rag_setup.sql` | Full file |
| DB schema — college scoping | `supabase/migrations/20260305040000_college_scoping.sql` | Full file |
| DB schema — staff members | `supabase/migrations/20260311070000_staff_members.sql` | Full file |
| DB schema — query logs, tickets, announcements | `supabase/migrations/20260717000000_scale_features.sql` | Full file |
| DB schema — student profile fields | `supabase/migrations/20260720000000_student_profile.sql` | Full file |
| DB schema — verified signup (domains + approval) | `supabase/migrations/20260722000000_verified_signup.sql` | Full file |
| DB cleanup — drop legacy pgvector | `supabase/migrations/20260823000000_drop_pgvector_legacy.sql` | Full file |
| Expired-document post-filter | `src/pages/api/chat/generate.ts` | Step 3b |
| Per-user chat rate limit (20/min) | `src/pages/api/chat/generate.ts` | Module scope (`checkRateLimit`) |
| Verified signup validation | `src/pages/api/auth/signup.ts` | Student domain check before `signUp` |
| Approval gate (middleware) | `src/middleware.ts` | `isUnapprovedStudent` block |
| Profile personalization block | `src/lib/rag.ts` | `buildProfileBlock()` |
| Announcements context injection | `src/lib/rag.ts` | `generateResponseStream` announcements fetch |
| Feedback thumbs API | `src/pages/api/chat/feedback.ts` | Full file |
| Tickets API (student) | `src/pages/api/tickets.ts` | POST create |
| Knowledge-gap review | `src/pages/api/admin/analytics/[id].ts` | PATCH reviewed flag |

---

*Generated for the DeskMate project codebase.*
