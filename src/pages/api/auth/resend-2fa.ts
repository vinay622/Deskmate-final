import type { APIRoute } from "astro";
import { createSupabaseFallbackClient } from "../../../lib/supabase";
import { verifyPending2FA, signPending2FA } from "../../../lib/device-trust";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const pendingToken = cookies.get("deskmate_2fa_pending")?.value;
    const pending = verifyPending2FA(pendingToken);

    if (!pending) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "2FA session has expired. Please sign in again.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const fallbackClient = createSupabaseFallbackClient();
    const { error: otpError } = await fallbackClient.auth.signInWithOtp({
      email: pending.email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      return new Response(
        JSON.stringify({ ok: false, error: otpError.message || "Failed to resend verification code." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Refresh pending token for another 5 minutes
    const refreshedToken = signPending2FA({
      email: pending.email,
      userId: pending.userId,
      trustDevice: pending.trustDevice,
      next: pending.next,
    });

    const isHttps = request.url.startsWith("https:");
    cookies.set("deskmate_2fa_pending", refreshedToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 5 * 60,
      secure: isHttps,
    });

    return new Response(
      JSON.stringify({ ok: true, message: "A new 8-digit verification code has been sent." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Resend2FA] Unexpected exception:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to resend verification code." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
