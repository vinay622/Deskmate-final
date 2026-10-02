import type { APIRoute } from "astro";
import { createSupabaseFallbackClient, createSupabaseServerClient } from "../../../lib/supabase";
import { signPending2FA, verifyTrustedDevice } from "../../../lib/device-trust";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    let email = "";
    let password = "";
    let next = "";
    let trustDevice = false;

    let rawEmail = "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      rawEmail = String(body.email ?? "").trim();
      email = rawEmail.toLowerCase();
      password = String(body.password ?? "");
      next = String(body.next ?? "").trim();
      trustDevice = Boolean(body.trustDevice ?? body.trust_device ?? body.remember);
    } else {
      const formData = await request.formData();
      rawEmail = String(formData.get("email") ?? "").trim();
      email = rawEmail.toLowerCase();
      password = String(formData.get("password") ?? "");
      next = String(formData.get("next") ?? "").trim();
      const td = formData.get("trust_device");
      trustDevice = td === "true" || td === "on" || formData.get("remember") === "on";
    }

    if (!email || !password) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email and password are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Verify credentials statelessly (without issuing session cookies yet)
    const fallbackClient = createSupabaseFallbackClient();
    let { data: authData, error: authError } = await fallbackClient.auth.signInWithPassword({
      email,
      password,
    });

    // Fallback: if lowercased email failed and rawEmail was different, try with rawEmail
    if ((authError || !authData?.user) && rawEmail && rawEmail !== email) {
      const retryResult = await fallbackClient.auth.signInWithPassword({
        email: rawEmail,
        password,
      });
      if (retryResult.data?.user) {
        authData = retryResult.data;
        authError = null;
        email = rawEmail;
      }
    }

    if (authError || !authData?.user) {
      console.error("[Login] Auth error for email:", email, authError);
      const isEmailNotConfirmed = authError?.message?.toLowerCase().includes("email not confirmed");
      const errorMsg = isEmailNotConfirmed
        ? "Please confirm your email address. A confirmation link was sent to your inbox upon signup."
        : (authError?.message || "Invalid email or password.");

      return new Response(
        JSON.stringify({ ok: false, error: errorMsg }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Check if account exists in profiles and is active
    const { data: profile } = await fallbackClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile) {
      console.warn("[Login] User authenticated in auth.users but profile is deleted:", authData.user.id);
      cookies.delete("deskmate_trusted_device", { path: "/" });
      cookies.delete("deskmate_2fa_pending", { path: "/" });

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Account not found or has been removed. Please sign up for a new account.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (profile.is_active === false) {
      cookies.delete("deskmate_trusted_device", { path: "/" });
      cookies.delete("deskmate_2fa_pending", { path: "/" });

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Your account has been deactivated. Please contact your college administrator.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const role = profile?.role ?? "student";
    let destination = (role === "admin" || role === "staff") ? "/app/admin" : "/app/chat";
    if (next && next.startsWith("/app/")) {
      destination = next;
    }

    // 3. Check if this specific browser is already a trusted device
    const trustedToken = cookies.get("deskmate_trusted_device")?.value;
    const isTrusted = verifyTrustedDevice(trustedToken, authData.user.id);

    if (isTrusted) {
      // Device is trusted — establish the full Supabase session and bypass 2FA OTP
      const supabaseServer = createSupabaseServerClient(request, cookies);
      const { error: sessionError } = await supabaseServer.auth.signInWithPassword({
        email,
        password,
      });

      if (sessionError) {
        return new Response(
          JSON.stringify({ ok: false, error: sessionError.message }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, requires2FA: false, redirect: destination }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Device is NOT trusted — trigger 2FA OTP code to user's email
    const { error: otpError } = await fallbackClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      console.error("[Login 2FA] Failed to send OTP:", otpError);
      return new Response(
        JSON.stringify({ ok: false, error: otpError.message || "Failed to send 2FA verification code." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Set short-lived 5-minute pending 2FA token
    const pendingToken = signPending2FA({
      email,
      userId: authData.user.id,
      trustDevice,
      next: destination,
    });

    const isHttps = request.url.startsWith("https:");
    cookies.set("deskmate_2fa_pending", pendingToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 5 * 60, // 5 minutes
      secure: isHttps,
    });

    return new Response(
      JSON.stringify({ ok: true, requires2FA: true, email }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Login] Unexpected exception:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
