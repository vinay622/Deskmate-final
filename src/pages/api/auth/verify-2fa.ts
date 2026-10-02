import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { verifyPending2FA, signTrustedDevice } from "../../../lib/device-trust";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    let otp = "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      otp = String(body.otp ?? "").replace(/\s+/g, "").trim();
    } else {
      const formData = await request.formData();
      otp = String(formData.get("otp") ?? "").replace(/\s+/g, "").trim();
    }

    if (!otp || otp.length < 6) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please enter the complete verification code." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Verify pending 2FA session from cookie
    const pendingToken = cookies.get("deskmate_2fa_pending")?.value;
    const pending = verifyPending2FA(pendingToken);

    if (!pending) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Your 2FA session has expired. Please sign in again with your email and password.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Verify OTP with Supabase Auth to establish the real session
    const supabase = createSupabaseServerClient(request, cookies);
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email: pending.email,
      token: otp,
      type: "email",
    });

    if (verifyError || !verifyData?.user) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: verifyError?.message || "Invalid or expired verification code. Please try again.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. If "Trust this device" was checked, sign a 30-day device cookie
    const isHttps = request.url.startsWith("https:");
    if (pending.trustDevice) {
      const trustedDeviceToken = signTrustedDevice(verifyData.user.id);
      cookies.set("deskmate_trusted_device", trustedDeviceToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        secure: isHttps,
      });
    }

    // 4. Clear pending 2FA cookie
    cookies.delete("deskmate_2fa_pending", { path: "/" });

    // 5. Determine destination
    // 5. Determine destination and verify profile exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", verifyData.user.id)
      .maybeSingle();

    if (!profile) {
      cookies.delete("deskmate_trusted_device", { path: "/" });
      cookies.delete("deskmate_2fa_pending", { path: "/" });
      await supabase.auth.signOut();
      return new Response(
        JSON.stringify({ ok: false, error: "Account not found or has been removed. Please register again." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (profile.is_active === false) {
      cookies.delete("deskmate_trusted_device", { path: "/" });
      cookies.delete("deskmate_2fa_pending", { path: "/" });
      await supabase.auth.signOut();
      return new Response(
        JSON.stringify({ ok: false, error: "Your account has been deactivated. Please contact your college administrator." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const role = profile.role ?? "student";
    let destination = (role === "admin" || role === "staff") ? "/app/admin" : "/app/chat";
    if (pending.next && pending.next.startsWith("/app/")) {
      destination = pending.next;
    }

    return new Response(
      JSON.stringify({ ok: true, redirect: destination }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Verify2FA] Unexpected exception:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
