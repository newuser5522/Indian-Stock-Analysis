export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Password reset email is not configured (set RESEND_API_KEY and AUTH_EMAIL_FROM)");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your FinTrack password",
      text: `Use this link to reset your FinTrack password. It expires in 30 minutes:\n\n${resetUrl}\n\nIf you did not request a reset, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const responseText = await response.text();
    console.error("Password reset email provider rejected the request", {
      status: response.status,
      response: responseText.slice(0, 500),
    });
    throw new Error("Password reset email could not be sent");
  }
}
