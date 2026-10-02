import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    let email = "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      email = String(body.email || "").trim().toLowerCase();
    } else {
      const formData = await request.formData();
      email = String(formData.get("email") || "").trim().toLowerCase();
    }

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please enter a valid email address." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createSupabaseServerClient(request, cookies);

    // resetPasswordForEmail triggers Supabase to send the 6-digit recovery OTP code via your custom SMTP
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      console.error("[ForgotPassword] Supabase error:", error);
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "A 6-digit verification code has been sent to your email.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ForgotPassword] Unexpected exception:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
