//* EXTERNAL MAPPING

interface MappingItem {
  id?: string;
  name?: string;
  email?: string;
  user_id?: string;
  bill_id?: string;
  class_id?: string;
  package_id?: string;
  score_id?: string;
  coupon_id?: string;
  report_id?: string;
  pkg_id?: string;
  method?: string;
  status?: string;
  reason?: string;
  [key: string]: unknown;
}

// STATUS: ✅
export const billCouponsMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      _id: item?.id,
      invoice_id: item?.bill_id,
      promo_id: item?.coupon_id,
      code: item?.code,
      name: item?.name,
      value: item?.value,
      use_ratio: item?.use_ratio,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const billPackagesMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      _id: item?.id,
      invoice_id: item?.bill_id,
      product_id: item?.package_id,
      product_name: item?.name,
      product_unit: item?.product_unit || 'piece',
      unit_id: item?.unit_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      warehouse_id:
        item?.warehouse_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      amount: item?.amount,
      price: item?.price,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const billsMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    const walletId =
      item?.method === 'CASH'
        ? 'dbd4d6a0-6c59-4383-8512-8e649413f4ff'
        : item?.wallet_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff';

    const categoryId =
      item?.type === 'TUITION'
        ? '54f92acb-83c1-4755-a3d8-6a918f91880c'
        : item?.type === 'COURSE'
          ? '8f4136cf-08d4-4fb5-b075-377e3f664021'
          : item?.type === 'LESSON'
            ? '93a2a5c4-d518-4ef1-9a3d-3722a794070a'
            : item?.type === 'ACCESSORY'
              ? 'b4662d35-603a-4fd3-8193-ba88d80ff2ef'
              : item?.type === 'BOOK'
                ? 'a1377214-23a3-4fb4-83ed-379c7330f045'
                : item?.type === 'EVENT'
                  ? '0fe626f5-2ce7-405c-a545-4b90649d9aa1'
                  : null;

    return {
      id: item?.id,
      wallet_id: walletId,
      price: item?.price,
      paid_amount: item?.paid_amount,
      total_diff: item?.total_diff,
      notice: item?.notice,
      note: item?.note,
      customer_id: item?.customer_id,
      user_group_id: item?.class_id,
      category_id: categoryId,
      completed_at: item?.created_at,
      creator_id: item?.creator_id,
      ws_id: wsId,
      valid_until: item?.valid_until,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const classAttendanceMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      group_id: item?.class_id,
      user_id: item?.user_id,
      date: item?.date,
      status: item?.status,
      notes: item?.notes || '',
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const classMembersMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      user_id: item?.user_id,
      group_id: item?.class_id,
      role: item?.role,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const classPackagesMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      group_id: item?.class_id,
      product_id: item?.package_id,
      unit_id: item?.unit_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const classScoresMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      user_id: item?.user_id,
      indicator_id: item?.score_id,
      group_id: item?.class_id,
      value: item?.value,
      creator_id: item?.creator_id,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const classesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.code,
      ws_id: wsId,
      notes: `${item?.mode ? `Mode: ${item.mode}\n` : ''}${item?.location ? `Location: ${item.location}\n` : ''}${item?.syllabus ? `Syllabus: ${item.syllabus}\n` : ''}${item?.notes ? `Notes: ${item.notes}\n` : ''}`,
      starting_date: item?.starting_date,
      ending_date: item?.ending_date,
      sessions: item?.sessions,
      archived: item?.status === 'COMPLETED',
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const couponsMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.content,
      code: item?.code,
      value: item?.value,
      use_ratio: item?.use_ratio,
      ws_id: wsId,
      creator_id: item?.creator_id,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const lessonsMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      group_id: item?.class_id,
      title: item?.title || '',
      content: item?.content || '',
      notes: item?.notes || '',
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const packageStockChangesMapping = (_: string, data: unknown[]) => {
  console.log('packageStockChangesMapping', data);
  return data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      product_id: item?.pkg_id,
      unit_id: item?.unit_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      warehouse_id:
        item?.warehouse_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      amount: item?.amount,
      type: item?.type || 'IN',
      reason: item?.reason || 'Migration',
      created_at: item?.created_at,
    };
  });
};

// STATUS: ✅
export const packagesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.content,
      avatar_url: item?.avatar_url,
      category_id: item?.category_id || 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      manufacturer: item?.manufacturer,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const paymentMethodsMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const rolesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const scoreNamesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const groupedScoreNamesMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      indicator_id: item?.id,
      group_id: item?.class_id,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const studentFeedbacksMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      user_id: item?.user_id,
      group_id: item?.class_id,
      content: item?.content,
      rating: item?.rating,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const transactionCategoriesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const userCouponsMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      user_id: item?.user_id,
      promo_id: item?.coupon_id,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const userMonthlyReportLogsMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      report_id: item?.report_id,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const userMonthlyReportsMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      user_id: item?.user_id,
      month: item?.month,
      year: item?.year,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const userStatusChangesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      user_id: item?.user_id,
      status: item?.status,
      reason: item?.reason,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const usersMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      email: item?.email || null,
      first_name: item?.first_name || null,
      last_name: item?.last_name || null,
      phone: item?.phone || null,
      avatar_url: item?.avatar_url || null,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

//! IGNORED, since it's handled by bills
export const walletTransactionsMapping = (__: string, _: unknown[]) =>
  [] as unknown[];
// data.map((i) => {
//   // There is a "valid_until" field on item, which is type of date
//   // convert it to timestamptz (+7) and use it as "taken_at" field
//   const takenAt = i?.valid_until ? new Date(i?.valid_until) : null;

//   return {
//     id: generateUUID(i?.id, i?.wallet_id),
//     wallet_id: i?.wallet_id,
//     amount: i?.total + i?.price_diff,
//     description: i?.content,
//     category_id: i?.category_id,
//     taken_at: takenAt ? takenAt.toISOString() : i?.created_at,
//     created_at: i?.created_at,
//     _id: i?.id,
//   };
// });

//! IGNORED, since it's handled by payment methods
export const walletsMapping = (_: string, __: unknown[]) => [];

//* TUTURUUU INFRASTRUCTURE MAPPING

// STATUS: ✅
export const warehousesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const productCategoriesMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const productUnitsMapping = (wsId: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      id: item?.id,
      name: item?.name,
      description: item?.description,
      ws_id: wsId,
      created_at: item?.created_at,
    };
  });

// STATUS: ✅
export const productPricesMapping = (_: string, data: unknown[]) =>
  data.map((i: unknown) => {
    const item = i as MappingItem;
    return {
      product_id: item?.id,
      unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
      price: item?.price,
      created_at: item?.created_at,
    };
  });
