"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

const PTLAB = { navy: "#16202e", orange: "#f05a28", bg: "#f3f4f6" };

type Client = { 
    id: string; 
    name: string; 
    type?: "intro" | "regular" | "ita_job" | "extra"; 
    sessions_remaining: number; 
    historical_attended: number;
    billing_name?: string;
    email?: string;
    phone?: string;
    billing_address?: string;
};
type Booking = { id: string; slot_key: string; client_id: string; processed: boolean; paid?: boolean };

export default function PTReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Invoice State
  const [invoiceClient, setInvoiceClient] = useState<Client | null>(null);
  const [invoiceBookings, setInvoiceBookings] = useState<Booking[]>([]);
  const [unitPrice, setUnitPrice] = useState<number>(75);
  const [customItems, setCustomItems] = useState<{desc: string, date: string, price: number}[]>([]);
  const [newCustomDesc, setNewCustomDesc] = useState("");
  const [newCustomPrice, setNewCustomPrice] = useState("");

  async function loadReportData() {
    setLoading(true);
    const { data: clientData } = await supabase.from('clients').select('*').order('name');
    if (clientData) setClients(clientData as Client[]);
    
    const { data: bookingData } = await supabase.from('bookings').select('*').eq('processed', true);
    if (bookingData) setBookings(bookingData);
    
    setLoading(false);
  }

  useEffect(() => { loadReportData(); }, []);

  async function openInvoice(client: Client) {
    setLoading(true);
    const { data } = await supabase.from('bookings').select('*').eq('client_id', client.id).eq('processed', true).neq('paid', true).order('slot_key', { ascending: true });
    if (data) setInvoiceBookings(data);
    setInvoiceClient(client);
    setUnitPrice(client.type === 'intro' ? 50 : 75);
    setCustomItems([]);
    setLoading(false);
  }

  function addCustomItem() {
      if (!newCustomDesc || !newCustomPrice) return;
      setCustomItems([...customItems, { desc: newCustomDesc, date: new Date().toLocaleDateString('en-AU'), price: parseFloat(newCustomPrice) }]);
      setNewCustomDesc("");
      setNewCustomPrice("");
  }

  async function markInvoicePaid(clientId: string, clientName: string) {
      if (!window.confirm(`Mark all owing sessions as PAID for ${clientName}?\nThis resets their balance to 0.`)) return;
      setLoading(true);
      await supabase.from('clients').update({ sessions_remaining: 0 }).eq('id', clientId);
      await supabase.from('bookings').update({ paid: true }).eq('client_id', clientId).eq('processed', true).neq('paid', true);
      await loadReportData(); 
  }

  // --- TEXT MESSAGE GENERATOR ---
  function sendTextInvoice() {
      if (!invoiceClient?.phone) {
          alert("No phone number found for this client. Please add it in Supabase!");
          return;
      }
      
      const cleanPhone = invoiceClient.phone.replace(/\s+/g, '');
      const msg = `Hi ${displayName}, just letting you know your latest invoice is ready. Total due: $${totalDue.toFixed(2)}. Let me know if you need the PDF sent through. Thanks!`;
      
      // Use window.location to trigger the native SMS app
      window.location.href = `sms:${cleanPhone}&body=${encodeURIComponent(msg)}`;
  }

  // --- AUTOMATED EMAIL GENERATOR ---
  async function sendEmailInvoice() {
      if (!invoiceClient) return;
      
      const targetEmail = invoiceClient.email || "protraininglab84@gmail.com";
      const displayName = invoiceClient.billing_name || invoiceClient.name;
      
      setIsSendingEmail(true);

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #16202e;">
            <h1 style="color: #f05a28; margin-bottom: 5px;">Pro Training Lab</h1>
            <p style="font-size: 12px; color: #666; margin-top: 0; margin-bottom: 20px;">ABN: 18 812 166 780 &nbsp;|&nbsp; 14/1 Avalon Parade Avalon Beach 2107 NSW</p>
            
            <p>Hi <strong>${displayName}</strong>,</p>
            <p>Thank you for your hard work! Here is your latest invoice for <strong>$${totalDue.toFixed(2)}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px;">
                <thead>
                    <tr style="border-bottom: 2px solid #f05a28; text-align: left;">
                        <th style="padding: 8px 0;">Description</th>
                        <th style="padding: 8px 0;">Date</th>
                        <th style="padding: 8px 0; text-align: right;">Cost</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceBookings.map(b => {
                        const datePart = b.slot_key.split('|')[0];
                        const [y, m, d] = datePart.split('-');
                        return `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 8px 0;">${invoiceClient.type === 'intro' ? 'Intro Pack Training' : 'Personal Training'}</td>
                            <td style="padding: 8px 0;">${d}/${m}/${y}</td>
                            <td style="padding: 8px 0; text-align: right;">$${unitPrice.toFixed(2)}</td>
                        </tr>`;
                    }).join('')}
                    ${customItems.map(item => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 8px 0;">${item.desc}</td>
                            <td style="padding: 8px 0;">${item.date}</td>
                            <td style="padding: 8px 0; text-align: right;">$${item.price.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3 style="text-align: right;">Total Due: <span style="color: #f05a28;">$${totalDue.toFixed(2)}</span></h3>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin-top: 30px;">
                <h4 style="margin-top: 0;">Payment Details</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> Luca Tonetti</p>
                <p style="margin: 5px 0;"><strong>BSB:</strong> 923100</p>
                <p style="margin: 5px 0;"><strong>Account:</strong> 301182182</p>
                <p style="font-size: 12px; color: #666; margin-top: 15px;">Please make payment within 7 days. Thank you!</p>
            </div>
            
            <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 30px;">This email serves as your official tax invoice.</p>
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
              alert(`❌ Email failed: ${result.error}`);
          }
      } catch (err) {
          alert("Network error sending email.");
      }
      setIsSendingEmail(false);
  }

  if (loading && clients.length === 0) return <div className="h-screen flex items-center justify-center font-bold text-[#16202e] bg-[#f3f4f6]">Loading PT Reports...</div>;

  const ptClients = clients.filter(c => c.name !== 'Michelle appointment' && c.type !== 'ita_job' && c.type !== 'extra');
  const regularClients = ptClients.filter(c => c.type !== 'intro');
  const introClients = ptClients.filter(c => c.type === 'intro');

  const totalActiveClients = ptClients.length;
  const totalSessionsRemaining = ptClients.reduce((sum, c) => sum + Math.max(0, c.sessions_remaining), 0);
  const totalHistoricalDelivered = ptClients.reduce((sum, c) => sum + c.historical_attended, 0);
  const totalAppDelivered = bookings.filter(b => ptClients.find(c => c.id === b.client_id)).length;
  const totalSessionsDelivered = totalHistoricalDelivered + totalAppDelivered;

  function getRowStyle(balance: number) {
      if (balance > 0) return { text: "In Credit", badge: "bg-green-100 text-green-700", row: "border-b border-gray-50 hover:bg-gray-50" };
      if (balance < 0) return { text: "Owing", badge: "bg-red-100 text-red-700", row: "border-b border-red-100 bg-red-50 hover:bg-red-100/50" };
      return { text: "Up to Date", badge: "bg-gray-100 text-gray-600", row: "border-b border-gray-50 hover:bg-gray-50" };
  }

  // Invoice Calculations
  const invoiceSubtotal = invoiceBookings.length * unitPrice;
  const customTotal = customItems.reduce((sum, item) => sum + item.price, 0);
  const totalDue = invoiceSubtotal + customTotal;
  const todayStr = new Date().toLocaleDateString('en-AU');
  const invoiceNumber = invoiceClient ? Math.floor(Math.random() * 900) + 100 : "000";
  
  // Smart Billing Info
  const displayName = invoiceClient?.billing_name || invoiceClient?.name;
  const displayEmail = invoiceClient?.email || "No email on file";

  return (
    <main className="min-h-screen p-4 md:p-8 font-sans" style={{ backgroundColor: PTLAB.bg, color: PTLAB.navy }}>
      
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

      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold">PTLab Overview</h1>
                <p className="text-gray-500 mt-1">Personal Training Attendance & Payments</p>
            </div>
            <Link href="/"><button className="px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all bg-white border border-gray-200 hover:bg-gray-50 text-[#16202e]">← Back to Calendar</button></Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Total PT Clients</div><div className="text-4xl font-black">{totalActiveClients}</div></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Pre-Paid Sessions</div><div className="text-4xl font-black text-green-600">{totalSessionsRemaining}</div></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">All-Time Sessions</div><div className="text-4xl font-black text-[#f05a28]">{totalSessionsDelivered}</div></div>
        </div>

        {/* REGULAR CLIENTS TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#16202e]">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h2 className="text-lg font-bold">Regular Clients</h2><span className="text-xs font-bold px-2 py-1 bg-gray-200 rounded-full">{regularClients.length}</span></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><th className="px-6 py-4 font-bold">Client Name</th><th className="px-6 py-4 font-bold">Status</th><th className="px-6 py-4 font-bold">Remaining</th><th className="px-6 py-4 font-bold text-center">Invoice</th><th className="px-6 py-4 font-bold text-right">Action</th></tr></thead>
                    <tbody className="text-sm">
                        {regularClients.map(client => {
                            const isOwing = client.sessions_remaining < 0;
                            const style = getRowStyle(client.sessions_remaining);
                            return (
                                <tr key={client.id} className={`transition-colors ${style.row}`}>
                                    <td className="px-6 py-4 font-bold">{client.name}</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.text}</span></td>
                                    <td className="px-6 py-4 font-bold text-lg">{client.sessions_remaining}</td>
                                    <td className="px-6 py-4 text-center">
                                        {isOwing && <button onClick={() => openInvoice(client)} className="px-4 py-1.5 bg-white border-2 border-[#0160C9] text-[#0160C9] font-bold rounded-lg shadow-sm hover:bg-blue-50 transition-colors text-xs uppercase tracking-wider">📄 Create</button>}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isOwing && <button onClick={() => markInvoicePaid(client.id, client.name)} className="px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition-colors text-xs uppercase tracking-wider">✅ Mark Paid</button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* INTRO CLIENTS TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#16202e] border-t-4 border-t-orange-500 mt-8">
            <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex justify-between items-center"><h2 className="text-lg font-bold text-orange-900">Intro Pack Clients</h2><span className="text-xs font-bold px-2 py-1 bg-orange-200 text-orange-900 rounded-full">{introClients.length}</span></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><th className="px-6 py-4 font-bold">Client Name</th><th className="px-6 py-4 font-bold">Status</th><th className="px-6 py-4 font-bold">Remaining</th><th className="px-6 py-4 font-bold text-center">Invoice</th><th className="px-6 py-4 font-bold text-right">Action</th></tr></thead>
                    <tbody className="text-sm">
                        {introClients.map(client => {
                            const isOwing = client.sessions_remaining < 0;
                            const style = getRowStyle(client.sessions_remaining);
                            return (
                                <tr key={client.id} className={`transition-colors ${style.row}`}>
                                    <td className="px-6 py-4 font-bold">{client.name}</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.text}</span></td>
                                    <td className="px-6 py-4 font-bold text-lg">{client.sessions_remaining}</td>
                                    <td className="px-6 py-4 text-center">
                                        {isOwing && <button onClick={() => openInvoice(client)} className="px-4 py-1.5 bg-white border-2 border-orange-500 text-orange-600 font-bold rounded-lg shadow-sm hover:bg-orange-50 transition-colors text-xs uppercase tracking-wider">📄 Create</button>}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isOwing && <button onClick={() => markInvoicePaid(client.id, client.name)} className="px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition-colors text-xs uppercase tracking-wider">✅ Mark Paid</button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
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
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Unit Price ($)</label>
                        <input type="number" className="w-full p-2 border border-gray-300 rounded-lg font-bold text-lg text-[#16202e]" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Add Custom Item</label>
                        <input type="text" placeholder="Description" className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-2 text-[#16202e]" value={newCustomDesc} onChange={e => setNewCustomDesc(e.target.value)} />
                        <div className="flex gap-2">
                            <input type="number" placeholder="Price $" className="w-full p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomPrice} onChange={e => setNewCustomPrice(e.target.value)} />
                            <button onClick={addCustomItem} className="bg-gray-800 text-white px-3 rounded-lg font-bold">+</button>
                        </div>
                    </div>

                    <div className="mt-auto flex flex-col gap-3 pt-6 border-t border-gray-100">
                        {/* EMAIL BUTTON */}
                        <button onClick={sendEmailInvoice} disabled={isSendingEmail} className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl shadow-md hover:bg-gray-900 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                            <span>✉️</span> {isSendingEmail ? "Sending..." : "Email Invoice"}
                        </button>
                        
                        {/* NEW TEXT BUTTON */}
                        <button onClick={sendTextInvoice} className="w-full py-3 bg-green-500 text-white font-bold rounded-xl shadow-md hover:bg-green-600 transition-colors flex justify-center items-center gap-2">
                            <span>💬</span> Text Client
                        </button>

                        {/* PDF BUTTON */}
                        <button onClick={() => {
                            const originalTitle = document.title;
                            document.title = `Invoice_${invoiceNumber}_${displayName}`;
                            window.print();
                            setTimeout(() => { document.title = originalTitle; }, 500);
                        }} className="w-full py-3 bg-[#0160C9] text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors flex justify-center items-center gap-2">
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
                            <div className="w-24 h-24 relative overflow-hidden rounded-full"><Image src="/logo.jpg" alt="PTLab Logo" fill className="object-cover" /></div>
                            <h1 className="text-4xl font-black mt-4 tracking-tight">Pro Training Lab</h1>
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
                            <div className="font-bold">Description</div><div>{invoiceClient.type === 'intro' ? 'Intro Pack Training' : 'Personal Training'}</div>
                            <div className="font-bold">Invoice Terms</div><div>Within 7 days of invoice date</div>
                        </div>

                        <div className="border-t-2 border-[#f05a28] my-6"></div>

                        <table className="w-full text-left mb-8">
                            <thead>
                                <tr className="font-bold">
                                    <th className="pb-3 text-center">Description</th>
                                    <th className="pb-3 text-center">Date</th>
                                    <th className="pb-3 text-center">Quantity</th>
                                    <th className="pb-3 text-center">Unit Price</th>
                                    <th className="pb-3 text-right">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoiceBookings.map((booking, i) => {
                                    const datePart = booking.slot_key.split('|')[0];
                                    const [y, m, d] = datePart.split('-');
                                    return (
                                        <tr key={booking.id}>
                                            <td className="py-1 text-center">{invoiceClient.type === 'intro' ? 'Intro Pack Training' : 'Personal Training'}</td>
                                            <td className="py-1 text-center">{`${d}/${m}/${y}`}</td>
                                            <td className="py-1 text-center">1</td>
                                            <td className="py-1 text-center">${unitPrice.toFixed(2)}</td>
                                            <td className="py-1 text-right">${unitPrice.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                                {customItems.map((item, i) => (
                                    <tr key={i}>
                                        <td className="py-1 text-center">{item.desc}</td>
                                        <td className="py-1 text-center">{item.date}</td>
                                        <td className="py-1 text-center">1</td>
                                        <td className="py-1 text-center">${item.price.toFixed(2)}</td>
                                        <td className="py-1 text-right">${item.price.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex justify-end pt-4 font-bold text-base mb-12 avoid-break">
                            <div className="w-1/2 flex justify-between"><span>Total Due</span><span>${totalDue.toFixed(2)}</span></div>
                        </div>

                        <div className="avoid-break pt-4 border-t-2 border-[#f05a28]">
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
    </main>
  );
}