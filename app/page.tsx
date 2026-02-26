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
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; 
  date.setDate(date.getDate() + diff + (offsetWeeks * 7));
  date.setHours(0, 0, 0, 0);
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
          historical_attended: c.historical_attended || 0
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

  async function logPayment(clientId: string, sessionModifier: number) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const newBalance = client.sessions_remaining + sessionModifier;
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, sessions_remaining: newBalance } : c));
    setShowPaymentMenu(null); 
    await supabase.from('clients').update({ sessions_remaining: newBalance }).eq('id', clientId);
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
    const { data, error } = await supabase.from('clients').insert([{ name: introName, type: "intro", sessions_remaining: -3, historical_attended: 0, active: true }]).select().single();
    if (error || !data) return;
    setClients(prev => [...prev, data]); setActiveClientId(data.id); setIntroName(""); setShowIntroPanel(false); setActiveExtraActivity(null);
  }

  async function addRegularClient() {
    if (!regularName.trim()) return;
    const { data, error } = await supabase.from('clients').insert([{ name: regularName, type: "regular", sessions_remaining: 0, historical_attended: 0, active: true }]).select().single();
    if (error || !data) return;
    setClients(prev => [...prev, data]); setActiveClientId(data.id); setRegularName(""); setShowRegularPanel(false); setActiveExtraActivity(null);
  }

  async function addItaClient() {
    if (!itaName.trim()) return;
    const { data, error } = await supabase.from('clients').insert([{ name: itaName, type: "ita_job", sessions_remaining: 0, historical_attended: 0, active: true }]).select().single();
    if (error || !data) return;
    setClients(prev => [...prev, data]); setActiveClientId(data.id); setItaName(""); setShowItaPanel(false); setActiveExtraActivity(null);
  }

  if (loading && bookings.length === 0) return <div className="h-screen flex items-center justify-center font-bold text-[#16202e]">Loading PTLab...</div>;

  const ptClients = clients.filter(c => c.name !== 'Michelle appointment' && c.type !== 'ita_job' && c.type !== 'extra');
  const itaClients = clients.filter(c => c.type === 'ita_job');

  return (
    <main className="h-screen w-full flex flex-col font-sans overflow-hidden" style={{ backgroundColor: PTLAB.bg, color: PTLAB.navy }}>
      <header className="px-3 py-3 md:px-4 border-b border-gray-200 bg-white shadow-sm z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between shrink-0 gap-4 overflow-y-auto max-h-[40vh] lg:max-h-none">
         <div className="flex flex-col md:flex-row items-start gap-4 flex-1 w-full min-w-0">
            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                <div className="flex flex-row md:flex-col gap-2 w-full md:w-32 min-w-max">
                    <button onClick={() => {setShowIntroPanel(!showIntroPanel); setShowRegularPanel(false); setShowItaPanel(false); setShowExtraPanel(false);}} className="shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold border transition-colors whitespace-nowrap" style={{ backgroundColor: showIntroPanel ? PTLAB.mainBlue : PTLAB.white, color: showIntroPanel ? PTLAB.white : PTLAB.mainBlue, borderColor: PTLAB.mainBlue }}>+ Intro Pack</button>
                    <button onClick={() => {setShowRegularPanel(!showRegularPanel); setShowIntroPanel(false); setShowItaPanel(false); setShowExtraPanel(false);}} className="shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold border transition-colors whitespace-nowrap" style={{ backgroundColor: showRegularPanel ? PTLAB.navy : PTLAB.white, color: showRegularPanel ? PTLAB.white : PTLAB.navy, borderColor: PTLAB.navy }}>+ Regular PT</button>
                    <Link href="/report" className="shrink-0"><button className="w-full px-4 md:px-2 py-1.5 md:py-1 rounded-full text-[11px] md:text-[10px] font-bold border transition-colors bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200 whitespace-nowrap">PT Reports</button></Link>
                    <div className="hidden md:block h-[1px] w-full bg-gray-200 my-0.5"></div>
                    <button onClick={() => {setShowItaPanel(!showItaPanel); setShowIntroPanel(false); setShowRegularPanel(false); setShowExtraPanel(false);}} className="shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold border transition-colors bg-green-50 text-green-700 border-green-400 hover:bg-green-100 whitespace-nowrap">+ The Ita Job</button>
                    <Link href="/ita-report" className="shrink-0"><button className="w-full px-4 md:px-2 py-1.5 md:py-1 rounded-full text-[11px] md:text-[10px] font-bold border transition-colors bg-green-100 text-green-800 border-green-300 hover:bg-green-200 whitespace-nowrap">Ita Reports</button></Link>
                    <div className="hidden md:block h-[1px] w-full bg-gray-200 my-0.5"></div>
                    <button onClick={() => {
                        if (selected.size === 0) {
                            alert("Please click on the calendar to select time slots first, then click '+ Extra' to name it.");
                        } else {
                            setShowExtraPanel(true); setShowIntroPanel(false); setShowRegularPanel(false); setShowItaPanel(false);
                        }
                    }} className="shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold border transition-colors bg-yellow-50 text-yellow-700 border-yellow-400 hover:bg-yellow-100 whitespace-nowrap">+ Extra</button>
                    <div className="hidden md:block h-[1px] w-full bg-gray-200 my-0.5"></div>
                    <button onClick={activateMichelle} className="shrink-0 px-4 md:px-2 py-1.5 md:py-1 rounded-full text-[11px] md:text-[10px] font-bold border transition-colors whitespace-nowrap" style={{ backgroundColor: isMichelleActive ? "#ef4444" : "transparent", color: isMichelleActive ? "white" : "#ef4444", borderColor: "#ef4444" }}>Michelle</button>
                </div>
                <div className="hidden md:block w-[1px] self-stretch bg-gray-300 mx-2 shrink-0"></div>
            </div>
            
            <div className="flex flex-col flex-1 gap-3 overflow-y-auto pr-2 w-full">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-12 shrink-0 text-right">PTLab</span>
                    <div className="flex flex-wrap items-center gap-2">
                        {ptClients.map(c => {
                            const isActive = c.id === activeClientId && !activeExtraActivity;
                            const balance = c.sessions_remaining;
                            return (
                            <div key={c.id} className="relative group mt-1">
                                {/* RED 'X' ARCHIVE BUTTON ON THE LEFT */}
                                <button onClick={(e) => { e.stopPropagation(); archiveClient(c.id, c.name); }} className={`absolute -top-2 -left-1 z-10 w-5 h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] font-bold text-white hover:bg-red-600 shadow-sm ${isActive ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'} transition-opacity`}>✕</button>
                                
                                <button onClick={() => { setActiveClientId(c.id); setActiveExtraActivity(null); setSelected(new Set()); setShowPaymentMenu(null); setShowExtraPanel(false); }} className="pl-4 pr-2 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap shrink-0 flex items-center gap-2"
                                    style={{ backgroundColor: isActive ? PTLAB.mainBlue : "transparent", color: isActive ? PTLAB.white : PTLAB.mainBlue, border: isActive ? "none" : `1px solid ${PTLAB.mainBlue}`, boxShadow: isActive ? `0 2px 5px ${PTLAB.mainBlue}80` : "none" }}>
                                    {c.name}
                                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : balance <= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{balance}</span>
                                </button>

                                {/* GREEN '$' PAYMENT BUTTON ON THE RIGHT */}
                                <button onClick={(e) => { e.stopPropagation(); setShowPaymentMenu(showPaymentMenu === c.id ? null : c.id); }} className={`absolute -top-2 -right-1 z-10 w-5 h-5 bg-green-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] font-bold text-white hover:bg-green-600 shadow-sm ${isActive ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'} transition-opacity`}>$</button>
                                
                                {showPaymentMenu === c.id && (
                                    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-30 min-w-[160px]">
                                        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5 text-center border-b pb-1">Add Sessions</div>
                                        <div className="grid grid-cols-4 gap-1 mb-3">{[1,2,3,4,5,6,7,8,9,10,11,12].map(num => <button key={num} onClick={() => logPayment(c.id, num)} className="py-1 bg-gray-50 hover:bg-green-100 text-green-700 font-bold rounded text-xs transition-colors border border-gray-100">+{num}</button>)}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5 text-center border-b pb-1">Corrections</div>
                                        <div className="grid grid-cols-3 gap-1">
                                            <button onClick={() => logPayment(c.id, -1)} className="py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded text-xs transition-colors border border-red-100">-1</button>
                                            <button onClick={() => logPayment(c.id, -5)} className="py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded text-xs transition-colors border border-red-100">-5</button>
                                            <button onClick={() => setExactBalance(c.id, 0)} className="py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded text-xs transition-colors">Set 0</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            )
                        })}
                    </div>
                </div>

                {itaClients.length > 0 && (
                    <div className="flex items-center gap-3 border-t border-gray-100 pt-2">
                        <span className="text-[10px] font-black text-green-600 uppercase tracking-widest w-12 shrink-0 text-right">Ita Job</span>
                        <div className="flex flex-wrap items-center gap-2">
                            {itaClients.map(c => {
                                const isActive = c.id === activeClientId && !activeExtraActivity;
                                return (
                                    <div key={c.id} className="relative group mt-1">
                                        <button onClick={() => { setActiveClientId(c.id); setActiveExtraActivity(null); setSelected(new Set()); setShowPaymentMenu(null); setShowExtraPanel(false); }} className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap shrink-0"
                                            style={{ backgroundColor: isActive ? "#22c55e" : "#dcfce7", color: isActive ? "white" : "#166534", boxShadow: isActive ? "0 2px 5px rgba(34, 197, 94, 0.4)" : "none", border: isActive ? "none" : "1px solid #bbf7d0" }}>
                                            {c.name}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); archiveClient(c.id, c.name); }} className={`absolute -top-2 -right-1 z-10 w-5 h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] font-bold text-white hover:bg-red-600 shadow-sm ${isActive ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'} transition-opacity`}>✕</button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {activeExtraActivity && (
                    <div className="flex items-center gap-3 border-t border-gray-100 pt-2">
                        <span className="text-[10px] font-black text-yellow-600 uppercase tracking-widest w-12 shrink-0 text-right">Extra</span>
                        <button onClick={() => { setActiveExtraActivity(null); setSelected(new Set()); }} className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap shrink-0"
                            style={{ backgroundColor: "#eab308", color: "white", boxShadow: "0 2px 5px rgba(234, 179, 8, 0.4)", border: "none" }}>
                            {activeExtraActivity} (Click to Cancel)
                        </button>
                    </div>
                )}
            </div>
         </div>

         <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 lg:pl-4 lg:border-l border-gray-200 lg:ml-2 pt-3 lg:pt-0 border-t lg:border-t-0 w-full lg:w-auto mt-2 lg:mt-0">
             {!hasCurrentWeekBookings && !loading && (
                 <button 
                     onClick={duplicatePreviousWeek}
                     className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap shadow-sm"
                 >
                     📋 Copy Last Week
                 </button>
             )}
             
             <div className="flex items-center gap-2">
                 <button onClick={() => setWeekOffset(prev => prev - 1)} className="p-2 hover:bg-gray-100 rounded-full text-lg font-bold">‹</button>
                 <span className="text-sm font-bold w-24 text-center">{weekDates[0].getDate()} - {weekDates[5].getDate()} {weekDates[5].toLocaleString('default', { month: 'short' })}</span>
                 <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-2 hover:bg-gray-100 rounded-full text-lg font-bold">›</button>
             </div>
             <div className="hidden md:block w-10 h-10 relative rounded-full overflow-hidden border border-gray-200"><Image src="/logo.jpg" alt="PTLab" fill className="object-cover" /></div>
         </div>
      </header>

      {showIntroPanel && (
        <div className="px-4 pb-2 animate-in fade-in slide-in-from-top-2">
          <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-200 flex gap-2 max-w-md items-center mt-2">
            <span className="text-xs font-bold text-gray-400">NEW INTRO PACK:</span>
            <input autoFocus className="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm outline-none" placeholder="Name..." value={introName} onChange={e => setIntroName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIntroClient()} />
            <button onClick={addIntroClient} className="px-4 py-2 text-white text-sm font-bold rounded-lg" style={{ backgroundColor: PTLAB.mainBlue }}>Add</button>
          </div>
        </div>
      )}

      {showRegularPanel && (
        <div className="px-4 pb-2 animate-in fade-in slide-in-from-top-2">
          <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-200 flex gap-2 max-w-md items-center mt-2">
            <span className="text-xs font-bold text-gray-400">NEW REGULAR PT:</span>
            <input autoFocus className="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm outline-none" placeholder="Name..." value={regularName} onChange={e => setRegularName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRegularClient()} />
            <button onClick={addRegularClient} className="px-4 py-2 text-white text-sm font-bold rounded-lg" style={{ backgroundColor: PTLAB.navy }}>Add</button>
          </div>
        </div>
      )}

      {showItaPanel && (
        <div className="px-4 pb-2 animate-in fade-in slide-in-from-top-2">
          <div className="bg-green-50 p-3 rounded-xl shadow-lg border border-green-200 flex gap-2 max-w-md items-center mt-2">
            <span className="text-xs font-bold text-green-700">NEW ITA JOB:</span>
            <input autoFocus className="flex-1 bg-white px-3 py-2 rounded-lg text-sm outline-none border border-green-100" placeholder="Job/Client Name..." value={itaName} onChange={e => setItaName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItaClient()} />
            <button onClick={addItaClient} className="px-4 py-2 text-white text-sm font-bold rounded-lg bg-green-600 hover:bg-green-700">Add</button>
          </div>
        </div>
      )}

      {showExtraPanel && (
        <div className="px-4 pb-2 animate-in fade-in slide-in-from-top-2">
          <div className="bg-yellow-50 p-3 rounded-xl shadow-lg border border-yellow-200 flex gap-2 max-w-md items-center mt-2">
            <span className="text-xs font-bold text-yellow-700">BOOKING EXTRA ({selected.size} slots):</span>
            <input autoFocus className="flex-1 bg-white px-3 py-2 rounded-lg text-sm outline-none border border-yellow-100" placeholder="e.g. Doctor, Meeting..." value={extraInput} onChange={e => setExtraInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && startExtraBooking()} />
            <button onClick={startExtraBooking} className="px-4 py-2 text-white text-sm font-bold rounded-lg bg-yellow-500 hover:bg-yellow-600">Save</button>
          </div>
        </div>
      )}

      <section className="flex-1 p-2 md:p-4 min-h-0 relative">
        <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto flex flex-col">
          <div className="min-w-[800px] flex flex-col h-full">
            <div className="grid grid-cols-[60px_repeat(6,1fr)] bg-white border-b border-gray-100 z-20 shrink-0">
                <div className="p-3"></div> 
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

            <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
                <div className="flex min-w-full" style={{ height: slots.length * SLOT_HEIGHT }}>
                    <div className="w-[60px] shrink-0 bg-white border-r border-gray-100 relative z-10">
                        {slots.map((t, i) => (
                            <div key={t} className="absolute w-full text-[11px] font-medium text-right pr-2 opacity-40 flex items-center justify-end" style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT, color: PTLAB.navy }}>
                                {t}
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 flex bg-white relative">
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
                                    
                                    if (clientType === 'ita_job') {
                                        bg = "#dcfce7";
                                        color = "#166534";
                                        blockBorder = "2px solid rgba(34, 197, 94, 0.6)";
                                    } else if (clientType === 'extra') {
                                        bg = "#fef08a";
                                        color = "#a16207";
                                        blockBorder = "2px solid #eab308";
                                    } else {
                                        bg = PTLAB.mainBlue; 
                                        color = "white"; 
                                        blockBorder = `1px solid ${PTLAB.mainBlue}`; 
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
                                            className="absolute w-full left-0 overflow-hidden flex items-center justify-center m-[0px] rounded-[3px] shadow-sm transition-all"
                                            style={{
                                                top: block.startIdx * SLOT_HEIGHT,
                                                height: block.span * SLOT_HEIGHT,
                                                backgroundColor: block.bg,
                                                border: block.blockBorder,
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
                                            className={`absolute w-full left-0 ${isMichelleActive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}`}
                                            style={{
                                                top: mBlock.startIdx * SLOT_HEIGHT,
                                                height: mBlock.span * SLOT_HEIGHT,
                                                backgroundColor: "rgba(239, 68, 68, 0.25)",
                                                border: "2px solid rgba(239, 68, 68, 0.6)",
                                                borderRadius: "3px",
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
        </div>

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
                    <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-2">
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