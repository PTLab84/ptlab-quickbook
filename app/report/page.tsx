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
    location?: string;
};
type Booking = { id: string; slot_key: string; client_id: string; processed: boolean; paid?: boolean };

type LineItem = {
    id: string;
    bookingId?: string;
    desc: string;
    date: string;
    qty: number;
    rate: number;
};

export default function PTReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [rentRate, setRentRate] = useState<number>(15); 
  const [rentMonthOffset, setRentMonthOffset] = useState<number>(0); 

  // Invoice State
  const [invoiceClient, setInvoiceClient] = useState<Client | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<LineItem[]>([]);
  const [unitPrice, setUnitPrice] = useState<number>(75);
  
  const [newCustomDesc, setNewCustomDesc] = useState("");
  const [newCustomPrice, setNewCustomPrice] = useState("");
  const [newCustomDate, setNewCustomDate] = useState("");
  
  const [invoiceNumber, setInvoiceNumber] = useState<number>(0);
  const [hasIncremented, setHasIncremented] = useState<boolean>(false);

  // Pre-Paid Package State
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [pkgClientId, setPkgClientId] = useState("");
  const [pkgSessionCount, setPkgSessionCount] = useState(10);

  async function loadReportData() {
    setLoading(true);
    const { data: clientData } = await supabase.from('clients').select('*').order('name');
    if (clientData) setClients(clientData as Client[]);
    
    const { data: bookingData } = await supabase.from('bookings').select('*').eq('processed', true);
    if (bookingData) setBookings(bookingData);
    
    setLoading(false);
  }

  useEffect(() => { 
      loadReportData(); 
      setNewCustomDate(new Date().toISOString().split('T')[0]); 
  }, []);

  async function openInvoice(client: Client) {
    setLoading(true);
    const { data } = await supabase.from('bookings').select('*').eq('client_id', client.id).eq('processed', true).neq('paid', true).order('slot_key', { ascending: true });
    
    setHasIncremented(false);
    const { data: settingsData } = await supabase.from('settings').select('value').eq('id', 'next_invoice').single();
    setInvoiceNumber(settingsData ? settingsData.value : 205);

    setInvoiceClient(client);
    const defaultRate = client.type === 'intro' ? 50 : 75;
    setUnitPrice(defaultRate);
    
    const initialLines: LineItem[] = (data || []).map((b, i) => {
        const datePart = b.slot_key.split('|')[0];
        const [y, m, d] = datePart.split('-');
        return {
            id: `pt-${b.id}`,
            bookingId: b.id,
            desc: client.type === 'intro' ? 'Intro Pack Training' : 'Personal Training',
            date: `${d}/${m}/${y}`,
            qty: 1,
            rate: defaultRate
        };
    });

    setInvoiceLines(initialLines);
    setNewCustomDate(new Date().toISOString().split('T')[0]); 
    setLoading(false);
  }

  async function generatePackageInvoice() {
      if (!pkgClientId) {
          alert("Please select a client from the dropdown.");
          return;
      }

      setLoading(true);
      const client = clients.find(c => c.id === pkgClientId);
      if (!client) return;

      setHasIncremented(false);
      const { data: settingsData } = await supabase.from('settings').select('value').eq('id', 'next_invoice').single();
      setInvoiceNumber(settingsData ? settingsData.value : 205);

      setInvoiceClient(client);
      const defaultRate = client.type === 'intro' ? 50 : 75;
      setUnitPrice(defaultRate);

      const initialLines: LineItem[] = [{
          id: `pkg-${Date.now()}`,
          desc: `${pkgSessionCount}x ${client.type === 'intro' ? 'Intro Pack' : 'Personal Training'} Sessions`,
          date: new Date().toLocaleDateString('en-AU'),
          qty: pkgSessionCount,
          rate: defaultRate
      }];

      setInvoiceLines(initialLines);
      setNewCustomDate(new Date().toISOString().split('T')[0]);
      
      setShowPackageModal(false);
      setPkgClientId("");
      setPkgSessionCount(10);
      setLoading(false);
  }

  function updateLine(id: string, field: keyof LineItem, value: any) {
      setInvoiceLines(prev => prev.map(line => line.id === id ? { ...line, [field]: value } : line));
  }

  async function removeLine(lineId: string, bookingId?: string) {
      if (bookingId) {
          if (!window.confirm("Remove this session from the invoice and refund 1 credit to the client?")) return;
          await supabase.from('bookings').delete().eq('id', bookingId);
          const newBalance = invoiceClient!.sessions_remaining + 1;
          await supabase.from('clients').update({ sessions_remaining: newBalance }).eq('id', invoiceClient!.id);
          setInvoiceClient({ ...invoiceClient!, sessions_remaining: newBalance });
          loadReportData();
      }
      setInvoiceLines(prev => prev.filter(l => l.id !== lineId));
  }

  function handleUnitPriceChange(newRate: number) {
      setUnitPrice(newRate);
      setInvoiceLines(prev => prev.map(line => line.id.startsWith('pt-') ? { ...line, rate: newRate } : line));
  }

  function addCustomItem() {
      if (!newCustomDesc || !newCustomPrice || !newCustomDate) return;
      const [y, m, d] = newCustomDate.split('-');
      const displayDate = `${d}/${m}/${y}`;
      setInvoiceLines([...invoiceLines, { id: `custom-${Date.now()}`, desc: newCustomDesc, date: displayDate, qty: 1, rate: parseFloat(newCustomPrice) }]);
      setNewCustomDesc(""); setNewCustomPrice("");
      setNewCustomDate(new Date().toISOString().split('T')[0]); 
  }

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
      if (!window.confirm(`Mark all owing sessions as PAID for ${clientName}?\nThis resets their balance to 0.`)) return;
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

  const totalDue = invoiceLines.reduce((sum, item) => sum + (item.qty * item.rate), 0);
  const todayStr = new Date().toLocaleDateString('en-AU');
  const displayName = String(invoiceClient?.billing_name || invoiceClient?.name || "Client");
  const displayEmail = String(invoiceClient?.email || "No email on file");

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
            <h1 style="color: #f05a28; margin-bottom: 5px;">Pro Training Lab</h1>
            <p style="font-size: 12px; color: #666; margin-top: 0; margin-bottom: 25px;">ABN: 18 812 166 780 &nbsp;|&nbsp; 14/1 Avalon Parade Avalon Beach 2107 NSW</p>
            
            <table style="width: 100%; margin-bottom: 25px; font-size: 14px; line-height: 1.5;">
                <tr>
                    <td style="vertical-align: top;">
                        <strong style="color: #666; font-size: 12px; text-transform: uppercase;">Billed To</strong><br>
                        <strong>${displayName}</strong><br>
                        ${invoiceClient.billing_address ? `<span style="color: #555;">${invoiceClient.billing_address}</span>` : ''}
                    </td>
                    <td style="text-align: right; vertical-align: top;">
                        <strong style="color: #666; font-size: 12px; text-transform: uppercase;">Invoice Details</strong><br>
                        <strong>Inv #:</strong> ${invoiceNumber}<br>
                        <strong>Date:</strong> ${todayStr}
                    </td>
                </tr>
            </table>

            <p>Hi <strong>${displayName.split(' ')[0]}</strong>,</p>
            <p>Thank you for your hard work! Here is your latest invoice for <strong>$${totalDue.toFixed(2)}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px;">
                <thead>
                    <tr style="border-bottom: 2px solid #f05a28; text-align: left;">
                        <th style="padding: 4px 0;">Description</th>
                        <th style="padding: 4px 0;">Date</th>
                        <th style="padding: 4px 0; text-align: center;">Qty</th>
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

            <h3 style="text-align: right; margin-top: 10px;">Total Due: <span style="color: #f05a28;">$${totalDue.toFixed(2)}</span></h3>
            
            <div style="background-color: #f3f4f6; padding: 12px; border-radius: 8px; margin-top: 15px;">
                <h4 style="margin-top: 0; margin-bottom: 8px;">Payment Details</h4>
                <p style="margin: 2px 0; font-size: 13px;"><strong>Name:</strong> Luca Tonetti</p>
                <p style="margin: 2px 0; font-size: 13px;"><strong>BSB:</strong> 923100</p>
                <p style="margin: 2px 0; font-size: 13px;"><strong>Account:</strong> 301182182</p>
                <p style="font-size: 11px; color: #666; margin-top: 10px;">Please make payment within 7 days. Thank you!</p>
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

  if (loading && clients.length === 0) return <div className="h-screen flex items-center justify-center font-bold text-[#16202e] bg-[#f3f4f6]">Loading PT Reports...</div>;

  const ptClients = clients.filter(c => c.name !== 'Michelle appointment' && c.type !== 'ita_job' && c.type !== 'extra');
  const regularClients = ptClients.filter(c => c.type !== 'intro');
  const introClients = ptClients.filter(c => c.type === 'intro');

  const totalActiveClients = ptClients.length;
  const totalSessionsRemaining = ptClients.reduce((sum, c) => sum + Math.max(0, c.sessions_remaining), 0);
  const totalHistoricalDelivered = ptClients.reduce((sum, c) => sum + c.historical_attended, 0);
  const totalAppDelivered = bookings.filter(b => ptClients.find(c => c.id === b.client_id)).length;
  const totalSessionsDelivered = totalHistoricalDelivered + totalAppDelivered;

  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() - rentMonthOffset);
  const targetMonth = targetDate.getMonth() + 1;
  const targetYear = targetDate.getFullYear();

  const gymSessionsTargetMonth = bookings.filter(b => {
      const client = clients.find(c => c.id === b.client_id);
      if (!client || client.location !== 'AF') return false; 
      const datePart = b.slot_key.split('|')[0];
      const [y, m, d] = datePart.split('-');
      return parseInt(y) === targetYear && parseInt(m) === targetMonth;
  }).length;

  const totalRentOwed = gymSessionsTargetMonth * rentRate;

  function getRowStyle(balance: number) {
      if (balance > 0) return { text: "In Credit", badge: "bg-green-100 text-green-700", row: "border-b border-gray-50 hover:bg-gray-50" };
      if (balance < 0) return { text: "Owing", badge: "bg-red-100 text-red-700", row: "border-b border-red-100 bg-red-50 hover:bg-red-100/50" };
      return { text: "Up to Date", badge: "bg-gray-100 text-gray-600", row: "border-b border-gray-50 hover:bg-gray-50" };
  }

  return (
    <main className="min-h-screen p-4 md:p-8 font-sans" style={{ backgroundColor: PTLAB.bg, color: PTLAB.navy }}>
      
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

      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold">PTLab Overview</h1>
                <p className="text-gray-500 mt-1">Personal Training Attendance & Payments</p>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={() => setShowPackageModal(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700">
                    ➕ Create Package Invoice
                </button>
                <Link href="/"><button className="px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all bg-white border border-gray-200 hover:bg-gray-50 text-[#16202e]">← Back to Calendar</button></Link>
            </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between"><div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Total Clients</div><div className="text-4xl font-black">{totalActiveClients}</div></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between"><div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Pre-Paid Sessions</div><div className="text-4xl font-black text-green-600">{totalSessionsRemaining}</div></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between"><div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">All-Time Sessions</div><div className="text-4xl font-black text-[#f05a28]">{totalSessionsDelivered}</div></div>
            
            <div className="bg-indigo-50 p-6 rounded-2xl shadow-sm border border-indigo-100 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute right-0 top-0 text-6xl opacity-10 pt-4 pr-2 pointer-events-none">🏋️‍♂️</div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <select value={rentMonthOffset} onChange={e => setRentMonthOffset(Number(e.target.value))} className="text-xs font-bold text-indigo-700 uppercase tracking-wider bg-transparent outline-none cursor-pointer border-b border-indigo-200 pb-0.5">
                            <option value={0}>Rent (This Month)</option>
                            <option value={1}>Rent (Last Month)</option>
                        </select>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <div className="text-4xl font-black text-indigo-800">{gymSessionsTargetMonth}</div>
                        <div className="text-sm font-bold text-indigo-400">sessions</div>
                    </div>
                </div>
                <div className="mt-4 pt-3 border-t border-indigo-200/50 flex justify-between items-center">
                    <div className="text-xs font-bold text-indigo-500">Rate: $<input type="number" className="w-8 bg-transparent border-b border-indigo-300 outline-none text-indigo-700" value={rentRate} onChange={e => setRentRate(Number(e.target.value))} /></div>
                    <div className="font-bold text-indigo-700">Owed: ${totalRentOwed.toFixed(2)}</div>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#16202e]">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h2 className="text-lg font-bold">Regular Clients</h2><span className="text-xs font-bold px-2 py-1 bg-gray-200 rounded-full">{regularClients.length}</span></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><th className="px-6 py-4 font-bold">Client Name</th><th className="px-6 py-4 font-bold">Status</th><th className="px-6 py-4 font-bold">Remaining</th><th className="px-6 py-4 font-bold text-center">All-Time Billed</th><th className="px-6 py-4 font-bold text-center">Invoice</th><th className="px-6 py-4 font-bold text-right">Action</th></tr></thead>
                    <tbody className="text-sm">
                        {regularClients.map(client => {
                            const isOwing = client.sessions_remaining < 0;
                            const style = getRowStyle(client.sessions_remaining);
                            return (
                                <tr key={client.id} className={`transition-colors ${style.row}`}>
                                    <td className="px-6 py-4 font-bold">
                                        {client.name}
                                        {client.location === 'AF' && <span className="ml-2 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">AF Gym</span>}
                                    </td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.text}</span></td>
                                    <td className="px-6 py-4 font-bold text-lg">{client.sessions_remaining}</td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-500">{bookings.filter(b => b.client_id === client.id).length + client.historical_attended}</td>
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#16202e] border-t-4 border-t-orange-500 mt-8">
            <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex justify-between items-center"><h2 className="text-lg font-bold text-orange-900">Intro Pack Clients</h2><span className="text-xs font-bold px-2 py-1 bg-orange-200 text-orange-900 rounded-full">{introClients.length}</span></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><th className="px-6 py-4 font-bold">Client Name</th><th className="px-6 py-4 font-bold">Status</th><th className="px-6 py-4 font-bold">Remaining</th><th className="px-6 py-4 font-bold text-center">All-Time Billed</th><th className="px-6 py-4 font-bold text-center">Invoice</th><th className="px-6 py-4 font-bold text-right">Action</th></tr></thead>
                    <tbody className="text-sm">
                        {introClients.map(client => {
                            const isOwing = client.sessions_remaining < 0;
                            const style = getRowStyle(client.sessions_remaining);
                            return (
                                <tr key={client.id} className={`transition-colors ${style.row}`}>
                                    <td className="px-6 py-4 font-bold">
                                        {client.name}
                                        {client.location === 'AF' && <span className="ml-2 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">AF Gym</span>}
                                    </td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.text}</span></td>
                                    <td className="px-6 py-4 font-bold text-lg">{client.sessions_remaining}</td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-500">{bookings.filter(b => b.client_id === client.id).length + client.historical_attended}</td>
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

      {/* --- PRE-PAID PACKAGE MODAL --- */}
      {showPackageModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={() => setShowPackageModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-black text-[#16202e] mb-4">Create Package Invoice</h2>
                
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Select Client</label>
                <select value={pkgClientId} onChange={e => setPkgClientId(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg text-sm mb-4 outline-none focus:border-indigo-500 font-bold text-[#16202e] bg-white">
                    <option value="" disabled>-- Choose a Client --</option>
                    {ptClients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Number of Sessions</label>
                <select value={pkgSessionCount} onChange={e => setPkgSessionCount(Number(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg text-sm mb-6 outline-none focus:border-indigo-500 font-bold text-[#16202e] bg-white">
                    {[1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50].map(num => (
                        <option key={num} value={num}>{num} Sessions</option>
                    ))}
                </select>

                <div className="flex gap-3">
                    <button onClick={() => setShowPackageModal(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Cancel</button>
                    <button onClick={generatePackageInvoice} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">Generate</button>
                </div>
            </div>
        </div>
      )}

      {/* --- INVOICE MODAL --- */}
      {invoiceClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-6 overflow-y-auto backdrop-blur-sm" onClick={() => setInvoiceClient(null)}>
            <div className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden border border-gray-300" onClick={(e) => e.stopPropagation()}>
                
                {/* INVOICE CONTROLS */}
                <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-6 flex flex-col gap-6 no-print shrink-0">
                    <div>
                        <h3 className="font-bold text-lg mb-4 text-[#16202e]">Invoice Settings</h3>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Global Unit Price ($)</label>
                        <input type="number" className="w-full p-2 border border-gray-300 rounded-lg font-bold text-lg text-[#16202e]" value={unitPrice} onChange={e => handleUnitPriceChange(Number(e.target.value))} />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Add Custom Item</label>
                        <input type="text" placeholder="Description" className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-2 text-[#16202e]" value={newCustomDesc} onChange={e => setNewCustomDesc(e.target.value)} />
                        <div className="flex gap-2 mb-2">
                            <input type="date" className="w-1/2 p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomDate} onChange={e => setNewCustomDate(e.target.value)} />
                            <input type="number" placeholder="Price $" className="w-1/2 p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomPrice} onChange={e => setNewCustomPrice(e.target.value)} />
                        </div>
                        <button onClick={addCustomItem} className="w-full bg-gray-800 text-white py-2 rounded-lg font-bold transition-colors">Add Item</button>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Billing Adjustment</label>
                        <button onClick={addAutoRounding} className="w-full mb-2 bg-gray-100 hover:bg-gray-200 text-[#f05a28] py-2 rounded-lg font-bold transition-colors text-xs">
                            ⚖️ Auto-Round (Nearest $10)
                        </button>
                        <button onClick={addManualAdjustment} className="w-full bg-gray-100 hover:bg-gray-200 text-[#f05a28] py-2 rounded-lg font-bold transition-colors text-xs">
                            ➖ Add Custom Discount
                        </button>
                    </div>

                    <div className="mt-auto flex flex-col gap-3 pt-6 border-t border-gray-100">
                        <button onClick={sendEmailInvoice} disabled={isSendingEmail} className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl shadow-md hover:bg-gray-900 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                            <span>✉️</span> {isSendingEmail ? "Sending..." : "Email Invoice"}
                        </button>
                        <button onClick={sendTextInvoice} className="w-full py-3 bg-green-500 text-white font-bold rounded-xl shadow-md hover:bg-green-600 transition-colors flex justify-center items-center gap-2">
                            <span>💬</span> Text Client
                        </button>
                        <button onClick={() => {
                            markInvoiceAsIssued();
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

                {/* COMPACT PRINTABLE INVOICE (LIVE EDITABLE WITH AUTO-EXPAND) */}
                <div className="flex-1 p-4 bg-gray-100 overflow-y-auto" id="printable-invoice-container">
                    <div id="printable-invoice" className="bg-white mx-auto shadow-sm p-6 md:p-8 text-[#16202e] text-sm" style={{ width: '100%', maxWidth: '800px', fontFamily: 'Arial, sans-serif' }}>
                        
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-16 h-16 relative overflow-hidden rounded-full"><Image src="/logo.jpg" alt="PTLab Logo" fill className="object-cover" /></div>
                            <h1 className="text-3xl font-black mt-2 tracking-tight">Pro Training Lab</h1>
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
                            <div className="font-bold">Description</div><div>{invoiceClient.type === 'intro' ? 'Intro Pack Training' : 'Personal Training'}</div>
                            <div className="font-bold">Invoice Terms</div><div>Within 7 days of invoice date</div>
                        </div>

                        <div className="border-t-2 border-[#f05a28] my-3"></div>

                        <table className="w-full text-left mb-4">
                            <thead>
                                <tr className="font-bold border-b border-gray-200">
                                    <th className="pb-2 text-left">Description</th>
                                    <th className="pb-2 text-center">Date</th>
                                    <th className="pb-2 text-center">Quantity</th>
                                    <th className="pb-2 text-center">Unit Price</th>
                                    <th className="pb-2 text-right">Cost</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {invoiceLines.map(line => (
                                    <tr key={line.id} className="border-b border-gray-50 group relative hover:bg-orange-50/50 transition-colors">
                                        
                                        <td className="py-2 text-left align-top">
                                            <div className="relative w-full">
                                                <div className="invisible whitespace-pre-wrap break-words font-bold text-[#16202e] leading-tight pb-1 min-h-[24px]">
                                                    {line.desc || "."}
                                                </div>
                                                <textarea 
                                                    value={line.desc} 
                                                    onChange={e => updateLine(line.id, 'desc', e.target.value)} 
                                                    className="absolute inset-0 w-full h-full bg-transparent outline-none font-bold text-[#16202e] border-b border-transparent hover:border-gray-300 focus:border-orange-500 transition-colors print:hidden resize-none overflow-hidden leading-tight" 
                                                />
                                                <div className="hidden print:block absolute inset-0 w-full h-full font-bold text-[#16202e] whitespace-pre-wrap break-words leading-tight">
                                                    {line.desc}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="py-2 text-center align-top">
                                            <div className="relative w-full">
                                                <div className="invisible whitespace-pre-wrap break-words text-xs leading-tight pb-1 min-h-[24px]">
                                                    {line.date || "."}
                                                </div>
                                                <textarea 
                                                    value={line.date} 
                                                    onChange={e => updateLine(line.id, 'date', e.target.value)} 
                                                    className="absolute inset-0 w-full h-full text-center bg-transparent outline-none text-xs text-gray-600 border-b border-transparent hover:border-gray-300 focus:border-orange-500 transition-colors print:hidden resize-none overflow-hidden leading-tight" 
                                                />
                                                <div className="hidden print:block absolute inset-0 w-full h-full text-center text-xs text-gray-600 whitespace-pre-wrap break-words leading-tight">
                                                    {line.date}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="py-2 text-center align-top">
                                            <input type="number" step="0.5" value={line.qty} onChange={e => updateLine(line.id, 'qty', Number(e.target.value))} className="w-16 text-center bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-orange-500 transition-colors print:hidden" />
                                            <span className="hidden print:block w-full text-center">{line.qty}</span>
                                        </td>
                                        <td className="py-2 text-center align-top">
                                            <div className="flex items-center justify-center print:hidden">
                                                $ <input type="number" step="1" value={line.rate} onChange={e => updateLine(line.id, 'rate', Number(e.target.value))} className="w-16 text-center bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-orange-500 transition-colors" />
                                            </div>
                                            <span className="hidden print:block w-full text-center">${line.rate.toFixed(2)}</span>
                                        </td>
                                        <td className="py-2 text-right font-bold text-[#16202e] relative pr-2 align-top">
                                            ${(line.qty * line.rate).toFixed(2)}
                                            
                                            <button onClick={() => removeLine(line.id, line.bookingId)} className="absolute -right-6 top-1 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 no-print transition-opacity hover:bg-red-500 hover:text-white" title="Remove Line">✕</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex justify-end pt-2 font-bold text-base mb-6 avoid-break">
                            <div className="w-1/2 flex justify-between"><span>Total Due</span><span className="text-[#f05a28]">${totalDue.toFixed(2)}</span></div>
                        </div>

                        <div className="avoid-break pt-4 border-t-2 border-[#f05a28] bg-gray-50 px-4 rounded-lg">
                            <div className="space-y-1 py-3 text-sm">
                                <div className="font-bold text-base mb-2">Payment Details</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div><span className="font-bold">Name:</span> Luca Tonetti</div>
                                    <div><span className="font-bold">Email:</span> luca.toniz84@gmail.com</div>
                                    <div><span className="font-bold">BSB:</span> 923100</div>
                                    <div><span className="font-bold">Phone:</span> 0416 058 046</div>
                                    <div><span className="font-bold">Account:</span> 301182182</div>
                                </div>
                                <div className="pt-3 mt-3 border-t border-gray-200 text-xs text-gray-600 italic text-center">Please make payment within 7 days. Thank you for choosing my services!</div>
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