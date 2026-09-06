import { apiFetch, ApiError } from "./apiClient";

/**
 * Sign-up, one-time codes and password resets.
 *
 * Three journeys, and the realm decides which door they knock on. A new
 * company signs up on the main site, because it has no address of its own
 * yet; a shop worker resets on their company's address; our own staff reset
 * on the console. The last stays separate on purpose — sharing it would let a
 * customer's address start a reset on one of our admin accounts.
 *
 * Every call here is anonymous. The caller has no session: that is the point.
 */

export type Realm = "tenant" | "platform";

/** Which journey a code belongs to. The server keeps them on separate rows. */
export type Purpose = "signup" | "reset";

export interface SignupPayload {
  companyName: string;
  subdomain: string;
  ownerName: string;
  email: string;
  phone?: string;
}

export interface SignupStarted {
  email: string;
  /** How long the code lives, so the screen can say so without guessing. */
  expiresInSeconds: number;
}

export interface SubdomainAvailability {
  available: boolean;
  reason: string | null;
}

function resetPath(realm: Realm, tail: string): string {
  return realm === "platform" ? `/platform/auth/${tail}` : `/auth/${tail}`;
}

export class RegistrationService {
  /** Step 1 of sign-up: hold the details, email a code. Nothing is created yet. */
  static async startSignup(payload: SignupPayload): Promise<SignupStarted> {
    return apiFetch("/auth/signup", {
      method: "POST",
      anonymous: true,
      body: JSON.stringify(payload),
    });
  }

  /** Is this web address free? Checked as the person types. */
  static async checkSubdomain(subdomain: string): Promise<SubdomainAvailability> {
    return apiFetch(`/auth/signup/subdomain?value=${encodeURIComponent(subdomain)}`, {
      method: "GET",
      anonymous: true,
    });
  }

  /** Ask for a reset code. Answers the same way whether or not the address has an account. */
  static async requestCode(email: string, realm: Realm = "tenant"): Promise<void> {
    await apiFetch(resetPath(realm, "forgot-password"), {
      method: "POST",
      anonymous: true,
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Send another code for a request already in flight.
   *
   * Sign-up and reset are different rows on the server, so they are different
   * endpoints here. Asking the reset endpoint to resend a sign-up code would
   * quietly do nothing — there is no account yet to reset — and the person
   * would wait for mail that never comes.
   */
  static async resendCode(
    email: string,
    purpose: Purpose = "reset",
    realm: Realm = "tenant"
  ): Promise<void> {
    if (purpose === "signup") {
      await apiFetch("/auth/signup/resend", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ email }),
      });
      return;
    }
    await RegistrationService.requestCode(email, realm);
  }

  /** Step 2: check the code. Returns a short-lived ticket for step 3. */
  static async verifyCode(
    email: string,
    code: string,
    realm: Realm = "tenant",
    purpose: Purpose = "reset"
  ): Promise<{ ticket: string }> {
    return apiFetch(resetPath(realm, "verify-code"), {
      method: "POST",
      anonymous: true,
      body: JSON.stringify({ email, code, purpose }),
    });
  }

  /**
   * Step 3: set the password.
   *
   * For a reset that is one account. For a sign-up it provisions the whole
   * company, and `redirectTo` is the address its people sign in at from now
   * on — which is why the screen sends them there rather than back to the
   * page they started on.
   */
  static async setPassword(
    ticket: string,
    password: string,
    realm: Realm = "tenant",
    purpose: Purpose = "reset"
  ): Promise<{ redirectTo?: string | null }> {
    return apiFetch(resetPath(realm, "set-password"), {
      method: "POST",
      anonymous: true,
      body: JSON.stringify({ ticket, password, purpose }),
    });
  }

  /** Wording a person can act on. */
  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      switch (error.code) {
        case "CODE_INVALID":
          return "That code is not right. Check it and try again.";
        case "CODE_EXPIRED":
          return "That code has expired. Ask for a new one.";
        case "TOO_MANY_ATTEMPTS":
          return "Too many tries. Ask for a new code.";
        case "RESEND_TOO_SOON":
          return "A code was just sent. Wait a moment before asking for another.";
        case "THROTTLED":
          return "Too many attempts. Please wait a few minutes and try again.";
        case "TICKET_INVALID":
          return "This step has expired. Start again from the beginning.";
        case "EMAIL_IN_USE":
          return "An account already uses this email address.";
        case "SUBDOMAIN_IN_USE":
          return "That web address is taken. Try another.";
        case "RESERVED_SUBDOMAIN":
          return "That web address is reserved. Try another.";
        case "INVALID_SUBDOMAIN":
          return (
            error.message ||
            "A web address may use lowercase letters, digits and hyphens only."
          );
        case "VALIDATION_ERROR":
          return error.message || "Check the details and try again.";
        case "NETWORK_ERROR":
          return "Cannot reach the server. Check it is running.";
        default:
          return error.message || "Something went wrong. Please try again.";
      }
    }
    return "Something went wrong. Please try again.";
  }
}
