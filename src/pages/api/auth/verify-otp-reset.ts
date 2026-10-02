import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    let email = "";
    let otp = "";
    let password = "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      email = String(body.email || "").trim().toLowerCase();
      otp = String(body.otp || "").replace(/\s+/g, "").trim();
      password = String(body.password || "").trim();
    } else {
      const formData = await request.formData();
      email = String(formData.get("email") || "").trim().toLowerCase();
      otp = String(formData.get("otp") || "").replace(/\s+/g, "").trim();
      password = String(formData.get("password") || "").trim();
    }

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please provide a valid email address." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!otp || otp.length < 6 || otp.length > 12) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please enter the complete verification code from your email." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ ok: false, error: "New password must be at least 6 characters long." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createSupabaseServerClient(request, cookies);

    // 1. Verify the 6-digit recovery OTP code with Supabase
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "recovery",
    });

    if (verifyError || !verifyData?.user) {
      console.warn("[VerifyOtpReset] Verify error:", verifyError?.message);
      return new Response(
        JSON.stringify({
          ok: false,
          error: verifyError?.message || "Invalid or expired verification code. Please check and try again.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. The OTP established an authenticated recovery session, now update the password
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      console.error("[VerifyOtpReset] Update password error:", updateError.message);
      return new Response(
        JSON.stringify({ ok: false, error: updateError.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Clear temporary recovery session so user logs in cleanly with new credentials
    await supabase.auth.signOut();

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Your password has been reset successfully!",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[VerifyOtpReset] Unexpected exception:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
