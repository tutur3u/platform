import { expect, it, vi } from 'vitest';
import { mailDisplayName } from '../address-names';
import { loadDamagedAddressHeaders } from './address-headers';

it('avoids additional queries for intact participant names', async () => {
  const admin = { schema: vi.fn() };
  expect(
    await loadDamagedAddressHeaders(
      admin,
      [{ id: 'a', from_name: 'Khánh Hà', raw_message_id: 'raw' }],
      new Map()
    )
  ).toEqual(new Map());
  expect(admin.schema).not.toHaveBeenCalled();
});
it('batches damaged visible participant headers and recovers matching names', async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'raw',
          raw_headers: {
            From: '=?UTF-8?Q?Kh=E1nh_H=E0?= <k@example.com>',
            'X-Private': 'excluded',
          },
        },
      ],
      error: null,
    }),
  };
  const admin = { schema: () => ({ from: () => query }) };
  const headers = await loadDamagedAddressHeaders(
    admin,
    [
      { id: 'a', from_name: 'Kh�nh H�', raw_message_id: 'raw' },
      { id: 'b', from_name: 'Healthy', raw_message_id: 'other' },
    ],
    new Map()
  );
  expect(query.in).toHaveBeenCalledWith('id', ['raw']);
  expect(
    mailDisplayName('Kh�nh H�', 'k@example.com', headers.get('raw')?.from)
  ).toBe('Khánh Hà');
  expect(headers.get('raw')).not.toHaveProperty('X-Private');
});
it('also recovers damaged outbound recipient names', async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  await loadDamagedAddressHeaders(
    { schema: () => ({ from: () => query }) },
    [{ id: 'sent', from_name: 'Sender', raw_message_id: 'raw' }],
    new Map([['sent', [{ display_name: 'Kh�nh H�' }]]])
  );
  expect(query.in).toHaveBeenCalledWith('id', ['raw']);
});

it('recovers null names and bounds raw-header requests', async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  await loadDamagedAddressHeaders(
    { schema: () => ({ from: () => query }) },
    Array.from({ length: 201 }, (_, index) => ({
      id: `${index}`,
      from_name: null,
      raw_message_id: `raw-${index}`,
    })),
    new Map()
  );
  expect(query.in.mock.calls.map((call) => call[1].length)).toEqual([
    100, 100, 1,
  ]);
});
