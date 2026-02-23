import { NextRequest, NextResponse } from "next/server";
import { getBusySlots, addGoogleEvent, deleteGoogleEvent } from "@/lib/google"; 

// 1. GET: Fetch Busy Slots from Google
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) return NextResponse.json({ error: "Missing dates" }, { status: 400 });

    const busySlots = await getBusySlots(new Date(start), new Date(end));
    return NextResponse.json(busySlots);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: Add a New Booking to Google
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slotKey, clientName } = body;

    if (!slotKey || !clientName) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const [dateStr, timeStr] = slotKey.split("|");
    const startTime = `${dateStr}T${timeStr}:00`; 

    await addGoogleEvent(clientName, startTime);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 3. DELETE: Cancel a Booking in Google
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { slotKey, clientName } = body;

    if (!slotKey || !clientName) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const [dateStr, timeStr] = slotKey.split("|");
    const startTime = `${dateStr}T${timeStr}:00`; 

    await deleteGoogleEvent(clientName, startTime);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}