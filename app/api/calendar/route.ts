import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import ical from "ical-generator";

// --- CONFIG ---
// Set this to your gym's timezone to ensure 7am appears as 7am
const TIMEZONE = "Australia/Sydney"; 
const SESSION_DURATION_MINUTES = 45;

export async function GET() {
  try {
    // 1. Fetch all bookings and client names joined together
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select(`
        slot_key,
        clients (name)
      `);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // 2. Create the Calendar
    const calendar = ical({
      name: "PTLab QuickBook",
      timezone: TIMEZONE,
    });

    // 3. Convert Database Slots into Calendar Events
    bookings.forEach((b: any) => {
      // Parse "2026-01-20|07:00"
      const [dateStr, timeStr] = b.slot_key.split("|");
      
      // Create a Date object for the start time
      // We manually construct the ISO string to force the correct local time
      const start = new Date(`${dateStr}T${timeStr}:00`);
      
      const end = new Date(start.getTime() + SESSION_DURATION_MINUTES * 60000);

      // Add the event
      calendar.createEvent({
        start: start,
        end: end,
        summary: `PT: ${b.clients?.name || "Client"}`, // "PT: Sarah J."
        location: "PTLab Gym",
        // Optional: Add a "Busy" status so it blocks your calendar
        busystatus: "BUSY", 
      });
    });

    // 4. Return the file stream
    return new NextResponse(calendar.toString(), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ptlab-schedule.ics"',
      },
    });

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}