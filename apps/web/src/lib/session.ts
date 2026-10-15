"use client";

/** Lets the header's user menu refresh after a sign-in or sign-out elsewhere on the page. */
export const AUTH_EVENT = "auth-changed";

export function announceAuthChange() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}
