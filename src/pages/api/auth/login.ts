import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();

  if (!email || !password) {
    return new Response(
      JSON.stringify({ ok: false, error: "Email and password are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createSupabaseServerClient(request, cookies);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? "Invalid credentials." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch role to determine redirect destination
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const role = profile?.role ?? "student";
  let destination = role === "admin" ? "/app/admin" : "/app/chat";

  // Honour the `next` param if it's a safe internal path
  if (next && next.startsWith("/app/")) {
    destination = next;
  }

  return new Response(
    JSON.stringify({ ok: true, redirect: destination }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
