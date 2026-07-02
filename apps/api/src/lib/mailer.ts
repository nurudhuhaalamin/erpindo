import type { Env } from "../env";

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Dev/test: email dicetak ke log wrangler sehingga link bisa diambil manual. */
class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}

/** Produksi: kirim via Resend bila RESEND_API_KEY tersedia. */
class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(mail: Mail): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      console.error(`[mail] resend gagal (${res.status}): ${await res.text()}`);
    }
  }
}

export function getMailer(env: Env): Mailer {
  if (env.RESEND_API_KEY) {
    return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM ?? "erpindo <no-reply@erpindo.id>");
  }
  return new ConsoleMailer();
}
