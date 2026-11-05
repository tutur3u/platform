import { Y } from '../../../../packages/realtime/src/collaboration/server';
import type { PersistedErase } from '../../src/channel-document-erase';
import {
  ChannelRoomDurableObject,
  type ChannelRoomEnv,
} from '../../src/channel-room-do';
export class EraseFixture {
  constructor(
    private ctx: DurableObjectState,
    private env: ChannelRoomEnv
  ) {}
  async alarm() {}
  async fetch(request: Request) {
    const action = new URL(request.url).pathname;
    if (action === '/seed') {
      const doc = new Y.Doc();
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, 'erase fixture');
      paragraph.insert(0, [text]);
      doc.getXmlFragment('prosemirror').insert(0, [paragraph]);
      await this.ctx.storage.put({
        document: Y.encodeStateAsUpdate(doc),
        metadata: {
          topic: 'meeting-document-11111111-1111-4111-8111-111111111111',
          documentId: '22222222-2222-4222-8222-222222222222',
          ownerId: '33333333-3333-4333-8333-333333333333',
          version: 0,
          checkpointAt: 0,
        },
      });
      doc.destroy();
      return Response.json({ ok: true });
    }
    if (action === '/wipe') {
      await this.ctx.storage.deleteAll();
      return Response.json({ ok: true });
    }
    if (action === '/expire') {
      const erase = await this.ctx.storage.get<PersistedErase>('erase');
      if (erase?.freeze) {
        erase.freeze.lease_exp = Date.now() - 1;
        await this.ctx.storage.put('erase', erase);
      }
      return Response.json({ ok: true });
    }
    if (action === '/alarm') {
      await new ChannelRoomDurableObject(this.ctx, this.env).alarm();
      return Response.json({ ok: true });
    }
    if (action === '/inspect')
      return Response.json(Object.fromEntries(await this.ctx.storage.list()));
    // Reconstruct from real SQLite for every request, including each protocol step.
    return new ChannelRoomDurableObject(this.ctx, this.env).fetch(request);
  }
}
export default {
  fetch(request: Request, env: { ROOM: DurableObjectNamespace }) {
    return env.ROOM.get(env.ROOM.idFromName('fixture')).fetch(request);
  },
};
