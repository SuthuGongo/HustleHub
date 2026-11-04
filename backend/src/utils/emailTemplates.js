// Every branded HTML email the app sends goes through this file, so they all look consistent - the
// same flat warm-paper / deep-green look as the site itself, built with the colours from
// frontend/src/styles/index.css. Email clients strip <style> blocks unpredictably and never load web
// fonts reliably, so every rule here is inline and the font stack is a plain system one - the one part
// of this app where "no external stylesheet, no custom font" is a requirement, not a design choice.
const BG = '#f6f3ec';
const SURFACE = '#fffefc';
const TEXT = '#1d1c1a';
const MUTED = '#5b5851';
const ACCENT = '#1f6a4f';
const BORDER = '#e4ded0';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The shared shell every email is wrapped in: the wordmark, a white card on a warm background, and a
// quiet footer - `bodyHtml` is whatever that particular email needs to say inside the card.
function shell(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:${BG};font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="padding-bottom:22px;text-align:center;">
          <span style="font-size:22px;font-weight:800;color:${TEXT};letter-spacing:-0.01em;">HustleHub<span style="color:${ACCENT};">+</span></span>
        </td>
      </tr>
      <tr>
        <td style="background:${SURFACE};border:1px solid ${BORDER};border-radius:16px;padding:32px 28px;">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding-top:20px;text-align:center;font-size:12px;color:${MUTED};">
          HustleHub+ - a marketplace where freelancers list what they do and clients book it.<br />
          This is a demo project; no real money moves through it.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// The registration / 2FA / password-reset email: a heading, one line of context, the code itself in
// a large, letter-spaced, unmissable block, and a short safety note.
function codeEmailHtml({ heading, intro, code }) {
  return shell(`
    <h1 style="margin:0 0 12px;font-size:19px;color:${TEXT};">${heading}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${MUTED};">${intro}</p>
    <div style="background:${BG};border:1px solid ${BORDER};border-radius:12px;padding:18px;text-align:center;margin-bottom:22px;">
      <span style="font-size:32px;font-weight:800;letter-spacing:0.35em;color:${ACCENT};font-family:Consolas,Menlo,monospace;">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">
      This code expires in 10 minutes and can only be used once. If you did not request this, you can safely ignore this email - your account stays protected as long as your password does.
    </p>
  `);
}

// A reply an admin sent from the Contact page's inbox, with the person's own original message quoted
// underneath for context, and their reference number so a follow-up is easy to match up.
function replyEmailHtml({ replyText, originalMessage, reference }) {
  const escapedReply = replyText.replace(/\n/g, '<br />');
  const escapedOriginal = originalMessage.replace(/\n/g, '<br />');
  return shell(`
    <h1 style="margin:0 0 4px;font-size:19px;color:${TEXT};">A reply to your message</h1>
    <p style="margin:0 0 20px;font-size:13px;color:${MUTED};">Reference ${reference}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${TEXT};">${escapedReply}</p>
    <div style="border-left:3px solid ${BORDER};padding:2px 0 2px 16px;margin:0;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Your original message</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">${escapedOriginal}</p>
    </div>
  `);
}

module.exports = { codeEmailHtml, replyEmailHtml };
