"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

type Client = { 
    id: string; 
    name: string; 
    type: string; 
    sessions_remaining: number; 
    historical_attended: number;
    billing_name?: string;
    email?: string;
    phone?: string;
    billing_address?: string;
};
type Booking = { id: string; slot_key: string; client_id: string; processed: boolean; paid?: boolean };

export default function ItaReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Invoice State
  const [invoiceClient, setInvoiceClient] = useState<Client | null>(null);
  const [invoiceDates, setInvoiceDates] = useState<string[]>([]);
  const [unitPrice, setUnitPrice] = useState<number>(70);
  const [customItems, setCustomItems] = useState<{desc: string, date: string, qty: number, price: number}[]>([]);
  const [newCustomDesc, setNewCustomDesc] = useState("");
  const [newCustomQty, setNewCustomQty] = useState("1");
  const [newCustomPrice, setNewCustomPrice] = useState("");

  async function loadReportData() {
    setLoading(true);
    const { data: clientData } = await supabase.from('clients').select('*').eq('type', 'ita_job').order('name');
    if (clientData) {
        setClients(clientData as Client[]);
    }
    setLoading(false);
  }

  useEffect(() => { loadReportData(); }, []);

  async function openInvoice(client: Client) {
    setLoading(true);
    const { data, error } = await supabase.from('bookings').select('slot_key').eq('client_id', client.id).eq('processed', true).neq('paid', true).order('slot_key', { ascending: true });
    if (error) { alert("Database error."); setLoading(false); return; }

    const rawDates = Array.from(new Set((data || []).map(b => b.slot_key.split('|')[0])));
    const formattedDates = rawDates.map(d => {
        const [y, m, day] = d.split('-');
        return `${day}/${m}/${y}`;
    });

    setInvoiceDates(formattedDates);
    setInvoiceClient(client);
    setUnitPrice(70);
    setCustomItems([]);
    setLoading(false);
  }

  function addCustomItem() {
      if (!newCustomDesc || !newCustomPrice || !newCustomQty) return;
      setCustomItems([...customItems, { 
          desc: newCustomDesc, 
          date: new Date().toLocaleDateString('en-AU'), 
          qty: parseFloat(newCustomQty),
          price: parseFloat(newCustomPrice) 
      }]);
      setNewCustomDesc("");
      setNewCustomPrice("");
      setNewCustomQty("1");
  }

  async function markInvoicePaid(clientId: string, clientName: string) {
      if (!window.confirm(`Mark all owing hours as PAID for ${clientName}?\nThis resets their balance to 0 and clears these dates.`)) return;
      setLoading(true);
      await supabase.from('clients').update({ sessions_remaining: 0 }).eq('id', clientId);
      await supabase.from('bookings').update({ paid: true }).eq('client_id', clientId).eq('processed', true).neq('paid', true);
      await loadReportData(); 
  }

  // --- AUTOMATED EMAIL GENERATOR ---
  async function sendEmailInvoice() {
      if (!invoiceClient) return;
      
      const targetEmail = invoiceClient.email || "protraininglab84@gmail.com";
      const displayName = invoiceClient.billing_name || invoiceClient.name;
      
      setIsSendingEmail(true);

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #16202e;">
            <h1 style="color: #15803d;">The Italian Job</h1>
            <p>Hi <strong>${displayName}</strong>,</p>
            <p>Thank you for your business! Here is your latest invoice for <strong>$${totalDue.toFixed(2)}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px;">
                <thead>
                    <tr style="border-bottom: 2px solid #15803d; text-align: left;">
                        <th style="padding: 8px 0;">Description</th>
                        <th style="padding: 8px 0;">Date(s)</th>
                        <th style="padding: 8px 0; text-align: right;">Cost</th>
                    </tr>
                </thead>
                <tbody>
                    ${unpaidHours > 0 ? `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px 0;">Landscaping Labour (${unpaidHours} hrs)</td>
                        <td style="padding: 8px 0; font-size: 12px; color: #666;">${invoiceDates.join(', ')}</td>
                        <td style="padding: 8px 0; text-align: right;">$${(unpaidHours * unitPrice).toFixed(2)}</td>
                    </tr>` : ''}
                    ${customItems.map(item => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 8px 0;">${item.desc} (x${item.qty})</td>
                            <td style="padding: 8px 0;">${item.date}</td>
                            <td style="padding: 8px 0; text-align: right;">$${(item.qty * item.price).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3 style="text-align: right;">Total Due: <span style="color: #15803d;">$${totalDue.toFixed(2)}</span></h3>
            
            <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin-top: 30px; border: 1px solid #bbf7d0;">
                <h4 style="margin-top: 0; color: #166534;">Payment Details</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> Luca Tonetti</p>
                <p style="margin: 5px 0;"><strong>BSB:</strong> 923100</p>
                <p style="margin: 5px 0;"><strong>Account:</strong> 301182182</p>
                <p style="font-size: 12px; color: #166534; margin-top: 15px;">Please make payment within 7 days. Thank you!</p>
            </div>
        </div>
      `;

      try {
          const response = await fetch('/api/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  emailTo: targetEmail,
                  clientName: displayName,
                  invoiceNumber: invoiceNumber,
                  totalDue: totalDue,
                  htmlBody: htmlBody
              })
          });
          
          const result = await response.json();
          if (result.success) {
              alert(`✅ Invoice successfully emailed to ${targetEmail}!`);
          } else {
              alert(`❌ Email failed: ${result.error}\n\n(Note: If on free tier, ensure the email is verified in Resend).`);
          }
      } catch (err) {
          alert("Network error sending email.");
      }
      setIsSendingEmail(false);
  }

  if (loading && clients.length === 0) return <div className="h-screen flex items-center justify-center font-bold text-green-800 bg-green-50">Loading Ita Jobs...</div>;

  const totalUnpaidHours = clients.reduce((sum, c) => sum + (c.sessions_remaining < 0 ? Math.abs(c.sessions_remaining) : 0), 0);
  const totalHistoricalHours = clients.reduce((sum, c) => sum + c.historical_attended, 0);

  // Invoice Calculations
  const unpaidHours = invoiceClient ? Math.abs(invoiceClient.sessions_remaining) : 0;
  const invoiceSubtotal = unpaidHours * unitPrice;
  const customTotal = customItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalDue = invoiceSubtotal + customTotal;
  const todayStr = new Date().toLocaleDateString('en-AU');
  const invoiceNumber = invoiceClient ? Math.floor(Math.random() * 900) + 100 : "000";

  // Smart Billing Info
  const displayName = invoiceClient?.billing_name || invoiceClient?.name;
  const displayEmail = invoiceClient?.email || "No email on file";

  return (
    <main className="min-h-screen p-4 md:p-8 font-sans bg-green-50 text-[#166534]">
      
      <style dangerouslySetInnerHTML={{__html: `
        @page { margin: 0mm; } 
        @media print {
            body * { visibility: hidden; }
            #printable-invoice, #printable-invoice * { visibility: visible; }
            #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 50px !important; box-sizing: border-box; }
            .fixed { position: absolute !important; }
            .overflow-y-auto { overflow: visible !important; }
            .no-print { display: none !important; }
            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}} />

      <div className="max-w-5xl mx-auto space-y-8 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold text-green-800">The Ita Job Dashboard</h1>
                <p className="text-green-600 mt-1">Handyman & Gardening Invoicing</p>
            </div>
            <Link href="/"><button className="px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all bg-white border border-green-200 text-green-700 hover:bg-green-100">← Back to Calendar</button></Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100"><div className="text-sm font-bold text-green-600 uppercase tracking-wider mb-2">Active Jobs</div><div className="text-4xl font-black text-green-800">{clients.length}</div></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100"><div className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2">Total Unpaid Hours</div><div className="text-4xl font-black text-red-600">{totalUnpaidHours}</div></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100"><div className="text-sm font-bold text-green-600 uppercase tracking-wider mb-2">All-Time Hours Logged</div><div className="text-4xl font-black text-green-800">{totalHistoricalHours}</div></div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden text-[#16202e]">
            <div className="px-6 py-4 border-b border-green-100 bg-white flex justify-between items-center"><h2 className="text-lg font-bold text-green-800">Invoice Tracking</h2></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-green-600 bg-green-50/30"><th className="px-6 py-4 font-bold">Client / Job Name</th><th className="px-6 py-4 font-bold">Unpaid Hours</th><th className="px-6 py-4 font-bold text-center">Invoice</th><th className="px-6 py-4 font-bold">All-Time Billed</th><th className="px-6 py-4 font-bold text-right">Action</th></tr></thead>
                    <tbody className="text-sm">
                        {clients.map(client => {
                            const unpaid = client.sessions_remaining < 0 ? Math.abs(client.sessions_remaining) : 0;
                            const isOwing = unpaid > 0;
                            return (
                                <tr key={client.id} className={`transition-colors border-b border-gray-50 ${isOwing ? 'bg-red-50/30 hover:bg-red-50/80' : 'hover:bg-green-50/30'}`}>
                                    <td className="px-6 py-5 font-bold text-base">{client.name}</td>
                                    <td className="px-6 py-5">{isOwing ? <span className="text-red-600 font-black text-lg">{unpaid} hrs</span> : <span className="text-gray-400 font-bold px-2 py-1 bg-gray-100 rounded text-xs">All Paid</span>}</td>
                                    <td className="px-6 py-5 text-center">{isOwing && <button onClick={() => openInvoice(client)} className="px-4 py-2 bg-white border-2 border-green-500 text-green-600 font-bold rounded-lg shadow-sm hover:bg-green-50 transition-colors text-xs uppercase tracking-wider">📄 Create</button>}</td>
                                    <td className="px-6 py-5 font-medium text-gray-500">{client.historical_attended} hrs</td>
                                    <td className="px-6 py-5 text-right">{isOwing && <button onClick={() => markInvoicePaid(client.id, client.name)} className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition-colors text-xs uppercase tracking-wider">✅ Mark Paid</button>}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* --- INVOICE MODAL --- */}
        {invoiceClient && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-6 overflow-y-auto backdrop-blur-sm">
                <div className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden border border-gray-300">
                    
                    {/* INVOICE CONTROLS */}
                    <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-6 flex flex-col gap-6 no-print">
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-[#16202e]">Invoice Settings</h3>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Hourly Rate ($)</label>
                            <input type="number" className="w-full p-2 border border-gray-300 rounded-lg font-bold text-lg text-[#16202e]" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} />
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Add Extra Item</label>
                            <input type="text" placeholder="e.g. Pine Bark Fine Mulch" className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-2 text-[#16202e]" value={newCustomDesc} onChange={e => setNewCustomDesc(e.target.value)} />
                            <div className="flex gap-2 mb-2">
                                <input type="number" placeholder="Qty" className="w-1/3 p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomQty} onChange={e => setNewCustomQty(e.target.value)} />
                                <input type="number" placeholder="Price $" className="w-2/3 p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomPrice} onChange={e => setNewCustomPrice(e.target.value)} />
                            </div>
                            <button onClick={addCustomItem} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold transition-colors">Add Item</button>
                        </div>

                        <div className="mt-auto flex flex-col gap-3 pt-6 border-t border-gray-100">
                            {/* THE NEW EMAIL BUTTON */}
                            <button onClick={sendEmailInvoice} disabled={isSendingEmail} className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl shadow-md hover:bg-gray-900 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                                <span>✉️</span> {isSendingEmail ? "Sending..." : "Email Invoice"}
                            </button>

                            <button onClick={() => {
                                const originalTitle = document.title;
                                document.title = `Invoice_${invoiceNumber}_${displayName}`;
                                window.print();
                                setTimeout(() => { document.title = originalTitle; }, 500);
                            }} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 transition-colors flex justify-center items-center gap-2">
                                <span>📄</span> Save PDF / Share
                            </button>
                            <button onClick={() => setInvoiceClient(null)} className="w-full py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                                Close
                            </button>
                        </div>
                    </div>

                    {/* ACTUAL PRINTABLE INVOICE */}
                    <div className="flex-1 p-4 md:p-8 bg-gray-100 overflow-y-auto">
                        <div id="printable-invoice" className="bg-white mx-auto shadow-sm p-8 md:p-12 text-[#16202e] text-sm" style={{ width: '100%', maxWidth: '800px', fontFamily: 'Arial, sans-serif' }}>
                            
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-32 h-32 relative overflow-hidden"><Image src="/ita-logo.jpg" alt="The Italian Job Logo" fill className="object-contain" /></div>
                                <h1 className="text-4xl font-black mt-4 tracking-tight">The Italian Job</h1>
                            </div>

                            <div className="text-center mb-10 text-xs font-medium">ABN: 18 812 166 780 &nbsp; 14/1 Avalon Parade Avalon Beach 2107 NSW</div>

                            <div className="grid grid-cols-2 gap-y-4 mb-8">
                                <div className="font-bold">Attention to</div>
                                <div className="flex justify-between">
                                    <div>
                                        <div className="font-bold">{displayName}</div>
                                        <div className="text-xs text-gray-500">{displayEmail}</div>
                                        {invoiceClient.billing_address && <div className="text-xs text-gray-500">{invoiceClient.billing_address}</div>}
                                    </div>
                                    <div><span className="font-bold mr-4">Invoice Number</span>{invoiceNumber}</div>
                                </div>

                                <div className="font-bold">Date</div><div>{todayStr}</div>
                                <div className="font-bold">Description</div><div>Landscaping & Handyman Services</div>
                                <div className="font-bold">Invoice Terms</div><div>Within 7 days of invoice date</div>
                            </div>

                            <div className="border-t-2 border-green-700 my-6"></div>

                            <table className="w-full text-left mb-8">
                                <thead>
                                    <tr className="font-bold">
                                        <th className="pb-3 text-center">Description</th>
                                        <th className="pb-3 text-center">Date(s)</th>
                                        <th className="pb-3 text-center">Quantity (Hrs)</th>
                                        <th className="pb-3 text-center">Unit Price</th>
                                        <th className="pb-3 text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unpaidHours > 0 && (
                                        <tr className="font-bold bg-green-50/50">
                                            <td className="py-2 text-center">Landscaping Labour</td>
                                            <td className="py-2 text-center text-xs text-gray-600 max-w-[200px] leading-relaxed">
                                                {invoiceDates.length > 0 ? invoiceDates.join(', ') : todayStr}
                                            </td>
                                            <td className="py-2 text-center">{unpaidHours}</td>
                                            <td className="py-2 text-center">${unitPrice.toFixed(2)}</td>
                                            <td className="py-2 text-right">${(unpaidHours * unitPrice).toFixed(2)}</td>
                                        </tr>
                                    )}
                                    {customItems.map((item, i) => (
                                        <tr key={i}>
                                            <td className="py-2 text-center">{item.desc}</td>
                                            <td className="py-2 text-center">{item.date}</td>
                                            <td className="py-2 text-center">{item.qty}</td>
                                            <td className="py-2 text-center">${item.price.toFixed(2)}</td>
                                            <td className="py-2 text-right">${(item.qty * item.price).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-end pt-4 font-bold text-base mb-12 avoid-break">
                                <div className="w-1/2 flex justify-between"><span>Total Due</span><span>${totalDue.toFixed(2)}</span></div>
                            </div>

                            <div className="avoid-break pt-4 border-t-2 border-green-700">
                                <div className="space-y-1 mt-4 text-sm">
                                    <div className="font-bold">Name: Luca Tonetti</div>
                                    <div className="font-bold">BSB: 923100</div>
                                    <div className="font-bold">Account Number: 301182182</div>
                                    <div className="pt-4 pb-4">Please make payment within 7 days. If you have any questions, feel free to reach out.</div>
                                    <div className="font-bold pb-2">Contact Information</div>
                                    <div className="font-bold">Email: <a href="mailto:luca.toniz84@gmail.com" className="underline">luca.toniz84@gmail.com</a></div>
                                    <div className="font-bold">Phone: 0416 058 046</div>
                                    <div className="pt-6">Thank you for choosing my services. It was a pleasure working with you!</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </main>
  );
}