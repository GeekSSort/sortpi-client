import { apiFetch, ApiError } from "./apiClient";

/**
 * Sign-up, one-time codes and password resets.
 *
 * None of these endpoints exist yet. Each is written in the shape the screens
 * need, so turning them on means deleting `NOT_BUILT`.
 *
 * Three journeys: a new company signs up on the main site, since it has no
 * address of its own yet; a shop worker resets on their company's address;
 * our own staff reset on the console. The last stays separate, or a
 * customer's address could start a reset on one of our admin accounts.
 */

const NOT_BUILT = true;

export class NotBuiltError extends Error {
  constructor(what: string) {
    super(`${what} is not built on the server yet.`);
    this.name = "NotBuiltError";
  }
}

function guard(what: string) {
  if (NOT_BUILT) throw new NotBuiltError(what);
}

export interface SignupPayload {
  companyName: string;
  subdomain: string;
  ownerName: string;
  email: string;
  phone?: string;
}

export type Realm = "tenant" | "platform";

export class RegistrationService {
  /** Step 1 of sign-up: create the request and email a code. */
  static async startSignup(payload: SignupPayload): Promise<{ email: string }> {
    guard("Company sign-up");
    return apiFetch("/auth/signup", {
      method: "POST",
      anonymous: true,
      body: JSON.stringify(payload),
    });
  }

  /** Is this web address free? Checked as the person types. */
  static async checkSubdomain(subdomain: string): Promise<{ available: boolean; reason?: string }> {
    guard("Address availability check");
    return apiFetch(`/auth/signup/subdomain?value=${encodeURIComponent(subdomain)}`, {
      method: "GET",
      anonymous: true,
    });
  }

  /** Ask for a code. Used by both forgot-password journeys; `realm` picks which. */
  static async requestCode(email: string, realm: Realm = "tenant"): Promise<void> {
    guard("Password reset");
    await apiFetch(realm === "platform" ? "/platform/auth/forgot-password" : "/auth/forgot-password", {
      method: "POST",
      anonymous: true,
      body: JSON.stringify({ email }),
    });
  }

  /** Step 2: check the code. Returns a short-lived ticket for step 3. */
  static async verifyCode(email: string, code: string, realm: Realm = "tenant"): Promise<{ ticket: string }> {
    guard("Code check");
    return apiFetch(realm === "platform" ? "/platform/auth/verify-code" : "/auth/verify-code", {
      method: "POST",
      anonymous: true,
      body: JSON.stringify({ email, code }),
    });
  }

  /** Step 3: set the password. Returns where to send the person next. */
  static async setPassword(
    ticket: string,
    password: string,
    realm: Realm = "tenant"
  ): Promise<{ redirectTo?: string }> {
    guard("Setting a password");
    return apiFetch(realm === "platform" ? "/platform/auth/set-password" : "/auth/set-password", {
      method: "POST",
      anonymous: true,
      body: JSON.stringify({ ticket, password }),
    });
  }

  /** Wording a person can act on. */
  static describeError(error: unknown): string {
    if (error instanceof NotBuiltError) return error.message;
    if (error instanceof ApiError) {
      switch (error.code) {
        case "CODE_INVALID":
          return "That code is not right. Check it and try again.";
        case "CODE_EXPIRED":
          return "That code has expired. Ask for a new one.";
        case "TOO_MANY_ATTEMPTS":
          return "Too many tries. Please wait a few minutes.";
        case "EMAIL_IN_USE":
          return "An account already uses this email address.";
        case "SUBDOMAIN_IN_USE":
          return "That web address is taken. Try another.";
        case "RESERVED_SUBDOMAIN":
          return "That web address is reserved. Try another.";
        case "NETWORK_ERROR":
          return "Cannot reach the server. Check it is running.";
        default:
          return error.message || "Something went wrong. Please try again.";
      }
    }
    return "Something went wrong. Please try again.";
  }
}
