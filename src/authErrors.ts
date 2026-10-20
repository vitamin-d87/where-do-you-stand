export function signInError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Sign-in failed";
  if (/email rate limit|over_email_send_rate_limit/i.test(message))
    return "The email service has reached its hourly sending limit. No new code was sent. Wait for the limit to reset before requesting another code, or use your survey password if you have set one.";
  if (/signups not allowed for otp/i.test(message))
    return "This email is not registered for the survey. Check the exact address authorised by your organiser, including gmail.com or googlemail.com.";
  if (/security purposes.*seconds|too many requests/i.test(message))
    return "Please wait before requesting another email code. Repeated requests can delay delivery.";
  return message;
}
