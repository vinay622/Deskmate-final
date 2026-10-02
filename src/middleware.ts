import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient(
    context.request,
    context.cookies
  );

  // Get authenticated user from JWT (server-side safe check)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user;
  context.locals.userRole = null;
  context.locals.userName = null;
  context.locals.collegeName = null;
  context.locals.approvalStatus = null;
  context.locals.isActive = true;

  if (user) {
    // Fetch role, name, college, approval state, and active state from profiles table
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name, college_name, approval_status, is_active")
      .eq("id", user.id)
      .maybeSingle();

    // If account was deleted from profiles table, revoke access and sign out
    if (!profile) {
      await supabase.auth.signOut();
      context.cookies.delete("deskmate_trusted_device", { path: "/" });
      context.cookies.delete("deskmate_2fa_pending", { path: "/" });
      const pathname = new URL(context.request.url).pathname;
      if (pathname.startsWith("/app/")) {
        return context.redirect("/login?error=account_not_found");
      }
      if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
        return new Response(
          JSON.stringify({ ok: false, error: "Account not found or has been deleted." }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    context.locals.userRole = (profile?.role as "student" | "staff" | "admin") ?? null;
    context.locals.userName = profile?.full_name ?? null;
    context.locals.collegeName = profile?.college_name ?? null;
    context.locals.approvalStatus = profile?.approval_status ?? null;
    context.locals.isActive = profile?.is_active ?? true;

    // Block deactivated accounts
    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      context.cookies.delete("deskmate_trusted_device", { path: "/" });
      context.cookies.delete("deskmate_2fa_pending", { path: "/" });
      const pathname = new URL(context.request.url).pathname;
      if (pathname.startsWith("/app/")) {
        return context.redirect("/login?error=deactivated");
      }
      if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
        return new Response(
          JSON.stringify({ ok: false, error: "Account deactivated" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  const pathname = new URL(context.request.url).pathname;

  // Unapproved students are blocked everywhere except /pending and auth endpoints
  const isUnapprovedStudent =
    !!user &&
    context.locals.userRole === "student" &&
    context.locals.approvalStatus !== "approved";

  if (isUnapprovedStudent) {
    if (pathname.startsWith("/app/")) {
      return context.redirect("/pending");
    }
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Account pending approval" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Approved (or staff/admin) users have no business on /pending
  if (pathname === "/pending" && user && !isUnapprovedStudent) {
    if (context.locals.userRole === "admin" || context.locals.userRole === "staff") {
      return context.redirect("/app/admin");
    }
    return context.redirect("/app/chat");
  }

  // Protect all /app/* routes — must be authenticated
  if (pathname.startsWith("/app/")) {
    if (!user) {
      const next_url = encodeURIComponent(pathname);
      return context.redirect(`/login?next=${next_url}`);
    }

    // Protect /app/admin/* — must be admin or staff
    const isStaffOrAdmin =
      context.locals.userRole === "admin" || context.locals.userRole === "staff";

    if (pathname.startsWith("/app/admin")) {
      if (!isStaffOrAdmin) {
        return context.redirect("/app/chat?error=unauthorized");
      }

      // Accounts management is restricted exclusively to college admins
      if (pathname.startsWith("/app/admin/accounts") && context.locals.userRole !== "admin") {
        return context.redirect("/app/admin?error=forbidden");
      }
    }
  }

  return next();
});
