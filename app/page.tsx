"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image"; 
import Link from "next/link";
import { supabase } from "@/lib/supabase"; 

const PTLAB = {
  navy: "#16202e",
  navySoft: "#eef2f6",
  orange: "#f05a28",
  white: "#ffffff",
  bg: "#f3f4f6",
  mainBlue: "#0160C9", 
};

type Client = { 
  id: string; 
  name: string; 
  type?: "intro" | "regular" | "ita_job" | "extra"; 
  sessions_remaining: number; 
  historical_attended: number;
  active?: boolean;
  location?: string; 
};
type SlotKey = string;
type Booking = { id: string; slotKey: SlotKey; clientId: string; processed: boolean };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DEFAULT_START = "06:30"; 
const DEFAULT_END = "23:00";
const SLOT_MINUTES = 45;
const SLOT_HEIGHT = 48; 

function pad(n: number) { return n.toString().padStart(2, "0"); }
function timeToMinutes(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minutesToTime(mins: number) { return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; }
function addMinutes(t: string, add: number) { return minutesToTime(timeToMinutes(t) + add); }
function isoDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }

function getMonday(offsetWeeks = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; 
  date.setDate(date.getDate() + diff + (offsetWeeks * 7));
  return date;
}

function buildSlots(start: string, end: string, slotMin: number) {
  const out: string[] = [];
  let cur = start;
  while (timeToMinutes(cur) + slotMin <= timeToMinutes(end)) {
    out.push(cur);
    cur = addMinutes(cur, slotMin);
  }
  return out;
}

export default function PTLabScheduler() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Set<SlotKey>>(new Set());
  const [googleBusy, setGoogleBusy] = useState<Map<SlotKey, string>>(new Map());
  const [weekOffset, setWeekOffset] = useState(0); 

  const [showIntroPanel, setShowIntroPanel] = useState(false);
  const [introName, setIntroName] = useState("");
  
  const [showRegularPanel, setShowRegularPanel] = useState(false);
  const [regularName, setRegularName] = useState("");

  const [showItaPanel, setShowItaPanel] = useState(false);
  const [itaName, setItaName] = useState("");
  
  const [showExtraPanel, setShowExtraPanel] = useState(false);
  const [extraInput, setExtraInput] = useState("");
  const [activeExtraActivity, setActiveExtraActivity] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [showPaymentMenu, setShowPaymentMenu] = useState<string | null>(null);
  const [selectedDaysToFinalize, setSelectedDaysToFinalize] = useState<Set<string>>(new Set());
  const [zeroBalanceClients, setZeroBalanceClients] = useState<Client[]>([]);

  const [itaFinalizePrompt, setItaFinalizePrompt] = useState<{
    isOpen: boolean;
    clients: Client[];
    hoursInput: Record<string, string>;
    sessionsToProcess: Booking[];
  } | null>(null);

  const weekStart = useMemo(() => getMonday(weekOffset), [weekOffset]);
  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart]);
  const slots = useMemo(() => buildSlots(DEFAULT_START, DEFAULT_END, SLOT_MINUTES), []);

  const michelleClient = clients.find(c => c.name === 'Michelle appointment');
  const isMichelleActive = activeClientId === michelleClient?.id;
  const activeClientObj = clients.find(c => c.id === activeClientId);
  const isActiveItaJob = activeClientObj?.type === 'ita_job';

  const hasCurrentWeekBookings = useMemo(() => {
    return bookings.some(b => {
      const bDateStr = b.slotKey.split('|')[0];
      return weekDates.some(wd => isoDate(wd) === bDateStr);
    });
  }, [bookings, weekDates]);

  useEffect(() => {
    setSelectedDaysToFinalize(new Set());
    loadData();
  }, [weekOffset]); 

  async function loadData() {
    setLoading(true);
    const { data: clientData } = await supabase.from('clients')
        .select('*')
        .or('active.eq.true,active.is.null,name.eq.Michelle appointment')
        .order('created_at', { ascending: false });

    if (clientData) {
      const safeClients = clientData.map(c => ({
          ...c, 
          sessions_remaining: c.sessions_remaining || 0,
          historical_attended: c.historical_attended || 0,
          location: c.location || 'PTLab'
      }));
      setClients(safeClients);
      if (safeClients.length > 0 && !activeClientId && !activeExtraActivity) {
          const firstReal = safeClients.find(c => c.name !== 'Michelle appointment' && c.type !== 'extra') || safeClients[0];
          setActiveClientId(firstReal?.id || null);
      }
    }

    const { data: bookingData } = await supabase.from('bookings').select('id, slot_key, client_id, processed');
    if (bookingData) {
      setBookings(bookingData.map((b: any) => ({ 
          id: b.id, slotKey: b.slot_key, clientId: b.client_id, processed: b.processed || false 
      })));
    }

    try {
      const start = weekDates[0];
      const end = new Date(weekDates[5]); end.setHours(23, 59, 59);
      const res = await fetch(`/api/sync?start=${start.toISOString()}&end=${end.toISOString()}`);
      const eventsList = await res.json();
      const busyMap = new Map<string, string>();
      if (Array.isArray(eventsList)) {
        eventsList.forEach((event: any) => {
          const wStart = new Date(event.start).getTime();
          const wEnd = new Date(event.end).getTime();
          const title = event.title || "Busy"; 
          slots.forEach(t => {
            weekDates.forEach(d => {
              const slotKey = `${isoDate(d)}|${t}`;
              const sTime = new Date(`${isoDate(d)}T${t}:00`).getTime();
              const eTime = sTime + (SLOT_MINUTES * 60 * 1000);
              if (sTime < wEnd && eTime > wStart) {
                  if (!busyMap.has(slotKey)) busyMap.set(slotKey, title);
              }
            });
          });
        });
      }
      setGoogleBusy(busyMap);
    } catch (e) { console.error("Google Sync Failed:", e); }
    setLoading(false);
  }

  async function duplicatePreviousWeek() {
    if (!window.confirm("Duplicate all client sessions from the previous week into this week?")) return;
    setLoading(true);

    const prevWeekStart = getMonday(weekOffset - 1);
    const prevWeekDates = DAYS.map((_, i) => addDays(prevWeekStart, i));
    const startStr = isoDate(prevWeekDates[0]);
    const endStr = isoDate(prevWeekDates[5]);

    const { data: oldBookings, error: fetchError } = await supabase
        .from('bookings')
        .select('slot_key, client_id')
        .gte('slot_key', startStr)
        .lte('slot_key', endStr + '|23:59');

    if (fetchError || !oldBookings) {
        alert("Error fetching previous week: " + fetchError?.message);
        setLoading(false);
        return;
    }

    const validBookings = oldBookings.filter(b => {
        if (b.client_id === michelleClient?.id) return false;
        const cObj = clients.find(c => c.id === b.client_id);
        if (cObj && cObj.type === 'extra') return false; 
        return true;
    });

    if (validBookings.length === 0) {
        alert("No client sessions found in the previous week to duplicate.");
        setLoading(false);
        return;
    }

    const newBookingsToInsert = validBookings.map(b => {
        const [datePart, timePart] = b.slot_key.split('|');
        const oldDate = new Date(datePart);
        const newDate = addDays(oldDate, 7); 
        return {
            slot_key: `${isoDate(newDate)}|${timePart}`,
            client_id: b.client_id,
            processed: false 
        };
    });

    const { error: insertError } = await supabase.from('bookings').insert(newBookingsToInsert);
    
    if (insertError) {
        alert("Error saving duplicated week: " + insertError.message);
    } else {
        await loadData(); 
        for (const newB of newBookingsToInsert) {
             const cObj = clients.find(c => c.id === newB.client_id);
             if (cObj) {
                 const isIta = cObj.type === 'ita_job';
                 const googleName = isIta ? `Ita Job: ${cObj.name}` : cObj.name;
                 fetch('/api/sync', { method: 'POST', body: JSON.stringify({ slotKey: newB.slot_key, clientId: newB.client_id, clientName: googleName }) }).catch(e => console.error(e));
             }
        }
    }
    setLoading(false);
  }

  function toggleSelectKeys(keysToToggle: string[]) {
    setSelected(prev => {
        const n = new Set(prev);
        if (n.has(keysToToggle[0])) {
            keysToToggle.forEach(k => n.delete(k));
        } else {
            keysToToggle.forEach(k => n.add(k));
        }
        return n;
    });
  }

  function toggleDaySelection(dateStr: string) {
    setSelectedDaysToFinalize(prev => {
      const n = new Set(prev);
      n.has(dateStr) ? n.delete(dateStr) : n.add(dateStr);
      return n;
    });
  }

  function startExtraBooking() {
    if (!extraInput.trim()) return;
    setActiveExtraActivity(extraInput.trim());
    setActiveClientId(null); 
    setShowExtraPanel(false);
    setExtraInput("");
    setSelected(new Set());
  }

  async function confirm() {
    const isMichelle = activeClientId === michelleClient?.id;
    
    if (!isMichelle && !activeExtraActivity) {
        const hasConflict = Array.from(selected).some(slotKey => 
            bookings.some(b => b.slotKey === slotKey && b.clientId !== michelleClient?.id)
        );
        
        if (hasConflict) {
            alert("This spot is already taken! Only Michelle appointments can be layered over existing bookings.");
            return; 
        }
    }

    if (activeExtraActivity) {
        setLoading(true);
        const { data: newClient, error: clientErr } = await supabase
            .from('clients')
            .insert([{ name: activeExtraActivity, type: "extra", sessions_remaining: 0, historical_attended: 0 }])
            .select().single();

        if (clientErr || !newClient) { alert("Database Error: " + clientErr?.message); setLoading(false); return; }

        const newBookings = Array.from(selected).map(slotKey => ({
            slot_key: slotKey, client_id: newClient.id, processed: true 
        }));
        const { data, error } = await supabase.from('bookings').insert(newBookings).select();

        for (const slotKey of Array.from(selected)) {
            fetch('/api/sync', { method: 'POST', body: JSON.stringify({ slotKey, clientId: newClient.id, clientName: `Extra: ${activeExtraActivity}` }) }).catch(e => console.error(e));
        }

        setBookings(prev => [...prev, ...data!.map(b => ({ id: b.id, slotKey: b.slot_key, clientId: b.client_id, processed: b.processed }))]);
        setSelected(new Set());
        setActiveExtraActivity(null); 
        
        const firstReal = clients.find(c => c.name !== 'Michelle appointment' && c.type !== 'extra');
        setActiveClientId(firstReal?.id || null);
        
        await loadData();
        return;
    }

    if (!activeClientId) return;
    const activeName = activeClientObj?.name || "Client";
    const isIta = activeClientObj?.type === 'ita_job';

    const newBookings = Array.from(selected).map(slotKey => ({ slot_key: slotKey, client_id: activeClientId!, processed: false }));
    const { data, error } = await supabase.from('bookings').insert(newBookings).select();
    if (error || !data) { alert("Database Error: " + error.message); return; }

    const createdBookings: Booking[] = data.map(b => ({ id: b.id, slotKey: b.slot_key, clientId: b.client_id, processed: b.processed }));
    setBookings(prev => [...prev, ...createdBookings]);
    setSelected(new Set());

    for (const slotKey of Array.from(selected)) {
      if (activeName !== 'Michelle appointment') {
        const googleName = isIta ? `Ita Job: ${activeName}` : activeName;
        fetch('/api/sync', { method: 'POST', body: JSON.stringify({ slotKey, clientId: activeClientId, clientName: googleName }) }).catch(e => console.error(e));
      }
    }
  }

  async function cancelBookingSpan(keys: SlotKey[], bookingsToCancel: Booking[], clientName: string, clientType: string | undefined, isProcessed: boolean, clientId: string | null) {
    const paidWarning = isProcessed && clientType !== 'extra' ? "\n\n⚠️ NOTE: This session was already finalized." : "";
    if (!window.confirm(`Cancel ${keys.length} block(s) for ${clientName}?${paidWarning}`)) return; 

    const idsToRemove = new Set(bookingsToCancel.map(b => b.id));
    setBookings(prev => prev.filter(b => !idsToRemove.has(b.id)));
    await supabase.from('bookings').delete().in('id', Array.from(idsToRemove));

    if (clientType === 'extra' && clientId) {
        await supabase.from('clients').delete().eq('id', clientId);
    }

    if (clientName !== 'Michelle appointment') {
        const googleDelName = clientType === 'ita_job' ? `Ita Job: ${clientName}` : clientType === 'extra' ? `Extra: ${clientName}` : `PT: ${clientName}`;
        for (const key of keys) {
             fetch('/api/sync', { method: 'DELETE', body: JSON.stringify({ slotKey: key, clientName: googleDelName }) }).catch(e => console.error(e));
        }
    }
  }

  async function cancelExternalBookingSpan(keys: SlotKey[], title: string) {
    if (!window.confirm(`Delete Google Calendar event: "${title}"?`)) return;
    setGoogleBusy(prev => { const next = new Map(prev); keys.forEach(k => next.delete(k)); return next; });
    for (const key of keys) {
        fetch('/api/sync', { method: 'DELETE', body: JSON.stringify({ slotKey: key, clientName: title }) }).catch(e => console.error(e));
    }
  }

  async function logPayment(clientId: string, sessionModifier: number, clientName: string) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const newBalance = client.sessions_remaining + sessionModifier;
    
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, sessions_remaining: newBalance } : c));
    setShowPaymentMenu(null); 
    
    await supabase.from('clients').update({ sessions_remaining: newBalance }).eq('id', clientId);
    
    if (sessionModifier > 0) {
        alert(`✅ Success!\n\nAdded ${sessionModifier} ${client.type === 'ita_job' ? 'hours' : 'sessions'} for ${clientName}.\nNew Balance: ${newBalance}`);
    }
  }

  async function setExactBalance(clientId: string, exactAmount: number) {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, sessions_remaining: exactAmount } : c));
    setShowPaymentMenu(null);
    await supabase.from('clients').update({ sessions_remaining: exactAmount }).eq('id', clientId);
  }

  async function archiveClient(clientId: string, clientName: string) {
    if (!window.confirm(`Are you sure you want to remove ${clientName} from the active list?\n\n(Their history and invoices will be safely saved in the background).`)) return;
    setLoading(true);
    await supabase.from('clients').update({ active: false }).eq('id', clientId);
    setShowPaymentMenu(null);
    if (activeClientId === clientId) setActiveClientId(null);
    await loadData();
  }

  async function finalizeSelectedDays() {
    if (selectedDaysToFinalize.size === 0) return;

    const sessionsToFinalize = bookings.filter(b => {
        if (b.processed) return false; 
        if (b.clientId === michelleClient?.id) return false;
        const bDate = b.slotKey.split('|')[0];
        return selectedDaysToFinalize.has(bDate);
    });

    if (sessionsToFinalize.length === 0) {
        alert("There are no un-processed internal sessions on the selected day(s).");
        setSelectedDaysToFinalize(new Set()); return;
    }

    const itaClientIds = new Set(
        sessionsToFinalize.filter(b => clients.find(c => c.id === b.clientId)?.type === 'ita_job').map(b => b.clientId)
    );

    if (itaClientIds.size > 0) {
        const uniqueItaClients = Array.from(itaClientIds).map(id => clients.find(c => c.id === id)!);
        const initialInputs: Record<string, string> = {};
        uniqueItaClients.forEach(c => initialInputs[c.id] = ""); 
        
        setItaFinalizePrompt({
            isOpen: true, clients: uniqueItaClients, hoursInput: initialInputs, sessionsToProcess: sessionsToFinalize
        });
        return; 
    }

    if (!window.confirm(`Deduct balances for ${sessionsToFinalize.length} session(s) across the selected day(s)?`)) return;
    executeFinalization(sessionsToFinalize, {});
  }

  async function executeFinalization(sessionsToFinalize: Booking[], itaHoursOverride: Record<string, number>) {
    setLoading(true);
    const usageMap = new Map<string, number>();
    const newlyZeroedClients: Client[] = [];

    sessionsToFinalize.forEach(b => {
        const client = clients.find(c => c.id === b.clientId);
        if (client?.type !== 'ita_job' && client?.type !== 'extra') {
            usageMap.set(b.clientId, (usageMap.get(b.clientId) || 0) + 1);
        }
    });

    for (const [clientId, sessionsUsed] of usageMap.entries()) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            const newBalance = client.sessions_remaining - sessionsUsed;
            if (client.type !== 'ita_job' && client.sessions_remaining > 0 && newBalance <= 0) {
                newlyZeroedClients.push({ ...client, sessions_remaining: newBalance });
            }
            await supabase.from('clients').update({ sessions_remaining: newBalance }).eq('id', clientId);
        }
    }

    for (const [clientId, hoursToBill] of Object.entries(itaHoursOverride)) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            const newBalance = client.sessions_remaining - hoursToBill;
            const newHistorical = client.historical_attended + hoursToBill; 
            await supabase.from('clients').update({ sessions_remaining: newBalance, historical_attended: newHistorical }).eq('id', clientId);
        }
    }

    const idsToUpdate = sessionsToFinalize.map(b => b.id);
    await supabase.from('bookings').update({ processed: true }).in('id', idsToUpdate);

    setSelectedDaysToFinalize(new Set()); 
    setItaFinalizePrompt(null);
    await loadData(); 

    if (newlyZeroedClients.length > 0) setZeroBalanceClients(newlyZeroedClients);
    else alert("✅ Success! Balances have been updated.");
  }

  async function activateMichelle() {
    let michelle = clients.find(c => c.name === 'Michelle appointment');
    if (!michelle) {
        const { data } = await supabase.from('clients').insert([{ name: 'Michelle appointment', type: 'regular', sessions_remaining: 0, historical_attended: 0, active: true }]).select().single();
        if (data) { setClients(prev => [data, ...prev]); setActiveClientId(data.id); }
    } else { setActiveClientId(michelle.id); }
    setSelected(new Set()); setShowIntroPanel(false); setShowRegularPanel(false); setShowItaPanel(false); setShowExtraPanel(false); setShowPaymentMenu(null); setActiveExtraActivity(null);
  }

  async function addIntroClient() {
    if (!introName.trim()) return;
    const { data, error } = await supabase.from('clients').insert([{ name: introName, type: "intro", sessions_remaining: -3, historical_attended: 0, active: true, location: 'PTLab' }]).select().single();
    if (error || !data) return;
    setClients(prev => [...prev, data]); setActiveClientId(data.id); setIntroName(""); setShowIntroPanel(false); setActiveExtraActivity(null);
  }

  async function addRegularClient() {
    if (!regularName.trim()) return;
    const { data, error } = await supabase.from('clients').insert([{ name: regularName, type: "regular", sessions_remaining: 0, historical_attended: 0, active: true, location: 'PTLab' }]).select().single();
    if (error || !data) return;
    setClients(prev => [...prev, data]); setActiveClientId(data.id); setRegularName(""); setShowRegularPanel(false); setActiveExtraActivity(null);
  }

  async function addItaClient() {
    if (!itaName.trim()) return;
    const { data, error } = await supabase.from('clients').insert([{ name: itaName, type: "ita_job", sessions_remaining: 0, historical_attended: 0, active: true, location: 'PTLab' }]).select().single();
    if (error || !data) return;
    setClients(prev => [...prev, data]); setActiveClientId(data.id); setItaName(""); setShowItaPanel(false); setActiveExtraActivity(null);
  }

  // --- ALPHABETICAL SORTING ---
  const ptClients = clients
    .filter(c => c.name !== 'Michelle appointment' && c.type !== 'ita_job' && c.type !== 'extra')
    .sort((a, b) => a.name.localeCompare(b.name));

  const itaClients = clients
    .filter(c => c.type === 'ita_job')
    .sort((a, b) => a.name.localeCompare(b.name));

  // Dropdown UI Style Helpers
  function getDropdownStyle(activeId: string | null, list: Client[]) {
      const c = list.find(x => x.id === activeId);
      if (!c) return "bg-gray-50 text-gray-500 border-gray-200";
      if (c.sessions_remaining < 0) return "bg-red-50 text-red-700 border-red-300";
      if (c.sessions_remaining > 0) return "bg-green-50 text-green-700 border-green-300";
      if (c.type === 'ita_job') return "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]";
      return "bg-[#eef2f6] text-[#0160C9] border-[#0160C9]";
  }

  if (loading && bookings.length === 0) return <div className="h-screen flex items-center justify-center font-bold text-[#16202e]">Loading PTLab...</div>;

  return (
    <main className="h-screen w-full flex flex-col font-sans overflow-hidden" style={{ backgroundColor: PTLAB.bg, color: PTLAB.navy }}>
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        select { -webkit-appearance: none; appearance: none; }
      `}} />

      {/* --- NEW REDESIGNED HEADER --- */}
      <header className="px-3 py-3 md:px-4 border-b border-gray-200 bg-white shadow-sm z-10 flex flex-col gap-3 shrink-0 relative">
         
         {/* 1. THE 3 COLUMNS OF BUTTONS */}
         <div className="grid grid-cols-3 gap-2 w-full">
            
            {/* Col 1: PTLab */}
            <div className="flex flex-col gap-2">
               <button onClick={() => {setShowIntroPanel(!showIntroPanel); setShowRegularPanel(false); setShowItaPanel(false); setShowExtraPanel(false);}} className="w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap bg-white text-[#0160C9] border-[#0160C9] hover:bg-blue-50">+ Intro Pack</button>
               <button onClick={() => {setShowRegularPanel(!showRegularPanel); setShowIntroPanel(false); setShowItaPanel(false); setShowExtraPanel(false);}} className="w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap bg-[#16202e] text-white border-[#16202e]">+ Regular PT</button>
               <Link href="/report" className="w-full"><button className="w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200">PT Reports</button></Link>
            </div>

            {/* Col 2: Ita Job */}
            <div className="flex flex-col gap-2">
               <button onClick={() => {setShowItaPanel(!showItaPanel); setShowIntroPanel(false); setShowRegularPanel(false); setShowExtraPanel(false);}} className="w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap bg-green-50 text-green-700 border-green-400 hover:bg-green-100">+ The Ita Job</button>
               <Link href="/ita-report" className="w-full"><button className="w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap bg-green-100 text-green-800 border-green-300 hover:bg-green-200">Ita Reports</button></Link>
               <div className="flex-1 flex justify-center items-center"><Image src="/logo.jpg" alt="PTLab" width={32} height={32} className="rounded-full border border-gray-200 hidden sm:block" /></div>
            </div>

            {/* Col 3: Extras */}
            <div className="flex flex-col gap-2">
               <button onClick={activateMichelle} className={`w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap ${isMichelleActive ? "bg-red-500 text-white border-red-500" : "bg-white text-red-500 border-red-500"}`}>Michelle</button>
               <button onClick={() => {
                   if (selected.size === 0) { alert("Please click on the calendar to select time slots first, then click '+ Extra' to name it."); } 
                   else { setShowExtraPanel(true); setShowIntroPanel(false); setShowRegularPanel(false); setShowItaPanel(false); }
               }} className="w-full py-2 rounded-lg text-[10px] sm:text-xs font-bold border transition-colors whitespace-nowrap bg-yellow-50 text-yellow-700 border-yellow-400 hover:bg-yellow-100">+ Extra</button>
            </div>
         </div>

         {/* 2. DATE NAVIGATION & COPY WEEK */}
         <div className="flex items-center justify-between w-full border-t border-gray-100 pt-3">
            {!hasCurrentWeekBookings && !loading ? (
                <button onClick={duplicatePreviousWeek} className="px-2 sm:px-3 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm shrink-0">
                    📋 Copy Week
                </button>
            ) : <div className="w-20 sm:w-24 shrink-0"></div>}
            
            <div className="flex items-center gap-2 sm:gap-4">
                <button onClick={() => setWeekOffset(prev => prev - 1)} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-lg font-bold">‹</button>
                <span className="text-xs sm:text-sm font-bold w-24 text-center whitespace-nowrap">{weekDates[0].getDate()} - {weekDates[5].getDate()} {weekDates[5].toLocaleString('default', { month: 'short' })}</span>
                <button onClick={() => setWeekOffset(prev => prev + 1)} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-lg font-bold">›</button>
            </div>
            
            <div className="w-20 sm:w-24 shrink-0"></div>
         </div>

         {/* 3. CLIENT DROPDOWNS */}
         <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            
            {/* PTLab Select Row */}
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-gray-400 uppercase w-12 text-right shrink-0">PTLab</span>
               <div className="relative flex-1">
                   <select 
                       value={ptClients.some(c => c.id === activeClientId) ? activeClientId! : ""}
                       onChange={e => { setActiveClientId(e.target.value); setActiveExtraActivity(null); setShowPaymentMenu(null); }}
                       className={`w-full p-2.5 rounded-lg text-sm font-bold border outline-none truncate pr-8 ${getDropdownStyle(activeClientId, ptClients)}`}
                   >
                       <option value="" disabled>Select PTLab Client...</option>
                       {ptClients.map(c => {
                           const isOwing = c.sessions_remaining < 0;
                           const isCredit = c.sessions_remaining > 0;
                           return (
                               <option key={c.id} value={c.id} className={isOwing ? 'text-red-600 font-bold' : isCredit ? 'text-green-600 font-bold' : 'text-gray-800'}>
                                   {isOwing ? '🔴 ' : isCredit ? '🟢 ' : ''}{c.name} ({c.sessions_remaining})
                               </option>
                           );
                       })}
                   </select>
                   <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[10px]">▼</span>
               </div>
               {/* Action Buttons */}
               {ptClients.some(c => c.id === activeClientId) && (
                   <div className="flex gap-1 shrink-0">
                       <button onClick={() => setShowPaymentMenu(activeClientId!)} className="w-10 h-10 bg-green-500 text-white rounded-lg font-bold shadow-sm hover:bg-green-600 transition-colors">$</button>
                       <button onClick={() => archiveClient(activeClientId!, activeClientObj!.name)} className="w-10 h-10 bg-red-500 text-white rounded-lg font-bold shadow-sm hover:bg-red-600 transition-colors">✕</button>
                   </div>
               )}
            </div>

            {/* Ita Job Select Row */}
            {itaClients.length > 0 && (
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-green-600 uppercase w-12 text-right shrink-0">Ita Job</span>
               <div className="relative flex-1">
                   <select 
                       value={itaClients.some(c => c.id === activeClientId) ? activeClientId! : ""}
                       onChange={e => { setActiveClientId(e.target.value); setActiveExtraActivity(null); setShowPaymentMenu(null); }}
                       className={`w-full p-2.5 rounded-lg text-sm font-bold border outline-none truncate pr-8 ${getDropdownStyle(activeClientId, itaClients)}`}
                   >
                       <option value="" disabled>Select Ita Job...</option>
                       {itaClients.map(c => {
                           const isOwing = c.sessions_remaining < 0;
                           const isCredit = c.sessions_remaining > 0;
                           return (
                               <option key={c.id} value={c.id} className={isOwing ? 'text-red-600 font-bold' : isCredit ? 'text-green-600 font-bold' : 'text-gray-800'}>
                                   {isOwing ? '🔴 ' : isCredit ? '🟢 ' : ''}{c.name} ({c.sessions_remaining} hrs)
                               </option>
                           );
                       })}
                   </select>
                   <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-green-800">▼</span>
               </div>
               {/* Action Buttons */}
               {itaClients.some(c => c.id === activeClientId) && (
                   <div className="flex gap-1 shrink-0">
                       <button onClick={() => setShowPaymentMenu(activeClientId!)} className="w-10 h-10 bg-green-500 text-white rounded-lg font-bold shadow-sm hover:bg-green-600 transition-colors">$</button>
                       <button onClick={() => archiveClient(activeClientId!, activeClientObj!.name)} className="w-10 h-10 bg-red-500 text-white rounded-lg font-bold shadow-sm hover:bg-red-600 transition-colors">✕</button>
                   </div>
               )}
            </div>
            )}

            {/* Active Extra Display */}
            {activeExtraActivity && (
                <div className="flex items-center gap-2">
                   <span className="text-[10px] font-black text-yellow-600 uppercase w-12 text-right shrink-0">Extra</span>
                   <button onClick={() => { setActiveExtraActivity(null); setSelected(new Set()); }} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-yellow-500 text-left shadow-sm">
                       {activeExtraActivity} (Tap to Cancel)
                   </button>
                </div>
            )}
         </div>
      </header>

      {/* FLOATING ACTION PANELS */}
      {showIntroPanel && (
        <div className="px-4 pb-2 absolute top-40 left-0 z-50 animate-in fade-in slide-in-from-top-2 w-full">
          <div className="bg-white p-3 rounded-xl shadow-2xl border border-gray-200 flex gap-2 max-w-md mx-auto items-center mt-2">
            <span className="text-xs font-bold text-gray-400">NEW INTRO PACK:</span>
            <input autoFocus className="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm outline-none" placeholder="Name..." value={introName} onChange={e => setIntroName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIntroClient()} />
            <button onClick={addIntroClient} className="px-4 py-2 text-white text-sm font-bold rounded-lg" style={{ backgroundColor: PTLAB.mainBlue }}>Add</button>
          </div>
        </div>
      )}

      {showRegularPanel && (
        <div className="px-4 pb-2 absolute top-40 left-0 z-50 animate-in fade-in slide-in-from-top-2 w-full">
          <div className="bg-white p-3 rounded-xl shadow-2xl border border-gray-200 flex gap-2 max-w-md mx-auto items-center mt-2">
            <span className="text-xs font-bold text-gray-400">NEW REGULAR PT:</span>
            <input autoFocus className="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm outline-none" placeholder="Name..." value={regularName} onChange={e => setRegularName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRegularClient()} />
            <button onClick={addRegularClient} className="px-4 py-2 text-white text-sm font-bold rounded-lg" style={{ backgroundColor: PTLAB.navy }}>Add</button>
          </div>
        </div>
      )}

      {showItaPanel && (
        <div className="px-4 pb-2 absolute top-40 left-0 z-50 animate-in fade-in slide-in-from-top-2 w-full">
          <div className="bg-green-50 p-3 rounded-xl shadow-2xl border border-green-200 flex gap-2 max-w-md mx-auto items-center mt-2">
            <span className="text-xs font-bold text-green-700">NEW ITA JOB:</span>
            <input autoFocus className="flex-1 bg-white px-3 py-2 rounded-lg text-sm outline-none border border-green-100" placeholder="Job/Client Name..." value={itaName} onChange={e => setItaName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItaClient()} />
            <button onClick={addItaClient} className="px-4 py-2 text-white text-sm font-bold rounded-lg bg-green-600 hover:bg-green-700">Add</button>
          </div>
        </div>
      )}

      {showExtraPanel && (
        <div className="px-4 pb-2 absolute top-40 left-0 z-50 animate-in fade-in slide-in-from-top-2 w-full">
          <div className="bg-yellow-50 p-3 rounded-xl shadow-2xl border border-yellow-200 flex gap-2 max-w-md mx-auto items-center mt-2">
            <span className="text-xs font-bold text-yellow-700">BOOKING EXTRA ({selected.size} slots):</span>
            <input autoFocus className="flex-1 bg-white px-3 py-2 rounded-lg text-sm outline-none border border-yellow-100" placeholder="e.g. Doctor, Meeting..." value={extraInput} onChange={e => setExtraInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && startExtraBooking()} />
            <button onClick={startExtraBooking} className="px-4 py-2 text-white text-sm font-bold rounded-lg bg-yellow-500 hover:bg-yellow-600">Save</button>
          </div>
        </div>
      )}

      <section className="flex-1 p-2 md:p-4 min-h-0 relative">
        <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-auto hide-scrollbar relative">
          <div className="min-w-[800px] flex flex-col relative">
            
            <div className="grid grid-cols-[60px_repeat(6,1fr)] bg-white border-b border-gray-100 z-40 sticky top-0 shadow-sm">
                <div className="sticky left-0 z-50 bg-white border-r border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.03)]"></div> 
                {DAYS.map((d, i) => {
                const dateStr = isoDate(weekDates[i]);
                const isDaySelected = selectedDaysToFinalize.has(dateStr);
                return (
                    <div key={d} onClick={() => toggleDaySelection(dateStr)} className={`p-2 text-center text-sm font-bold tracking-wide border-l border-gray-50 cursor-pointer transition-colors ${isDaySelected ? 'bg-green-100 text-green-800' : 'bg-white hover:bg-gray-50'}`} style={{ color: isDaySelected ? '#166534' : PTLAB.navy }}>
                    {d}
                    <div className={`text-[10px] font-normal ${isDaySelected ? 'opacity-90' : 'opacity-50'}`}>{dateStr.split('-').slice(1).join('/')}</div>
                    {isDaySelected && <div className="text-[9px] mt-0.5 font-bold uppercase tracking-wider text-green-600">Selected</div>}
                    </div>
                );
                })}
            </div>

            <div className="flex min-w-full relative" style={{ height: slots.length * SLOT_HEIGHT }}>
                
                <div className="w-[60px] shrink-0 bg-white border-r border-gray-100 sticky left-0 z-30 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                    {slots.map((t, i) => (
                        <div key={t} className="absolute w-full text-[12px] font-bold text-right pr-2 flex items-center justify-end" style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT, color: '#192230' }}>
                            {t}
                        </div>
                    ))}
                </div>

                <div className="flex-1 flex bg-white relative z-10">
                    {weekDates.map(d => {
                        const dayDateStr = isoDate(d);
                        
                        const dayBlocks: any[] = [];
                        const michelleBlocks: any[] = [];
                        let currentBlock: any = null;
                        let currentMichelle: any = null;

                        for (let i = 0; i < slots.length; i++) {
                            const t = slots[i];
                            const key = `${dayDateStr}|${t}`;
                            
                            const slotBookings = bookings.filter(b => b.slotKey === key);
                            const michelleBooking = slotBookings.find(b => b.clientId === michelleClient?.id);
                            const regularBooking = slotBookings.find(b => b.clientId !== michelleClient?.id);
                            const googleTitle = googleBusy.get(key); 
                            const isGoogleBlocked = !!googleTitle && !regularBooking; 
                            const isSelected = selected.has(key);

                            let ownerType = "empty";
                            let ownerId: string | null = null;
                            let title = "";
                            let bg = "transparent";
                            let color = "white";
                            let blockBorder = "none";
                            let clientType = "";
                            let isProcessed = false;

                            if (isSelected) {
                                ownerType = "selected";
                                if (activeExtraActivity) { bg = "#fde047"; }
                                else if (isActiveItaJob) { bg = "#86efac"; }
                                else { bg = PTLAB.orange; }
                            } else if (regularBooking) {
                                ownerType = "client";
                                ownerId = regularBooking.clientId;
                                const cObj = clients.find(c => c.id === ownerId);
                                title = cObj?.name || "Archived Client";
                                clientType = cObj?.type || "";
                                isProcessed = regularBooking.processed;
                                
                                if (cObj?.location === 'AF') {
                                    bg = "#7e22ce"; 
                                    color = "white";
                                    blockBorder = "2px solid #a855f7"; 
                                } else if (clientType === 'ita_job') {
                                    bg = "#dcfce7";
                                    color = "#166534";
                                    blockBorder = "2px solid #86efac";
                                } else if (clientType === 'extra') {
                                    bg = "#fef08a";
                                    color = "#a16207";
                                    blockBorder = "2px solid #eab308";
                                } else {
                                    bg = "#192230"; 
                                    color = "white"; 
                                    blockBorder = "2px solid #d4703e"; 
                                }
                            } else if (isGoogleBlocked) {
                                ownerType = "google";
                                title = googleTitle;
                                bg = "#e5e7eb";
                                color = "#4b5563";
                                blockBorder = "1px solid white";
                            }

                            if (ownerType !== "empty") {
                                if (currentBlock && currentBlock.ownerType === ownerType && currentBlock.ownerId === ownerId && currentBlock.title === title) {
                                    currentBlock.span += 1;
                                    currentBlock.keys.push(key);
                                    if (regularBooking) currentBlock.bookings.push(regularBooking);
                                } else {
                                    if (currentBlock) dayBlocks.push(currentBlock);
                                    currentBlock = { startIdx: i, span: 1, keys: [key], bookings: regularBooking ? [regularBooking] : [], ownerType, ownerId, title, bg, color, blockBorder, clientType, isProcessed };
                                }
                            } else {
                                if (currentBlock) { dayBlocks.push(currentBlock); currentBlock = null; }
                            }

                            if (michelleBooking) {
                                if (currentMichelle) {
                                    currentMichelle.span += 1;
                                    currentMichelle.keys.push(key);
                                    currentMichelle.bookings.push(michelleBooking);
                                } else {
                                    currentMichelle = { startIdx: i, span: 1, keys: [key], bookings: [michelleBooking] };
                                }
                            } else {
                                if (currentMichelle) { michelleBlocks.push(currentMichelle); currentMichelle = null; }
                            }
                        }
                        if (currentBlock) dayBlocks.push(currentBlock);
                        if (currentMichelle) michelleBlocks.push(currentMichelle);

                        return (
                            <div key={d.toISOString()} className="flex-1 border-l border-gray-50 relative" style={{ height: slots.length * SLOT_HEIGHT }}>
                                
                                {slots.map((t, i) => {
                                    const key = `${dayDateStr}|${t}`;
                                    return (
                                        <div 
                                            key={t}
                                            className="absolute w-full border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                                            style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                                            onClick={() => toggleSelectKeys([key])}
                                        />
                                    );
                                })}

                                {dayBlocks.map(block => (
                                    <div
                                        key={block.keys[0]}
                                        className="absolute overflow-hidden flex items-center justify-center m-[0px] shadow-sm transition-all"
                                        style={{
                                            top: (block.startIdx * SLOT_HEIGHT) + 2,
                                            height: (block.span * SLOT_HEIGHT) - 4,
                                            left: "2px",
                                            width: "calc(100% - 4px)",
                                            backgroundColor: block.bg,
                                            border: block.blockBorder,
                                            borderRadius: "6px",
                                            zIndex: 10,
                                            cursor: block.ownerType === "selected" ? "pointer" : isMichelleActive ? "pointer" : "default"
                                        }}
                                        onClick={() => {
                                            if (block.ownerType === "selected") toggleSelectKeys(block.keys);
                                            else if (isMichelleActive && block.ownerType !== "selected") toggleSelectKeys(block.keys);
                                        }}
                                        onDoubleClick={() => {
                                            if (block.ownerType === "client") cancelBookingSpan(block.keys, block.bookings, block.title, block.clientType, block.isProcessed, block.ownerId);
                                            else if (block.ownerType === "google") cancelExternalBookingSpan(block.keys, block.title);
                                        }}
                                    >
                                        <span 
                                            className="text-[11px] font-bold px-1 text-center drop-shadow-sm truncate block w-full leading-tight" 
                                            style={{ color: block.color }}
                                            title={block.title}
                                        >
                                            {block.title}
                                        </span>
                                    </div>
                                ))}

                                {michelleBlocks.map(mBlock => (
                                    <div
                                        key={mBlock.keys[0]}
                                        className={`absolute ${isMichelleActive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}`}
                                        style={{
                                            top: (mBlock.startIdx * SLOT_HEIGHT) + 2,
                                            height: (mBlock.span * SLOT_HEIGHT) - 4,
                                            left: "2px",
                                            width: "calc(100% - 4px)",
                                            backgroundColor: "rgba(239, 68, 68, 0.25)",
                                            border: "2px dashed rgba(239, 68, 68, 0.8)",
                                            borderRadius: "6px",
                                            zIndex: 20
                                        }}
                                        onClick={() => { if (isMichelleActive) toggleSelectKeys(mBlock.keys); }}
                                        onDoubleClick={() => { if (isMichelleActive) cancelBookingSpan(mBlock.keys, mBlock.bookings, 'Michelle appointment', undefined, false, null); }}
                                    />
                                ))}
                            </div>
                        )
                    })}
                </div>
            </div>
          </div>
        </div>

        {/* SHARED PAYMENT MENU MODAL */}
        {showPaymentMenu && (() => {
            const client = clients.find(c => c.id === showPaymentMenu);
            if (!client) return null;
            const isIta = client.type === 'ita_job';
            
            return (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setShowPaymentMenu(null)}>
                    <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-black text-[#16202e] truncate pr-2">{client.name}</h2>
                            <span className={`px-3 py-1 rounded-full text-sm font-bold shrink-0 ${client.sessions_remaining < 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                                Bal: {client.sessions_remaining}
                            </span>
                        </div>

                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                            {isIta ? 'Log Paid Hours' : 'Add Pre-Paid Sessions'}
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                                <button key={num} onClick={() => logPayment(client.id, num, client.name)} className="py-3 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 font-bold rounded-xl shadow-sm text-sm transition-colors">+{num}</button>
                            ))}
                        </div>

                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Corrections</div>
                        <div className="grid grid-cols-3 gap-2 mb-6">
                            <button onClick={() => logPayment(client.id, -1, client.name)} className="py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold rounded-xl shadow-sm text-sm transition-colors">-1</button>
                            <button onClick={() => logPayment(client.id, -5, client.name)} className="py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold rounded-xl shadow-sm text-sm transition-colors">-5</button>
                            <button onClick={() => setExactBalance(client.id, 0)} className="py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 font-bold rounded-xl shadow-sm text-sm transition-colors">Set 0</button>
                        </div>

                        <button onClick={() => setShowPaymentMenu(null)} className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Cancel</button>
                    </div>
                </div>
            );
        })()}

        {itaFinalizePrompt?.isOpen && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 rounded-2xl backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="text-xl font-black text-green-700 mb-2">The Ita Job: Hours Worked</h2>
                    <p className="text-sm text-gray-600 mb-5 leading-relaxed">How many actual hours did you work for each client today?</p>
                    <div className="space-y-4 mb-6">
                        {itaFinalizePrompt.clients.map(c => (
                            <div key={c.id} className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                                <span className="font-bold text-[#16202e] truncate pr-2">{c.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <input 
                                        type="text" placeholder="e.g. 2.5"
                                        className="w-16 px-2 py-1.5 text-right font-bold rounded border border-green-200 focus:outline-none focus:border-green-500"
                                        value={itaFinalizePrompt.hoursInput[c.id]}
                                        onChange={(e) => setItaFinalizePrompt(prev => ({...prev!, hoursInput: { ...prev!.hoursInput, [c.id]: e.target.value }}))}
                                    />
                                    <span className="text-xs font-bold text-green-700">hrs</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setItaFinalizePrompt(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                        <button 
                            onClick={() => {
                                const processedHours: Record<string, number> = {};
                                let allValid = true;
                                for (const c of itaFinalizePrompt.clients) {
                                    const valStr = itaFinalizePrompt.hoursInput[c.id] || "0";
                                    const val = parseFloat(valStr.replace(',', '.'));
                                    if (isNaN(val) || val < 0) allValid = false;
                                    processedHours[c.id] = val;
                                }
                                if (!allValid) { alert("Please enter a valid number of hours (e.g. 3.5)"); return; }
                                executeFinalization(itaFinalizePrompt.sessionsToProcess, processedHours);
                            }} 
                            className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors"
                        >Confirm</button>
                    </div>
                </div>
            </div>
        )}
        
        {zeroBalanceClients.length > 0 && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 rounded-2xl backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">⚠️</span><h2 className="text-xl font-black text-red-600">Packages Finished!</h2>
                    </div>
                    <p className="text-sm text-gray-600 mb-5 font-medium leading-relaxed">These clients hit 0 sessions. Click below to instantly open iMessage.</p>
                    <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-2 hide-scrollbar">
                        {zeroBalanceClients.map(c => {
                            const message = `Hi ${c.name}, just letting you know that next session we'll start a new Training Package. Thank you!`;
                            const smsLink = `sms:?body=${encodeURIComponent(message)}`;
                            return (
                                <div key={c.id} className="p-3 bg-red-50 rounded-xl border border-red-100 flex flex-col gap-3">
                                    <div className="font-bold text-[#16202e] text-center">{c.name}</div>
                                    <a href={smsLink} className="text-center py-2.5 bg-green-500 text-white rounded-lg text-sm font-bold shadow-md hover:bg-green-600 transition-colors">💬 Text {c.name}</a>
                                </div>
                            )
                        })}
                    </div>
                    <button onClick={() => setZeroBalanceClients([])} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Close Warning</button>
                </div>
            </div>
        )}
      </section>

      <footer className="p-3 md:p-4 pt-0 shrink-0 flex gap-4">
        {selected.size > 0 && !showExtraPanel ? (
            <button onClick={confirm} className={`w-full py-3 md:py-4 rounded-xl text-base md:text-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2`} style={{ backgroundColor: isActiveItaJob ? "#22c55e" : activeExtraActivity ? "#eab308" : PTLAB.mainBlue, color: PTLAB.white }}>
                Confirm {selected.size} {isActiveItaJob || activeExtraActivity ? "Blocks" : "Sessions"}
            </button>
        ) : selectedDaysToFinalize.size > 0 ? (
            <button onClick={finalizeSelectedDays} className="w-full py-3 md:py-4 rounded-xl text-base md:text-lg font-bold shadow-sm border-2 transition-all flex items-center justify-center gap-2 bg-green-50 text-green-700 border-green-400 hover:bg-green-100">
                ✅ Finalize {selectedDaysToFinalize.size} Selected Day(s)
            </button>
        ) : (
            <div className="w-full py-3 md:py-4 rounded-xl text-xs md:text-sm font-bold border-2 flex items-center justify-center text-gray-400 border-gray-200 bg-gray-50 text-center px-2">
                👆 Click a Day Header (e.g. Mon) to finalize attendance
            </div>
        )}
      </footer>
    </main>
  );
}