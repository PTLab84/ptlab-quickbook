"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Client = { id: string; name: string; type: string; sessions_remaining: number; historical_attended: number };

export default function ItaReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReportData() {
    setLoading(true);
    const { data: clientData } = await supabase.from('clients').select('*').eq('type', 'ita_job').order('name');
    if (clientData) {
        setClients(clientData.map(c => ({
            ...c, 
            sessions_remaining: c.sessions_remaining || 0,
            historical_attended: c.historical_attended || 0
        })));
    }
    setLoading(false);
  }

  useEffect(() => { loadReportData(); }, []);

  // --- THE PAYMENT FUNCTION ---
  // Resets the "owed" hours to 0 when they pay their invoice
  async function markInvoicePaid(clientId: string, clientName: string, unpaidHours: number) {
      if (!window.confirm(`Mark ${unpaidHours} hours as PAID for ${clientName}?`)) return;
      
      setLoading(true);
      await supabase.from('clients').update({ sessions_remaining: 0 }).eq('id', clientId);
      await loadReportData(); // Reload screen
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-green-800 bg-green-50">Loading Ita Jobs...</div>;

  const totalUnpaidHours = clients.reduce((sum, c) => sum + (c.sessions_remaining < 0 ? Math.abs(c.sessions_remaining) : 0), 0);
  const totalHistoricalHours = clients.reduce((sum, c) => sum + c.historical_attended, 0);

  return (
    <main className="min-h-screen p-8 font-sans bg-green-50 text-[#166534]">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold text-green-800">The Ita Job Dashboard</h1>
                <p className="text-green-600 mt-1">Handyman & Gardening Invoicing</p>
            </div>
            <Link href="/">
                <button className="px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all bg-white border border-green-200 text-green-700 hover:bg-green-100">
                    ← Back to Calendar
                </button>
            </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100">
                <div className="text-sm font-bold text-green-600 uppercase tracking-wider mb-2">Active Jobs</div>
                <div className="text-4xl font-black text-green-800">{clients.length}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100">
                <div className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2">Total Unpaid Hours</div>
                <div className="text-4xl font-black text-red-600">{totalUnpaidHours}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100">
                <div className="text-sm font-bold text-green-600 uppercase tracking-wider mb-2">All-Time Hours Logged</div>
                <div className="text-4xl font-black text-green-800">{totalHistoricalHours}</div>
            </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden text-[#16202e]">
            <div className="px-6 py-4 border-b border-green-100 bg-white flex justify-between items-center">
                <h2 className="text-lg font-bold text-green-800">Invoice Tracking</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-green-600">
                            <th className="px-6 py-4 font-bold">Client / Job Name</th>
                            <th className="px-6 py-4 font-bold">Unpaid Hours</th>
                            <th className="px-6 py-4 font-bold">All-Time Billed</th>
                            <th className="px-6 py-4 font-bold text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {clients.map(client => {
                            // Sessions remaining represents a "bank". If it's negative, it means you've done the work but haven't been paid.
                            const unpaidHours = client.sessions_remaining < 0 ? Math.abs(client.sessions_remaining) : 0;
                            const isOwing = unpaidHours > 0;
                            
                            return (
                                <tr key={client.id} className={`transition-colors border-b border-gray-50 ${isOwing ? 'bg-red-50 hover:bg-red-100/50' : 'hover:bg-green-50/30'}`}>
                                    <td className="px-6 py-4 font-bold text-lg">{client.name}</td>
                                    
                                    <td className="px-6 py-4">
                                        {isOwing ? (
                                            <span className="text-red-600 font-black text-xl">{unpaidHours} hrs</span>
                                        ) : (
                                            <span className="text-gray-400 font-bold px-2 py-1 bg-gray-100 rounded text-xs">All Paid</span>
                                        )}
                                    </td>

                                    <td className="px-6 py-4 font-medium text-gray-500">{client.historical_attended} hrs</td>
                                    
                                    <td className="px-6 py-4 text-right">
                                        {isOwing && (
                                            <button 
                                                onClick={() => markInvoicePaid(client.id, client.name, unpaidHours)}
                                                className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition-colors"
                                            >
                                                ✅ Mark Paid
                                            </button>
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
    </main>
  );
}