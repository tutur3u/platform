// import { api as polarAdmin } from '@/lib/polar-admin';
// // Assuming you have a polar admin client
// import { createAdminClient } from '@tuturuuu/supabase/next/server';
// import { NextRequest, NextResponse } from 'next/server';

// const CRON_SECRET = process.env.CRON_SECRET;

// export async function GET(request: NextRequest) {
//   const authHeader = request.headers.get('authorization');
//   if (authHeader !== `Bearer ${CRON_SECRET}`) {
//     return new Response('Unauthorized', { status: 401 });
//   }

//   console.log('Starting daily seat sync job...');
//   const supabase = await createAdminClient();

//   // 1. Get all active subscriptions from your database
//   // Note: We select polar_customer_id to identify the customer to Polar
//   const { data: activeSubscriptions, error } = await supabase
//     .from('workspace_subscription')
//     .select('ws_id, polar_customer_id')
//     .eq('status', 'active');

//   if (error) {
//     console.error('Cron Job: Could not fetch active subscriptions', error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }

//   // 2. Loop through each subscription
//   for (const sub of activeSubscriptions) {
//     // Skip if essential data is missing
//     if (!sub.polar_customer_id || !sub.ws_id) continue;

//     // 3. Count the total users for that specific workspace
//     const { count: userCount, error: countError } = await supabase
//       .from('workspace_users') // IMPORTANT: Assumes you have a 'workspace_users' table
//       .select('*', { count: 'exact', head: true })
//       .eq('ws_id', sub.ws_id);

//     if (countError) {
//       console.error(
//         `Cron Job: Could not count users for workspace ${sub.ws_id}`,
//         countError
//       );
//       continue; // Skip to the next subscription
//     }

//     // 4. Report the total count to your Polar Meter
//     try {
//       await polarAdmin.events.ingest({
//         events: [
//           {
//             name: 'workspace.seats.sync', // The Event Name you configured in your Meter
//             customer_id: sub.polar_customer_id,
//             metadata: {
//               seat_count: userCount ?? 0, // The Property Name you configured
//             },
//           },
//         ],
//       });
//       console.log(`Reported ${userCount} seats for workspace ${sub.ws_id}`);
//     } catch (e) {
//       console.error(
//         `Cron Job: Failed to report usage for ${sub.ws_id}`,
//         e instanceof Error ? e.message : e
//       );
//     }
//   }

//   console.log('Daily seat sync job finished successfully.');
//   return NextResponse.json({
//     success: true,
//     processed: activeSubscriptions.length,
//   });
// }
