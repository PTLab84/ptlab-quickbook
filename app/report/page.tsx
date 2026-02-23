"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const PTLAB = { navy: "#16202e", orange: "#f05a28", bg: "#f3f4f6" };

type Client = { id: string; name: string; type?: "intro" | "regular" | "ita_job"; sessions_remaining: number; historical_attended: number };
type Booking = { id: string; slot_key: string; client_id: string; processed: boolean };

export default function PTReportDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReportData() {
      setLoading(true);
      const { data: clientData } = await supabase.from('clients').select('*').order('name');
      if (clientData) setClients(clientData.map(c => ({ ...c, sessions_remaining: c.sessions_remaining || 0, historical_attended: c.historical_attended || 0 })));
      const { data: bookingData } = await supabase.from('bookings').select('*').eq('processed', true);
      if (bookingData) setBookings(bookingData);
      setLoading(false);
    }
    loadReportData();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-[#16202e] bg-[#f3f4f6]">Loading PT Reports...</div>;

  const ptClients = clients.filter(c => c.name !== 'Michelle appointment' && c.type !== 'ita_job');
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

  return (
    <main className="min-h-screen p-8 font-sans" style={{ backgroundColor: PTLAB.bg, color: PTLAB.navy }}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#16202e]">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h2 className="text-lg font-bold">Regular Clients</h2><span className="text-xs font-bold px-2 py-1 bg-gray-200 rounded-full">{regularClients.length}</span></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><th className="px-6 py-4 font-bold">Client Name</th><th className="px-6 py-4 font-bold">Status</th><th className="px-6 py-4 font-bold">Sessions Remaining</th><th className="px-6 py-4 font-bold">Total Attended</th></tr></thead>
                    <tbody className="text-sm">
                        {regularClients.map(client => {
                            const totalAttended = client.historical_attended + bookings.filter(b => b.client_id === client.id).length;
                            const style = getRowStyle(client.sessions_remaining);
                            return (
                                <tr key={client.id} className={`transition-colors ${style.row}`}><td className="px-6 py-4 font-bold">{client.name}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.text}</span></td><td className="px-6 py-4 font-bold text-lg">{client.sessions_remaining}</td><td className="px-6 py-4 font-medium text-gray-600">{totalAttended} sessions</td></tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-[#16202e] border-t-4 border-t-orange-500 mt-8">
            <div className="px-6 py-4 border-b border-gray-100 bg-orange-50 flex justify-between items-center"><h2 className="text-lg font-bold text-orange-900">Intro Pack Clients</h2><span className="text-xs font-bold px-2 py-1 bg-orange-200 text-orange-900 rounded-full">{introClients.length}</span></div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead><tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><th className="px-6 py-4 font-bold">Client Name</th><th className="px-6 py-4 font-bold">Status</th><th className="px-6 py-4 font-bold">Sessions Remaining</th><th className="px-6 py-4 font-bold">Total Attended</th></tr></thead>
                    <tbody className="text-sm">
                        {introClients.map(client => {
                            const totalAttended = client.historical_attended + bookings.filter(b => b.client_id === client.id).length;
                            const style = getRowStyle(client.sessions_remaining);
                            return (
                                <tr key={client.id} className={`transition-colors ${style.row}`}><td className="px-6 py-4 font-bold">{client.name}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.text}</span></td><td className="px-6 py-4 font-bold text-lg">{client.sessions_remaining}</td><td className="px-6 py-4 font-medium text-gray-600">{totalAttended} sessions</td></tr>
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