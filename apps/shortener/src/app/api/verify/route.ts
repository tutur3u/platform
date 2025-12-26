import { createAdminClient } from '@tuturuuu/supabase/next/server';
import bcrypt from 'bcrypt';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

interface VerifyRequest {
  linkId: string;
  slug: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();
    const { linkId, slug, password } = body;

    if (!linkId || !password) {
      return NextResponse.json(
        { error: 'Link ID and password are required' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Get the link with password hash
    const { data: link, error: fetchError } = await sbAdmin
      .from('shortened_links')
      .select('id, link, password_hash')
      .eq('id', linkId)
      .single();

    if (fetchError || !link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    if (!link.password_hash) {
      // Link is not password protected, redirect directly
      return NextResponse.json({ url: link.link });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, link.password_hash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 403 }
      );
    }

    // Track analytics on successful password verification
    try {
      const headersList = await headers();

      const userAgent = headersList.get('user-agent') || '';
      const referrer =
        headersList.get('referer') || headersList.get('referrer') || '';
      const forwarded = headersList.get('x-forwarded-for');
      const realIp = headersList.get('x-real-ip');
      const ipAddress = forwarded?.split(',')[0]?.trim() || realIp || '';

      // Vercel geolocation headers
      const country = headersList.get('x-vercel-ip-country') || '';
      const countryRegion = headersList.get('x-vercel-ip-country-region') || '';
      const city = headersList.get('x-vercel-ip-city') || '';
      const latitude = headersList.get('x-vercel-ip-latitude');
      const longitude = headersList.get('x-vercel-ip-longitude');
      const timezone = headersList.get('x-vercel-ip-timezone') || '';
      const postalCode = headersList.get('x-vercel-ip-postal-code') || '';
      const vercelId = headersList.get('x-vercel-id') || '';
      const vercelRegion = vercelId.split('::')[0] || '';

      const lat = latitude ? parseFloat(latitude) : null;
      const lng = longitude ? parseFloat(longitude) : null;

      await sbAdmin.from('link_analytics').insert({
        link_id: link.id,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        referrer: referrer || null,
        country: country || null,
        country_region: countryRegion || null,
        city: city || null,
        latitude: lat,
        longitude: lng,
        timezone: timezone || null,
        postal_code: postalCode || null,
        vercel_region: vercelRegion || null,
        vercel_id: vercelId || null,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('Password-protected link analytics tracked:', {
          slug,
          country,
          city,
        });
      }
    } catch (analyticsError) {
      // Don't fail the request if analytics fails
      console.error('Failed to track analytics:', analyticsError);
    }

    return NextResponse.json({ url: link.link, success: true });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
