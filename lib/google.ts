import { google } from "googleapis";

// ==========================================
// 1. ROBOT EMAIL
// ==========================================
const ROBOT_EMAIL = "ptlab-bot@ptlab-booking-webapp.iam.gserviceaccount.com";

// ==========================================
// 2. PRIVATE KEY (Paste between backticks)
// ==========================================
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDEvTfKmPkaqWhL\nEbDJcteEoUm5MZR8zQowK5ZHCj0THQ2PWXhtZb6ioTrW8NVk8W2Dakfh9h7Fv+1b\nCdOjyzo4SD2sryefh0KeGz4yvH6nD+u69QrNhXQroh+Sm+D03DlWFP5NTG2twv7H\nOF6CtuLGM0HpagS38eMRFLQsF26ZwTzL3KXpgS6vKmKAX42u+V/yZuBuefbobOht\nHt12NeGa9eKpoZCGHZsMyxnBbX93P/PSV6uwe/aDx1Hecj5bhgFRGQ+YekGjjsWk\nR98dWGV+Z1v/K8XbRVhngCkCRh9dGQSkobA/WJhPbibb/xCAcKh4oPH+dnK8UfJL\nFJ0WFwRBAgMBAAECggEABJh6bIc6/2hQZTuELop6FhEp7pNlyW4FNEeaXq2yrEcA\nFXaEsYKAS956CEIPLAjXMuwJQpIcGSiw79DYkqGJSj4GwclEIs33LIgMoYUFbNva\neO8nKdKZmnjSpbsyK6oWxUffglj8EWRmDOuISqOgw7o4Co6lTlIuSIx8InEILnt6\nbkrea2VogtDKvZvQ9EDGmzttdu/TyRb9cod3uAABfcPESiz8DGx+BgoQacl0zezI\nANLsp9MbamZrw8tIkuYivIVYvxPkYH8JHtdyEId1XF0QjCDcfdH7VWHeCcIBzS36\nhnAcbNkJkM/TExgnb4yjT2fwb+CDw2V9lIgBTwdYiQKBgQDzGzFEyY9q+7RFxU/s\nHLuXrIYUw08WCZqskzR+rdSsR1qMMaaFQEC82+3M0k5WRvvEeUvlimy0E6f7ziF7\nwznYMmPVnSjaPQlxEyJ9xLiKFn5LUe5cYTwh1reuC9ju2mfEBDUSQIClcr46mk+G\nap4D/2G2rz9yQod0a5hNsCr0qQKBgQDPLHhXJsmgC3RY0qFWBBU2SNc1wOZSKHVg\nSDbgOFHooTf0ltRbU3wYcUXoT4cTYrZJNVBW7G1+ArOC7XZC7iHfOOgPVMfpOi3a\nMzJQZeTgY8Ne8ocosEiw5GdWDDiLre+SdIv+oyXjy5YAS5jqz8OoVVXqt4zZJqin\nTJs19BQ52QKBgQCSziD6gR1yZX1/hJ+23cMK3Mw7TZY8oKAfBuX0edSsFIrBjloY\nraxqYAVCYt2bjFINW5JRkz4BoL0YemoN6t7Lh+Jx5O3+nE1PU1bIzDsEaIDryxY+\nAxnk9V0GZXEjDBENddz2oK0PPDNUAEt1yHyTvWysfTe7MCHMVA0tHO1TwQKBgQC2\nkGGbqzqSJoXon/Q8cGyg4Z+EZvCQBccpiXmSLQ9BCJDeoOuRbwg0Id2Q0kQd+SbZ\nbHnXn5D9MjQudEN6x45hvywAFp30EKjHV8ZGwwPmGQPZb69bU7065IuLcEmEDUrI\nrJuRUQPasVUF/ZhLk7q/ZDPKGuWrlj2Y8BD2gpgwQQKBgQC+gfEA9Jkr12qEOW9Q\nLZfaxJWrElENcIf2zxPq7HiCFrUj4a5BtcBRArxIOI98KhnSHPK8ThCFyitGGivU\n2XQKy2hz+l+NHbRZ7Gy7F/wp2Sq6usgRmx6Ojzv4p5betkj6uZxBaGYWnIuOhI4/\nuDePhGrNHdeMs4/H0f0M09PYJA==\n-----END PRIVATE KEY-----\n"`;

// ==========================================
// 3. CALENDAR ID
// ==========================================
const CALENDAR_IDS = "protraininglab84@gmail.com"; 

// ==========================================
// LOGIC (Updated for DETAILS)
// ==========================================

const CLEAN_KEY = PRIVATE_KEY.replace(/\\n/g, '\n').trim();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: ROBOT_EMAIL,
    private_key: CLEAN_KEY,
  },
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

function getCalendarIds() {
  return CALENDAR_IDS.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}

// FETCH EVENTS WITH TITLES
export async function getBusySlots(start: Date, end: Date) {
  try {
    const calendarIds = getCalendarIds();
    const client = await auth.getClient();
    
    const allEvents: any[] = [];

    // Loop through all calendars and get real event details
    const promises = calendarIds.map(async (calId) => {
      try {
        const res = await calendar.events.list({
          // @ts-ignore
          auth: client,
          calendarId: calId,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: true, // Expands recurring events (like weekly meetings)
          orderBy: 'startTime',
        });
        
        const items = res.data.items || [];
        // We map them to a simple format for our app
        const cleanItems = items.map(item => ({
            start: item.start?.dateTime || item.start?.date, // Handle all-day events too
            end: item.end?.dateTime || item.end?.date,
            title: item.summary || "Busy", // Get the Title!
        }));

        allEvents.push(...cleanItems);
      } catch (err) {
        console.error(`Failed to fetch events from ${calId}`, err);
      }
    });

    await Promise.all(promises);
    return allEvents;
    
  } catch (error: any) {
    console.error("⚠️ Google Sync Failed:", error.message);
    return []; 
  }
}

// ADD EVENT (No changes needed here, but included for completeness)
export async function addGoogleEvent(clientName: string, startTime: string) {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + 45 * 60000); 
  const calendarIds = getCalendarIds();
  const client = await auth.getClient();

  const promises = calendarIds.map(async (calId) => {
    try {
      await calendar.events.insert({
        // @ts-ignore
        auth: client,
        calendarId: calId,
        requestBody: {
          summary: `PT: ${clientName}`,
          location: "PTLab Gym",
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        },
      });
      console.log(`✅ Success: Added to ${calId}`);
    } catch (error) {
      console.error(`❌ Failed to add to ${calId}:`, error);
    }
  });

  await Promise.all(promises);
}
// ==========================================
// DELETE EVENT FROM GOOGLE (Upgraded)
// ==========================================
export async function deleteGoogleEvent(searchTitle: string, startTime: string) {
  const start = new Date(startTime);
  const calendarIds = getCalendarIds();
  const client = await auth.getClient();

  const promises = calendarIds.map(async (calId) => {
    try {
      // Look 15 mins before and 60 mins after to guarantee we catch it
      const res = await calendar.events.list({
        // @ts-ignore
        auth: client,
        calendarId: calId,
        timeMin: new Date(start.getTime() - 15 * 60000).toISOString(), 
        timeMax: new Date(start.getTime() + 60 * 60000).toISOString(), 
        q: searchTitle, // Find the exact title
        singleEvents: true,
      });

      const events = res.data.items || [];
      if (events.length > 0) {
        await calendar.events.delete({
          // @ts-ignore
          auth: client,
          calendarId: calId,
          eventId: events[0].id!,
        });
        console.log(`🗑️ Deleted from Google: ${events[0].summary}`);
      }
    } catch (error) {
      console.error(`❌ Failed to delete from ${calId}:`, error);
    }
  });

  await Promise.all(promises);
}