import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// This securely pulls your key from the .env.local file
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { emailTo, clientName, invoiceNumber, totalDue, htmlBody } = await req.json();

    const data = await resend.emails.send({
      from: 'PTLab Invoicing <onboarding@resend.dev>', // Resend's required default sender
      to: [emailTo], 
      bcc: ['luca.toniz84@gmail.com'], // Silently copies you on every invoice!
      subject: `Invoice #${invoiceNumber} - ${clientName}`,
      html: htmlBody,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}