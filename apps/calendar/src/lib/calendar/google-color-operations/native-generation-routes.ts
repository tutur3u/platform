import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '../../workspace-encryption';
import { createRequestNativeGenerationService } from './native-generation-request-service';
import { unsupportedProviderSaga } from './provider-saga-routes';
import { operationFailure } from './route-handlers';

export async function handleRetainedNativeMutation(args: {
  request: Request;
  rawWsId: string;
  wsId: string;
  eventId: string;
  sbAdmin: TypedSupabaseClient;
  updates?: Record<string, unknown>;
}) {
  try {
    if (args.updates?.source || args.updates?.providerColor)
      return unsupportedProviderSaga();
    const service = createRequestNativeGenerationService(
      args.request,
      args.rawWsId,
      args.eventId
    );
    const generation = await service.inspect();
    if (!args.updates) {
      await service.delete(generation);
      return NextResponse.json({ message: 'Event deleted successfully' });
    }
    const patch = { ...args.updates };
    if (['title', 'description', 'location'].some((key) => key in patch)) {
      const { data, error } = await args.sbAdmin
        .from('workspace_calendar_events')
        .select('*')
        .eq('id', args.eventId)
        .eq('ws_id', args.wsId)
        .single();
      if (error || !data) return NextResponse.json({}, { status: 404 });
      const plain = await decryptEventFromStorage(data, args.wsId);
      const key = await getWorkspaceKey(args.wsId);
      if (!Buffer.isBuffer(key) || key.length !== 32)
        return unsupportedProviderSaga();
      Object.assign(
        patch,
        await encryptEventForStorage(
          args.wsId,
          {
            title: String(patch.title ?? plain.title ?? ''),
            description: String(patch.description ?? plain.description ?? ''),
            location: (patch.location ?? plain.location) as string | null,
          },
          key
        )
      );
    }
    await service.patch(generation, patch);
    const { data, error } = await args.sbAdmin
      .from('workspace_calendar_events')
      .select('*')
      .eq('id', args.eventId)
      .eq('ws_id', args.wsId)
      .single();
    if (error || !data) return NextResponse.json({}, { status: 404 });
    return NextResponse.json(await decryptEventFromStorage(data, args.wsId));
  } catch (error) {
    return operationFailure(error);
  }
}
