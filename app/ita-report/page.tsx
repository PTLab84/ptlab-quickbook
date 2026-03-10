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

// NEW: Universal Line Item Type
type LineItem = {
    id: string;
    desc: string;
    date: string;
    qty: number;
    rate: number;
    isLabour?: boolean;
};

export default function ItaReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Invoice State
  const [invoiceClient, setInvoiceClient] = useState<Client | null>(null);
  const [invoiceBookings, setInvoiceBookings] = useState<Booking[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<LineItem[]>([]); // Unified editable rows
  const [unitPrice, setUnitPrice] = useState<number>(70);
  
  const [newCustomDesc, setNewCustomDesc] = useState("");
  const [newCustomQty, setNewCustomQty] = useState("1");
  const [newCustomPrice, setNewCustomPrice] = useState("");
  const [newCustomDate, setNewCustomDate] = useState("");
  
  const [invoiceNumber, setInvoiceNumber] = useState<number>(0);
  const [hasIncremented, setHasIncremented] = useState<boolean>(false);

  async function loadReportData() {
    setLoading(true);
    const { data: clientData } = await supabase.from('clients').select('*').eq('type', 'ita_job').order('name');
    if (clientData) setClients(clientData as Client[]);
    setLoading(false);
  }

  useEffect(() => { 
      loadReportData(); 
      setNewCustomDate(new Date().toISOString().split('T')[0]); 
  }, []);

  async function openInvoice(client: Client) {
    setLoading(true);
    const { data, error } = await supabase.from('bookings').select('*').eq('client_id', client.id).eq('processed', true).neq('paid', true).order('slot_key', { ascending: true });
    if (error) { alert("Database error."); setLoading(false); return; }

    const rawDates = Array.from(new Set((data || []).map(b => b.slot_key.split('|')[0])));
    const formattedDates = rawDates.map(d => {
        const [y, m, day] = d.split('-');
        return `${day}/${m}/${y}`;
    });

    setInvoiceBookings(data || []);
    
    // Fetch Next Invoice Number
    setHasIncremented(false);
    const { data: settingsData } = await supabase.from('settings').select('value').eq('id', 'next_invoice').single();
    setInvoiceNumber(settingsData ? settingsData.value : 205);

    setInvoiceClient(client);
    setUnitPrice(70);
    
    // BUILD INITIAL EDITABLE LINE ITEMS
    const unpaidHours = Math.abs(client.sessions_remaining);
    const totalBlocks = (data || []).length;
    let remainingHoursToAllocate = unpaidHours;
    const initialLines: LineItem[] = [];

    if (formattedDates.length > 0) {
        formattedDates.forEach((dateStr, index) => {
            const blocksThisDay = (data || []).filter(b => {
                const [y, m, day] = b.slot_key.split('|')[0].split('-');
                return `${day}/${m}/${y}` === dateStr;
            }).length;
            
            let hours = 0;
            if (index === formattedDates.length - 1 || totalBlocks === 0) {
                hours = Number(remainingHoursToAllocate.toFixed(2));
            } else {
                hours = Number(((blocksThisDay / totalBlocks) * unpaidHours).toFixed(2));
                remainingHoursToAllocate -= hours;
            }
            initialLines.push({ id: `labour-${index}`, desc: 'Landscaping Labour', date: dateStr, qty: hours, rate: 70, isLabour: true });
        });
    } else if (unpaidHours > 0) {
        initialLines.push({ id: `labour-0`, desc: 'Landscaping Labour', date: new Date().toLocaleDateString('en-AU'), qty: unpaidHours, rate: 70, isLabour: true });
    }

    setInvoiceLines(initialLines);
    setNewCustomDate(new Date().toISOString().split('T')[0]);
    setLoading(false);
  }

  // --- EDITABLE INVOICE FUNCTIONS ---
  function updateLine(id: string, field: keyof LineItem, value: any) {
      setInvoiceLines(prev => prev.map(line => line.id === id ? { ...line, [field]: value } : line));
  }

  async function removeLine(lineId: string, dateStr?: string) {
      if (dateStr) {
          if (!window.confirm(`Remove ${dateStr} from this invoice?\n(This removes the date from the list but DOES NOT change the financial balance).`)) return;
          const [d, m, y] = dateStr.split('/');
          const isoDate = `${y}-${m}-${d}`;
          const bookingsToDelete = invoiceBookings.filter(b => b.slot_key.startsWith(isoDate));
          const idsToDelete = bookingsToDelete.map(b => b.id);
          if (idsToDelete.length > 0) await supabase.from('bookings').delete().in('id', idsToDelete);
          setInvoiceBookings(prev => prev.filter(b => !idsToDelete.includes(b.id)));
          loadReportData();
      }
      setInvoiceLines(prev => prev.filter(l => l.id !== lineId));
  }

  function handleUnitPriceChange(newRate: number) {
      setUnitPrice(newRate);
      // Auto-update all labour items if the global rate changes
      setInvoiceLines(prev => prev.map(line => line.isLabour ? { ...line, rate: newRate } : line));
  }

  function addCustomItem() {
      if (!newCustomDesc || !newCustomPrice || !newCustomQty || !newCustomDate) return;
      const [y, m, d] = newCustomDate.split('-');
      const displayDate = `${d}/${m}/${y}`;
      setInvoiceLines([...invoiceLines, { id: `custom-${Date.now()}`, desc: newCustomDesc, date: displayDate, qty: parseFloat(newCustomQty), rate: parseFloat(newCustomPrice) }]);
      setNewCustomDesc(""); setNewCustomPrice(""); setNewCustomQty("1");
      setNewCustomDate(new Date().toISOString().split('T')[0]);
  }

  // --- BILLING ADJUSTMENT (ROUNDING) ---
  function addAutoRounding() {
      const currentTotal = invoiceLines.reduce((sum, line) => sum + (line.qty * line.rate), 0);
      const remainder = currentTotal % 10;
      if (remainder !== 0) {
          setInvoiceLines(prev => [...prev, { id: `adj-${Date.now()}`, desc: 'Billing Adjustment', date: new Date().toLocaleDateString('en-AU'), qty: 1, rate: -remainder }]);
      }
  }

  function addManualAdjustment() {
      const amt = parseFloat(prompt("Enter discount amount (e.g. 15):") || "0");
      if (amt > 0) {
          setInvoiceLines(prev => [...prev, { id: `adj-${Date.now()}`, desc: 'Billing Adjustment', date: new Date().toLocaleDateString('en-AU'), qty: 1, rate: -Math.abs(amt) }]);
      }
  }

  async function markInvoicePaid(clientId: string, clientName: string) {
      if (!window.confirm(`Mark all owing hours as PAID for ${clientName}?\nThis resets their balance to 0 and clears these dates.`)) return;
      setLoading(true);
      await supabase.from('clients').update({ sessions_remaining: 0 }).eq('id', clientId);
      await supabase.from('bookings').update({ paid: true }).eq('client_id', clientId).eq('processed', true).neq('paid', true);
      await loadReportData(); 
  }

  async function markInvoiceAsIssued() {
      if (!hasIncremented && invoiceNumber > 0) {
          setHasIncremented(true);
          await supabase.from('settings').upsert({ id: 'next_invoice', value: invoiceNumber + 1 });
      }
  }

  // ==========================================
  // INVOICE CALCULATIONS & SAFE VARIABLES
  // ==========================================
  const totalDue = invoiceLines.reduce((sum, item) => sum + (item.qty * item.rate), 0);
  const todayStr = new Date().toLocaleDateString('en-AU');
  const displayName: string = String(invoiceClient?.billing_name || invoiceClient?.name || "Client");
  const displayEmail: string = String(invoiceClient?.email || "No email on file");

  // ==========================================
  // ACTION BUTTONS
  // ==========================================
  function sendTextInvoice() {
      if (!invoiceClient || !invoiceClient.phone) { alert("No phone number found for this client!"); return; }
      markInvoiceAsIssued();
      const cleanPhone = String(invoiceClient.phone).replace(/\s+/g, '');
      const firstName = displayName.split(' ')[0]; 
      const msg = `Hi ${firstName}, just letting you know your latest invoice is ready. Total due: $${totalDue.toFixed(2)}. Let me know if you need the PDF sent through. Thanks!`;
      window.location.href = `sms:${cleanPhone}?body=${encodeURIComponent(msg)}`;
  }

  async function sendEmailInvoice() {
      if (!invoiceClient) return;
      markInvoiceAsIssued();
      const targetEmail = invoiceClient.email || "protraininglab84@gmail.com";
      setIsSendingEmail(true);

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #16202e;">
            <h1 style="color: #15803d; margin-bottom: 5px;">The Italian Job</h1>
            <p style="font-size: 12px; color: #666; margin-top: 0; margin-bottom: 15px;">ABN: 18 812 166 780 &nbsp;|&nbsp; 14/1 Avalon Parade Avalon Beach 2107 NSW</p>

            <p>Hi <strong>${displayName}</strong>,</p>
            <p>Thank you for your business! Here is your latest invoice for <strong>$${totalDue.toFixed(2)}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px;">
                <thead>
                    <tr style="border-bottom: 2px solid #15803d; text-align: left;">
                        <th style="padding: 4px 0;">Description</th>
                        <th style="padding: 4px 0;">Date</th>
                        <th style="padding: 4px 0; text-align: center;">Qty (Hrs)</th>
                        <th style="padding: 4px 0; text-align: center;">Rate</th>
                        <th style="padding: 4px 0; text-align: right;">Cost</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceLines.map(line => `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 4px 0; font-size: 14px;">${line.desc}</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #666;">${line.date}</td>
                        <td style="padding: 4px 0; font-size: 14px; text-align: center;">${line.qty}</td>
                        <td style="padding: 4px 0; font-size: 14px; text-align: center;">$${line.rate.toFixed(2)}</td>
                        <td style="padding: 4px 0; font-size: 14px; text-align: right;">$${(line.qty * line.rate).toFixed(2)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>

            <h3 style="text-align: right; margin-top: 10px;">Total Due: <span style="color: #15803d;">$${totalDue.toFixed(2)}</span></h3>
            
            <div style="background-color: #f0fdf4; padding: 12px; border-radius: 8px; margin-top: 15px; border: 1px solid #bbf7d0;">
                <h4 style="margin-top: 0; color: #166534; margin-bottom: 8px;">Payment Details</h4>
                <p style="margin: 2px 0; font-size: 13px;"><strong>Name:</strong> Luca Tonetti</p>
                <p style="margin: 2px 0; font-size: 13px;"><strong>BSB:</strong> 923100</p>
                <p style="margin: 2px 0; font-size: 13px;"><strong>Account:</strong> 301182182</p>
                <p style="font-size: 11px; color: #166534; margin-top: 10px;">Please make payment within 7 days. Thank you!</p>
            </div>
            <p style="font-size: 10px; color: #9ca3af; text-align: center; margin-top: 20px;">This email serves as your official tax invoice.</p>
        </div>
      `;

      try {
          const response = await fetch('/api/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ emailTo: targetEmail, clientName: displayName, invoiceNumber, totalDue, htmlBody })
          });
          const result = await response.json();
          if (result.success) alert(`✅ Invoice successfully emailed to ${targetEmail}!`);
          else alert(`❌ Email failed: ${result.error}`);
      } catch (err) {
          alert("Network error sending email.");
      }
      setIsSendingEmail(false);
  }

  if (loading && clients.length === 0) return <div className="h-screen flex items-center justify-center font-bold text-green-800 bg-green-50">Loading Ita Jobs...</div>;

  const totalUnpaidHours = clients.reduce((sum, c) => sum + (c.sessions_remaining < 0 ? Math.abs(c.sessions_remaining) : 0), 0);
  const totalHistoricalHours = clients.reduce((sum, c) => sum + c.historical_attended, 0);

  return (
    <main className="min-h-screen p-4 md:p-8 font-sans bg-green-50 text-[#166534]">
      
      <style dangerouslySetInnerHTML={{__html: `
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @media print {
            @page { margin: 15mm; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
            body * { visibility: hidden; }
            #printable-invoice-container { position: absolute; left: 0; top: 0; width: 100%; }
            #printable-invoice, #printable-invoice * { visibility: visible; }
            .no-print { display: none !important; }
            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
            input { border: none !important; background: transparent !important; }
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

        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden text-[#16202e]">
            <div className="px-6 py-4 border-b border-green-100 bg-white flex justify-between items-center"><h2 className="text-lg font-bold text-green-800">Invoice Tracking</h2></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-green-600 bg-green-50/30"><th className="px-6 py-4 font-bold">Client / Job Name</th><th className="px-6 py-4 font-bold">Unpaid Hours</th><th className="px-6 py-4 font-bold text-center">Invoice</th><th className="px-6 py-4 font-bold text-right">Action</th></tr></thead>
                    <tbody className="text-sm">
                        {clients.map(client => {
                            const unpaid = client.sessions_remaining < 0 ? Math.abs(client.sessions_remaining) : 0;
                            const isOwing = unpaid > 0;
                            return (
                                <tr key={client.id} className={`transition-colors border-b border-gray-50 ${isOwing ? 'bg-red-50/30 hover:bg-red-50/80' : 'hover:bg-green-50/30'}`}>
                                    <td className="px-6 py-5 font-bold text-base">{client.name}</td>
                                    <td className="px-6 py-5">{isOwing ? <span className="text-red-600 font-black text-lg">{unpaid} hrs</span> : <span className="text-gray-400 font-bold px-2 py-1 bg-gray-100 rounded text-xs">All Paid</span>}</td>
                                    <td className="px-6 py-5 text-center">{isOwing && <button onClick={() => openInvoice(client)} className="px-4 py-2 bg-white border-2 border-green-500 text-green-600 font-bold rounded-lg shadow-sm hover:bg-green-50 transition-colors text-xs uppercase tracking-wider">📄 Create</button>}</td>
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
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-6 overflow-y-auto backdrop-blur-sm" onClick={() => setInvoiceClient(null)}>
                <div className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden border border-gray-300" onClick={(e) => e.stopPropagation()}>
                    
                    {/* INVOICE CONTROLS */}
                    <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-6 flex flex-col gap-6 no-print shrink-0">
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-[#16202e]">Invoice Settings</h3>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Global Hourly Rate ($)</label>
                            <input type="number" className="w-full p-2 border border-gray-300 rounded-lg font-bold text-lg text-[#16202e]" value={unitPrice} onChange={e => handleUnitPriceChange(Number(e.target.value))} />
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Add Extra Item</label>
                            <input type="text" placeholder="e.g. Pine Bark Fine Mulch" className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-2 text-[#16202e]" value={newCustomDesc} onChange={e => setNewCustomDesc(e.target.value)} />
                            <input type="date" className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-2 text-[#16202e]" value={newCustomDate} onChange={e => setNewCustomDate(e.target.value)} />
                            <div className="flex gap-2 mb-2">
                                <input type="number" placeholder="Qty" className="w-1/3 p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomQty} onChange={e => setNewCustomQty(e.target.value)} />
                                <input type="number" placeholder="Price $" className="w-2/3 p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomPrice} onChange={e => setNewCustomPrice(e.target.value)} />
                            </div>
                            <button onClick={addCustomItem} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold transition-colors">Add Item</button>
                        </div>

                        {/* NEW: BILLING ADJUSTMENT */}
                        <div className="border-t border-gray-100 pt-4">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Billing Adjustment</label>
                            <button onClick={addAutoRounding} className="w-full mb-2 bg-gray-100 hover:bg-gray-200 text-[#166534] py-2 rounded-lg font-bold transition-colors text-xs">
                                ⚖️ Auto-Round (Nearest $10)
                            </button>
                            <button onClick={addManualAdjustment} className="w-full bg-gray-100 hover:bg-gray-200 text-[#166534] py-2 rounded-lg font-bold transition-colors text-xs">
                                ➖ Add Custom Discount
                            </button>
                        </div>

                        <div className="mt-auto flex flex-col gap-3 pt-6 border-t border-gray-100">
                            <button onClick={sendEmailInvoice} disabled={isSendingEmail} className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl shadow-md hover:bg-gray-900 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                                <span>✉️</span> {isSendingEmail ? "Sending..." : "Email Invoice"}
                            </button>

                            <button onClick={sendTextInvoice} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 transition-colors flex justify-center items-center gap-2">
                                <span>💬</span> Text Client
                            </button>

                            <button onClick={() => {
                                markInvoiceAsIssued();
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

                    {/* COMPACT PRINTABLE INVOICE (LIVE EDITABLE) */}
                    <div className="flex-1 p-4 bg-gray-100 overflow-y-auto" id="printable-invoice-container">
                        <div id="printable-invoice" className="bg-white mx-auto shadow-sm p-6 md:p-8 text-[#16202e] text-sm" style={{ width: '100%', maxWidth: '800px', fontFamily: 'Arial, sans-serif' }}>
                            
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-20 h-20 relative overflow-hidden"><Image src="/ita-logo.jpg" alt="The Italian Job Logo" fill className="object-contain" /></div>
                                <h1 className="text-3xl font-black mt-2 tracking-tight">The Italian Job</h1>
                            </div>

                            <div className="text-center mb-4 text-xs font-medium text-gray-600">ABN: 18 812 166 780 &nbsp; 14/1 Avalon Parade Avalon Beach 2107 NSW</div>

                            <div className="grid grid-cols-2 gap-y-1.5 mb-4 text-sm">
                                <div className="font-bold">Attention to</div>
                                <div className="flex justify-between">
                                    <div>
                                        <div className="font-bold">{displayName}</div>
                                        <div className="text-xs text-gray-500">{displayEmail}</div>
                                        {invoiceClient.billing_address && <div className="text-xs text-gray-500">{invoiceClient.billing_address}</div>}
                                    </div>
                                    <div><span className="font-bold mr-3">Invoice Number</span>{invoiceNumber}</div>
                                </div>

                                <div className="font-bold">Date</div><div>{todayStr}</div>
                                <div className="font-bold">Description</div><div>Landscaping & Handyman Services</div>
                                <div className="font-bold">Invoice Terms</div><div>Within 7 days of invoice date</div>
                            </div>

                            <div className="border-t-2 border-green-700 my-3"></div>

                            <table className="w-full text-left mb-4">
                                <thead>
                                    <tr className="font-bold border-b border-green-700">
                                        <th className="pb-2 text-left">Description</th>
                                        <th className="pb-2 text-center">Date</th>
                                        <th className="pb-2 text-center">Quantity (Hrs)</th>
                                        <th className="pb-2 text-center">Unit Price</th>
                                        <th className="pb-2 text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {invoiceLines.map(line => (
                                        <tr key={line.id} className="border-b border-gray-100 group relative hover:bg-green-50/30 transition-colors">
                                            <td className="py-1.5 text-left">
                                                <input type="text" value={line.desc} onChange={e => updateLine(line.id, 'desc', e.target.value)} className="w-full bg-transparent outline-none font-bold text-[#16202e] border-b border-transparent hover:border-gray-300 focus:border-green-500 transition-colors print:border-transparent" />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                <input type="text" value={line.date} onChange={e => updateLine(line.id, 'date', e.target.value)} className="w-24 text-center bg-transparent outline-none text-xs text-gray-600 border-b border-transparent hover:border-gray-300 focus:border-green-500 transition-colors print:border-transparent" />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                <input type="number" step="0.5" value={line.qty} onChange={e => updateLine(line.id, 'qty', Number(e.target.value))} className="w-16 text-center bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-green-500 transition-colors print:border-transparent" />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                $<input type="number" step="1" value={line.rate} onChange={e => updateLine(line.id, 'rate', Number(e.target.value))} className="w-16 text-center bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-green-500 transition-colors print:border-transparent" />
                                            </td>
                                            <td className="py-1.5 text-right font-bold text-[#16202e] relative pr-2">
                                                ${(line.qty * line.rate).toFixed(2)}
                                                
                                                {/* INVISIBLE DELETE BUTTON (Appears on Hover) */}
                                                <button onClick={() => removeLine(line.id, line.isLabour ? line.date : undefined)} className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 no-print transition-opacity hover:bg-red-500 hover:text-white" title="Remove Line">✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-end pt-2 font-bold text-base mb-6 avoid-break">
                                <div className="w-1/2 flex justify-between"><span>Total Due</span><span className="text-[#15803d]">${totalDue.toFixed(2)}</span></div>
                            </div>

                            <div className="avoid-break pt-4 border-t-2 border-green-700 bg-green-50 px-4 rounded-lg">
                                <div className="space-y-1 py-3 text-sm">
                                    <div className="font-bold text-base mb-2 text-green-800">Payment Details</div>
                                    <div className="grid grid-cols-2 gap-2 text-green-900">
                                        <div><span className="font-bold">Name:</span> Luca Tonetti</div>
                                        <div><span className="font-bold">Email:</span> luca.toniz84@gmail.com</div>
                                        <div><span className="font-bold">BSB:</span> 923100</div>
                                        <div><span className="font-bold">Phone:</span> 0416 058 046</div>
                                        <div><span className="font-bold">Account:</span> 301182182</div>
                                    </div>
                                    <div className="pt-3 mt-3 border-t border-green-200 text-xs text-green-700 italic text-center">Please make payment within 7 days. Thank you for choosing my services!</div>
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