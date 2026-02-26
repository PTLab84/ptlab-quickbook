"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

const PTLAB = { navy: "#16202e", orange: "#f05a28", bg: "#f3f4f6" };

type Client = { id: string; name: string; type?: "intro" | "regular" | "ita_job" | "extra"; sessions_remaining: number; historical_attended: number };
type Booking = { id: string; slot_key: string; client_id: string; processed: boolean; paid?: boolean };

export default function PTReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (clientData) setClients(clientData.map(c => ({ ...c, sessions_remaining: c.sessions_remaining || 0, historical_attended: c.historical_attended || 0 })));
    
    // Fetch all processed bookings
    const { data: bookingData } = await supabase.from('bookings').select('*').eq('processed', true);
    if (bookingData) setBookings(bookingData);
    
    setLoading(false);
  }

  useEffect(() => { loadReportData(); }, []);

  // --- OPEN INVOICE ---
  async function openInvoice(client: Client) {
    setLoading(true);
    // Fetch specifically unpaid bookings for this client
    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('client_id', client.id)
        .eq('processed', true)
        .neq('paid', true)
        .order('slot_key', { ascending: true });

    if (data) setInvoiceBookings(data);
    setInvoiceClient(client);
    setUnitPrice(client.type === 'intro' ? 50 : 75);
    setCustomItems([]);
    setLoading(false);
  }

  // --- ADD CUSTOM ITEM TO INVOICE ---
  function addCustomItem() {
      if (!newCustomDesc || !newCustomPrice) return;
      setCustomItems([...customItems, { desc: newCustomDesc, date: new Date().toLocaleDateString('en-AU'), price: parseFloat(newCustomPrice) }]);
      setNewCustomDesc("");
      setNewCustomPrice("");
  }

  // --- MARK PAID ---
  async function markInvoicePaid(clientId: string, clientName: string) {
      if (!window.confirm(`Mark all owing sessions as PAID for ${clientName}?\nThis resets their balance to 0.`)) return;
      setLoading(true);
      await supabase.from('clients').update({ sessions_remaining: 0 }).eq('id', clientId);
      await supabase.from('bookings').update({ paid: true }).eq('client_id', clientId).eq('processed', true).neq('paid', true);
      await loadReportData(); 
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

  return (
    <main className="min-h-screen p-4 md:p-8 font-sans" style={{ backgroundColor: PTLAB.bg, color: PTLAB.navy }}>
      
      {/* CSS for perfect PDF printing */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
            body * { visibility: hidden; }
            #printable-invoice, #printable-invoice * { visibility: visible; }
            #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; box-shadow: none; }
            .no-print { display: none !important; }
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
                                        {isOwing && (
                                            <button onClick={() => openInvoice(client)} className="px-4 py-1.5 bg-white border-2 border-[#0160C9] text-[#0160C9] font-bold rounded-lg shadow-sm hover:bg-blue-50 transition-colors text-xs uppercase tracking-wider">📄 Create</button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isOwing && (
                                            <button onClick={() => markInvoicePaid(client.id, client.name)} className="px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition-colors text-xs uppercase tracking-wider">✅ Mark Paid</button>
                                        )}
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
                                        {isOwing && (
                                            <button onClick={() => openInvoice(client)} className="px-4 py-1.5 bg-white border-2 border-orange-500 text-orange-600 font-bold rounded-lg shadow-sm hover:bg-orange-50 transition-colors text-xs uppercase tracking-wider">📄 Create</button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isOwing && (
                                            <button onClick={() => markInvoicePaid(client.id, client.name)} className="px-4 py-1.5 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition-colors text-xs uppercase tracking-wider">✅ Mark Paid</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* --- INVOICE MODAL (STYLED EXACTLY LIKE YOUR SCREENSHOT) --- */}
      {invoiceClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-6 overflow-y-auto backdrop-blur-sm no-print">
            <div className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden border border-gray-300">
                
                {/* INVOICE CONTROLS (Left side on desktop, top on mobile) */}
                <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-6 flex flex-col gap-6">
                    <div>
                        <h3 className="font-bold text-lg mb-4 text-[#16202e]">Invoice Settings</h3>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Unit Price ($)</label>
                        <input type="number" className="w-full p-2 border border-gray-300 rounded-lg font-bold text-lg text-[#16202e]" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Add Custom Item</label>
                        <input type="text" placeholder="Description (e.g. Program Design)" className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-2 text-[#16202e]" value={newCustomDesc} onChange={e => setNewCustomDesc(e.target.value)} />
                        <div className="flex gap-2">
                            <input type="number" placeholder="Price $" className="w-full p-2 border border-gray-300 rounded-lg text-sm text-[#16202e]" value={newCustomPrice} onChange={e => setNewCustomPrice(e.target.value)} />
                            <button onClick={addCustomItem} className="bg-gray-800 text-white px-3 rounded-lg font-bold">+</button>
                        </div>
                    </div>

                    <div className="mt-auto flex flex-col gap-3 pt-6 border-t border-gray-100">
                        <button onClick={() => window.print()} className="w-full py-3 bg-[#0160C9] text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors flex justify-center items-center gap-2">
                            <span>📄</span> Save PDF / Share
                        </button>
                        <button onClick={() => setInvoiceClient(null)} className="w-full py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                            Close
                        </button>
                    </div>
                </div>

                {/* ACTUAL PRINTABLE INVOICE */}
                <div className="flex-1 p-4 md:p-8 bg-gray-100 overflow-y-auto">
                    <div id="printable-invoice" className="bg-white mx-auto shadow-sm p-8 md:p-12 text-[#16202e] text-sm" style={{ width: '100%', maxWidth: '800px', minHeight: '1000px', fontFamily: 'Arial, sans-serif' }}>
                        
                        {/* HEADER */}
                        <div className="flex justify-between items-start mb-6">
                            {/* NOTE: You must have a file called "logo.jpg" inside your public folder for this to show! */}
                            <div className="w-24 h-24 relative overflow-hidden rounded-full"><Image src="/logo.jpg" alt="PTLab Logo" fill className="object-cover" /></div>
                            <h1 className="text-4xl font-black mt-4 tracking-tight">Pro Training Lab</h1>
                        </div>

                        <div className="text-center mb-10 text-xs font-medium">
                            ABN: 18 812 166 780 &nbsp; 14/1 Avalon Parade Avalon Beach 2107 NSW
                        </div>

                        {/* CLIENT INFO */}
                        <div className="grid grid-cols-2 gap-y-4 mb-8">
                            <div className="font-bold">Attention to</div>
                            <div className="flex justify-between">
                                <span>{invoiceClient.name}</span>
                                <div><span className="font-bold mr-4">Invoice Number</span>{invoiceNumber}</div>
                            </div>

                            <div className="font-bold">Date</div>
                            <div>{todayStr}</div>

                            <div className="font-bold">Description</div>
                            <div>{invoiceClient.type === 'intro' ? 'Intro Pack Training' : 'Personal Training'}</div>

                            <div className="font-bold">Invoice Terms</div>
                            <div>Within 7 days of invoice date</div>
                        </div>

                        {/* ORANGE DIVIDER */}
                        <div className="border-t-2 border-[#f05a28] my-6"></div>

                        {/* TABLE */}
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
                                {/* Calendar Sessions */}
                                {invoiceBookings.map((booking, i) => {
                                    // Extract DD/MM/YYYY from slot_key (e.g. "2026-02-02|08:30")
                                    const datePart = booking.slot_key.split('|')[0];
                                    const [y, m, d] = datePart.split('-');
                                    const formattedDate = `${d}/${m}/${y}`;
                                    
                                    return (
                                        <tr key={booking.id}>
                                            <td className="py-1 text-center">{invoiceClient.type === 'intro' ? 'Intro Pack Training' : 'Personal Training'}</td>
                                            <td className="py-1 text-center">{formattedDate}</td>
                                            <td className="py-1 text-center">1</td>
                                            <td className="py-1 text-center">${unitPrice.toFixed(2)}</td>
                                            <td className="py-1 text-right">${unitPrice.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}

                                {/* Custom Items */}
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

                        {/* TOTAL */}
                        <div className="flex justify-end pt-4 font-bold text-base mb-12">
                            <div className="w-1/2 flex justify-between">
                                <span>Total Due</span>
                                <span>${totalDue.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* ORANGE DIVIDER */}
                        <div className="border-t-2 border-[#f05a28] my-6"></div>

                        {/* PAYMENT DETAILS */}
                        <div className="space-y-1 mt-6 text-sm">
                            <div className="font-bold">Name: Luca Tonetti</div>
                            <div className="font-bold">BSB: 923100</div>
                            <div className="font-bold">Account Number: 301182182</div>
                            
                            <div className="pt-4 pb-4">Please make payment within 7 days to the above bank account. If you have any questions, feel free to reach out.</div>
                            
                            <div className="font-bold pb-2">Contact Information</div>
                            <div className="font-bold">Email: <a href="mailto:luca.toniz84@gmail.com" className="underline">luca.toniz84@gmail.com</a></div>
                            <div className="font-bold">Phone: 0416 058 046</div>
                            
                            <div className="pt-6">Thank you for choosing my services. It was a pleasure working with you!</div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}