import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// This securely pulls your key from the .env.local file (or Vercel settings)
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { emailTo, clientName, invoiceNumber, totalDue, htmlBody } = await req.json();

    // 1. Send the actual invoice directly to the client (Removed the BCC)
    const clientEmail = await resend.emails.send({
      from: 'Pro Training Lab <invoices@protraininglab.com.au>', 
      to: [emailTo], 
      subject: `Invoice #${invoiceNumber} - ${clientName}`,
      html: htmlBody,
    });

    // 2. Build a special "Admin Receipt" just for you
    const adminSummary = `
      <div style="font-family: Arial, sans-serif; background-color: #eef2f6; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #0160C9;">
        <h2 style="margin-top: 0; color: #16202e;">✅ System Delivery Receipt</h2>
        <p style="margin: 5px 0;"><strong>Client:</strong> ${clientName}</p>
        <p style="margin: 5px 0;"><strong>Emailed To:</strong> <a href="mailto:${emailTo}">${emailTo}</a></p>
        <p style="margin: 5px 0;"><strong>Invoice #:</strong> ${invoiceNumber}</p>
        <p style="margin: 5px 0;"><strong>Amount Due:</strong> $${Number(totalDue).toFixed(2)}</p>
        <p style="margin: 15px 0 0 0; font-size: 12px; color: #666;">Below is the exact copy of the invoice that was sent to the client.</p>
      </div>
      <hr style="border: none; border-top: 1px dashed #ccc; margin: 20px 0;" />
      ${htmlBody}
    `;

    // 3. Send the Admin Receipt to your personal inbox
    const adminEmail = await resend.emails.send({
      from: 'PTLab System <invoices@protraininglab.com.au>',
      to: ['luca.toniz84@gmail.com'], // Goes straight to your inbox
      subject: `🧾 SENT: Invoice #${invoiceNumber} to ${clientName}`,
      html: adminSummary,
    });

    return NextResponse.json({ success: true, data: { clientEmail, adminEmail } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}